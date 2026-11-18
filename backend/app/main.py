from __future__ import annotations
import os, json, uuid, shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped, sessionmaker, Session, relationship
from PIL import Image, ImageDraw
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
STORAGE = ROOT / "storage"; STORAGE.mkdir(exist_ok=True)
MODEL_FILE = ROOT / "models" / "best_roboflow_4class.pt"
CLASS_NAMES = ["Fillings", "Impacted Tooth", "Implant", "Cavity"]
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'dental.db'}")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True); email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password: Mapped[str] = mapped_column(String); role: Mapped[str] = mapped_column(String, default="dentist")
class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True); name: Mapped[str] = mapped_column(String)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True); gender: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True); notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    scans: Mapped[list["Scan"]] = relationship(back_populates="patient", cascade="all, delete-orphan")
class Scan(Base):
    __tablename__ = "scans"
    id: Mapped[int] = mapped_column(primary_key=True); patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    original_path: Mapped[str] = mapped_column(String); annotated_path: Mapped[str] = mapped_column(String)
    findings: Mapped[str] = mapped_column(Text); model_name: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    patient: Mapped[Patient] = relationship(back_populates="scans")
Base.metadata.create_all(engine)

app = FastAPI(title="Dental Disease Detection API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto"); oauth = OAuth2PasswordBearer(tokenUrl="/auth/login")
SECRET = os.getenv("JWT_SECRET", "dev-only-change-me"); ALG = "HS256"
def db_dep():
    db = SessionLocal()
    try: yield db
    finally: db.close()
def token_for(user: User): return jwt.encode({"sub": str(user.id), "exp": datetime.now(timezone.utc)+timedelta(hours=12)}, SECRET, algorithm=ALG)
def current_user(token: str = Depends(oauth), db: Session = Depends(db_dep)):
    try: uid = int(jwt.decode(token, SECRET, algorithms=[ALG])["sub"])
    except (JWTError, ValueError, KeyError): raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, uid)
    if not user: raise HTTPException(401, "User no longer exists")
    return user
class Credentials(BaseModel): email: str; password: str = Field(min_length=8)
class PatientIn(BaseModel): name: str; age: Optional[int]=None; gender: Optional[str]=None; phone: Optional[str]=None; notes: Optional[str]=None
class PatientOut(PatientIn):
    id: int; created_at: datetime
    model_config = ConfigDict(from_attributes=True)
def load_detector():
    global detector, detector_name
    detector=None; detector_name=MODEL_FILE.name
    try:
        from ultralytics import YOLO
        detector=YOLO(str(MODEL_FILE))
        model_names=getattr(detector,"names",{})
        model_names=[str(model_names[k]) for k in sorted(model_names,key=int)] if isinstance(model_names,dict) else list(map(str,model_names))
        if [n.casefold() for n in model_names] != [n.casefold() for n in CLASS_NAMES]:
            raise RuntimeError(f"Checkpoint classes {model_names} do not match the configured Roboflow classes {CLASS_NAMES}")
        # The checkpoint spells the final class lowercase; normalize its display label.
        detector.model.names={i:name for i,name in enumerate(CLASS_NAMES)}
    except Exception as e:
        detector=None
        print(f"Could not load {MODEL_FILE}: {e}")
load_detector()
def names_map():
    names=getattr(detector, "names", {}) if detector else {}
    values={int(k):str(v) for k,v in names.items()} if isinstance(names,dict) else {i:str(v) for i,v in enumerate(names)}
    return {i:CLASS_NAMES[i] for i in values if 0 <= i < len(CLASS_NAMES)}
@app.get("/health")
def health(): return {"status":"ok", "model_loaded": detector is not None}
@app.post("/auth/register")
def register(payload: Credentials, db: Session=Depends(db_dep)):
    if db.query(User).filter_by(email=payload.email.lower()).first(): raise HTTPException(409,"Email already registered")
    user=User(email=payload.email.lower(), password=pwd.hash(payload.password), role="dentist"); db.add(user); db.commit(); db.refresh(user)
    return {"access_token":token_for(user),"token_type":"bearer","user":{"id":user.id,"email":user.email,"role":user.role}}
@app.post("/auth/login")
def login(payload: Credentials, db: Session=Depends(db_dep)):
    user=db.query(User).filter_by(email=payload.email.lower()).first()
    if not user or not pwd.verify(payload.password,user.password): raise HTTPException(401,"Incorrect email or password")
    return {"access_token":token_for(user),"token_type":"bearer","user":{"id":user.id,"email":user.email,"role":user.role}}
