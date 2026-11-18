from pathlib import Path
import requests

base = "http://127.0.0.1:8000"
s = requests.Session()
assert s.get(base + "/health", timeout=20).json()["status"] == "ok"
email = "integration-test@example.com"
r = s.post(base + "/auth/register", json={"email": email, "password": "Integration-Strong-123"}, timeout=60)
if r.status_code == 409:
    r = s.post(base + "/auth/login", json={"email": email, "password": "Integration-Strong-123"}, timeout=60)
r.raise_for_status()
s.headers["Authorization"] = "Bearer " + r.json()["access_token"]
p = s.post(base + "/patients", json={"name": "API Integration Patient", "age": 35, "gender": "Not specified", "notes": "Automated API verification"}, timeout=30)
p.raise_for_status(); patient_id = p.json()["id"]
images = sorted((Path("data/dental/images/test")).glob("*"))
assert images, "No image found in test split"
with images[0].open("rb") as f:
    d = s.post(base + "/detect?conf=0.10", files={"file": (images[0].name, f, "image/jpeg")}, timeout=120)
d.raise_for_status(); detection = d.json()
assert detection["image_width"] > 0 and detection["image_height"] > 0
saved = s.post(base + f"/patients/{patient_id}/scans", json={"boxes": detection["boxes"], "model_name": detection["model_name"], "original_path": detection["original_url"], "annotated_path": detection["annotated_url"]}, timeout=30)
saved.raise_for_status(); scan = saved.json()
report = s.get(base + f"/scans/{scan['id']}/report.pdf", timeout=60)
report.raise_for_status(); assert report.content.startswith(b"%PDF")
Path("storage/smoke-report.pdf").write_bytes(report.content)
print({"health": "ok", "auth": "ok", "patient_id": patient_id, "sample": images[0].name, "model": detection["model_name"], "fallback": detection["using_fallback"], "detections": len(detection["boxes"]), "scan_id": scan["id"], "pdf_bytes": len(report.content), "pdf": "storage/smoke-report.pdf"})