def patient_dict(p): return {"id":p.id,"name":p.name,"age":p.age,"gender":p.gender,"phone":p.phone,"notes":p.notes,"created_at":p.created_at.isoformat()}
@app.post("/patients")
def create_patient(data: PatientIn, db: Session=Depends(db_dep), _:User=Depends(current_user)):
    p=Patient(**data.model_dump()); db.add(p); db.commit(); db.refresh(p); return patient_dict(p)
@app.get("/patients")
def list_patients(db:Session=Depends(db_dep), _:User=Depends(current_user)): return [patient_dict(p) for p in db.query(Patient).order_by(Patient.created_at.desc()).all()]
@app.get("/patients/{pid}")
def get_patient(pid:int, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    p=db.get(Patient,pid)
    if not p: raise HTTPException(404,"Patient not found")
    return patient_dict(p)
@app.put("/patients/{pid}")
def update_patient(pid:int, data:PatientIn, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    p=db.get(Patient,pid)
    if not p: raise HTTPException(404,"Patient not found")
    for k,v in data.model_dump().items(): setattr(p,k,v)
    db.commit(); db.refresh(p); return patient_dict(p)
@app.delete("/patients/{pid}")
def delete_patient(pid:int, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    p=db.get(Patient,pid)
    if not p: raise HTTPException(404,"Patient not found")
    db.delete(p); db.commit(); return {"ok":True}
def persist_upload(file: UploadFile):
    if file.content_type not in ("image/jpeg","image/png"): raise HTTPException(415,"Upload a JPG or PNG image")
    raw=file.file.read(15*1024*1024+1)
    if len(raw)>15*1024*1024: raise HTTPException(413,"Image exceeds 15 MB")
    try:
        import io
        im=Image.open(io.BytesIO(raw)); im.verify(); im=Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception: raise HTTPException(400,"Invalid image file")
    ext=".png" if file.content_type=="image/png" else ".jpg"; key=uuid.uuid4().hex
    src=STORAGE/f"{key}_original{ext}"; im.save(src); return im,src,key
def run_detection(im, conf):
    if detector is None: raise HTTPException(503,f"The configured model {MODEL_FILE.name} is unavailable.")
    try:
        result=detector.predict(im, conf=conf, verbose=False)[0]; names=names_map(); boxes=[]
        for b in result.boxes:
            x1,y1,x2,y2=[float(v) for v in b.xyxy[0].tolist()]; cls=int(b.cls[0]); boxes.append({"label":names.get(cls,str(cls)),"confidence":float(b.conf[0]),"x1":x1,"y1":y1,"x2":x2,"y2":y2})
        return boxes
    except HTTPException: raise
    except Exception as e: raise HTTPException(500,f"Inference failed: {e}")
def annotate(im, boxes, out):
    draw=ImageDraw.Draw(im)
    for b in boxes:
        draw.rectangle((b["x1"],b["y1"],b["x2"],b["y2"]),outline="#00c8aa",width=max(2,im.width//500)); draw.text((b["x1"],max(0,b["y1"]-16)),f"{b['label']} {b['confidence']:.2f}",fill="#00c8aa")
    im.save(out)
@app.post("/detect")
def detect(file:UploadFile=File(...), conf:float=Query(.25,ge=0,le=1), _:User=Depends(current_user)):
    im,src,key=persist_upload(file); boxes=run_detection(im,conf); out=STORAGE/f"{key}_annotated.png"; annotate(im.copy(),boxes,out)
    return {"boxes":boxes,"image_width":im.width,"image_height":im.height,"model_name":detector_name,"original_url":f"/files/{src.name}","annotated_url":f"/files/{out.name}"}
@app.get("/files/{name}")
def get_file(name:str, _:User=Depends(current_user)):
    p=(STORAGE/name).resolve()
    if p.parent!=STORAGE.resolve() or not p.is_file(): raise HTTPException(404,"File not found")
    return FileResponse(p)
def scan_dict(s):
    return {"id":s.id,"patient_id":s.patient_id,"created_at":s.created_at.isoformat(),"findings":json.loads(s.findings),"model_name":s.model_name,"original_url":f"/files/{Path(s.original_path).name}","annotated_url":f"/files/{Path(s.annotated_path).name}"}
@app.post("/patients/{pid}/scans")
def save_scan(pid:int, payload:dict, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    if not db.get(Patient,pid): raise HTTPException(404,"Patient not found")
    boxes=payload.get("boxes",[]); src=Path(payload.get("original_path", "")); ann=Path(payload.get("annotated_path", ""))
    # Browser result URLs refer to files in storage; validate basenames before saving.
    src=(STORAGE/src.name).resolve(); ann=(STORAGE/ann.name).resolve()
    if src.parent!=STORAGE.resolve() or ann.parent!=STORAGE.resolve() or not src.exists() or not ann.exists(): raise HTTPException(400,"Detection images are missing; analyze the image again")
    s=Scan(patient_id=pid,original_path=str(src),annotated_path=str(ann),findings=json.dumps(boxes),model_name=str(payload.get("model_name",detector_name))); db.add(s); db.commit(); db.refresh(s); return scan_dict(s)
@app.get("/patients/{pid}/scans")
def patient_scans(pid:int, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    if not db.get(Patient,pid): raise HTTPException(404,"Patient not found")
    return [scan_dict(s) for s in db.query(Scan).filter_by(patient_id=pid).order_by(Scan.created_at.desc()).all()]
@app.get("/scans/{sid}")
def get_scan(sid:int, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    s=db.get(Scan,sid)
    if not s: raise HTTPException(404,"Scan not found")
    return scan_dict(s)
@app.delete("/scans/{sid}")
def delete_scan(sid:int, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    s=db.get(Scan,sid)
    if not s: raise HTTPException(404,"Scan not found")
    db.delete(s); db.commit(); return {"ok":True}
@app.get("/model-info")
def model_info(_:User=Depends(current_user)):
    metrics=ROOT/"reports"/"metrics.json"; summary=json.loads(metrics.read_text()) if metrics.exists() else None
    return {"class_names":list(names_map().values()),"model_path":str(MODEL_FILE),"model_name":detector_name,"loaded":detector is not None,"metrics":summary}
@app.get("/dashboard")
def dashboard(db:Session=Depends(db_dep), _:User=Depends(current_user)):
    recent=db.query(Scan).order_by(Scan.created_at.desc()).limit(5).all()
    return {"patients":db.query(Patient).count(),"scans":db.query(Scan).count(),"recent_scans":[scan_dict(s) for s in recent]}
@app.get("/scans/{sid}/report.pdf")
def report(sid:int, db:Session=Depends(db_dep), _:User=Depends(current_user)):
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RImage, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    s=db.get(Scan,sid)
    if not s: raise HTTPException(404,"Scan not found")
    p=s.patient; out=STORAGE/f"report_{sid}.pdf"; doc=SimpleDocTemplate(str(out),pagesize=letter); styles=getSampleStyleSheet(); story=[Paragraph("Dental Imaging Review",styles["Title"]),Paragraph("Decision-support tool only — not a diagnosis. Findings require review by a qualified dentist.",styles["Normal"]),Spacer(1,12),Paragraph(f"Patient: {p.name} | Age: {p.age or '—'} | Gender: {p.gender or '—'}",styles["Normal"]),Paragraph(f"Date: {s.created_at:%Y-%m-%d %H:%M UTC} | Model: {s.model_name}",styles["Normal"]),Spacer(1,12)]
    if Path(s.annotated_path).exists(): story.append(RImage(s.annotated_path,width=450,height=280,kind="proportional")); story.append(Spacer(1,12))
    boxes=json.loads(s.findings); counts={}
    for b in boxes: counts.setdefault(b["label"],[]).append(b["confidence"])
    rows=[["Class","Count","Mean confidence"]]+[[k,str(len(v)),f"{sum(v)/len(v):.1%}"] for k,v in counts.items()]
    if len(rows)==1: rows.append(["No detections", "0", "—"])
    t=Table(rows); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#d7f3ef")),("GRID",(0,0),(-1,-1),.5,colors.grey),("PADDING",(0,0),(-1,-1),6)])); story += [Paragraph("Findings",styles["Heading2"]),t]
    met=ROOT/"reports"/"metrics.json"
    if met.exists():
        m=json.loads(met.read_text()); story += [Spacer(1,12),Paragraph(f"Model evaluation summary (test split): mAP50 {m.get('map50','N/A')}, mAP50-95 {m.get('map50_95','N/A')}, precision {m.get('precision','N/A')}, recall {m.get('recall','N/A')}.",styles["Normal"])]
    doc.build(story); return FileResponse(out,media_type="application/pdf",filename=f"dental-scan-{sid}.pdf")
