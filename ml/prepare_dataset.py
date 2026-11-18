"""Normalize common YOLO/COCO/VOC/CSV annotation layouts and split 80/10/10."""
from pathlib import Path
import random, shutil, json, csv, xml.etree.ElementTree as ET
from collections import Counter
import yaml
ROOT=Path(__file__).resolve().parents[1]; RAW=ROOT/"data"/"raw"; OUT=ROOT/"data"/"dental"
IMG_EXT={".jpg",".jpeg",".png",".bmp",".webp"}; SEED=42
def discover_names():
    for p in RAW.rglob("*.yaml"):
        try:
            d=yaml.safe_load(p.read_text()); n=d.get("names")
            if isinstance(n,dict): return [str(n[k]) for k in sorted(n,key=lambda x:int(x))]
            if isinstance(n,list): return list(map(str,n))
        except Exception: pass
    for p in RAW.rglob("*.txt"):
        if p.name.lower() in {"classes.txt","obj.names"}:
            vals=[x.strip() for x in p.read_text(errors="ignore").splitlines() if x.strip()]
            if vals: return vals
    coco=next(RAW.rglob("*.json"),None)
    if coco:
        try: return [x["name"] for x in sorted(json.loads(coco.read_text())["categories"],key=lambda x:x["id"])]
        except Exception: pass
    voc=[]
    for p in RAW.rglob("*.xml"):
        try: voc += [x.findtext("name") for x in ET.parse(p).getroot().findall("object")]
        except Exception: pass
    if voc: return sorted(set(voc))
    for p in RAW.rglob("*.csv"):
        try:
            with p.open(newline="",encoding="utf-8-sig") as f:
                reader=csv.DictReader(f); keys={k.lower().strip() for k in (reader.fieldnames or [])}
                cname=next((k for k in reader.fieldnames or [] if k.lower().strip() in {"class","class_name","label","category"}),None)
                if cname and ({"image","filename","file_name","img"}&keys):
                    return sorted({r[cname].strip() for r in reader if r.get(cname)})
        except Exception: pass
    return []
def main():
    images=[p for p in RAW.rglob("*") if p.suffix.lower() in IMG_EXT]
    if not images: raise SystemExit(f"No images found under {RAW}; run ml/download_data.py or extract the dataset manually.")
    names=discover_names(); name_to_id={n:i for i,n in enumerate(names)}
    # COCO labels are mapped by category ID; other formats preserve their class IDs when possible.
    coco={}
    jp=next(RAW.rglob("*.json"),None)
    if jp:
        try:
            c=json.loads(jp.read_text()); coco={i["id"]:i for i in c.get("images",[])}; categories={x["id"]:x["name"] for x in c.get("categories",[])}
            if not names: names=[categories[k] for k in sorted(categories)]; name_to_id={n:i for i,n in enumerate(names)}
            anns={i["id"]:[] for i in c.get("images",[])}
            for a in c.get("annotations",[]): anns.setdefault(a["image_id"],[]).append(a)
        except Exception: anns={}; categories={}
    else: anns={}; categories={}
    csv_rows={}
    for cp in RAW.rglob("*.csv"):
        try:
            with cp.open(newline="",encoding="utf-8-sig") as f:
                reader=csv.DictReader(f); fields={k.lower().strip():k for k in (reader.fieldnames or [])}
                fk=next((fields[k] for k in ("image","filename","file_name","img") if k in fields),None)
                ck=next((fields[k] for k in ("class","class_name","label","category") if k in fields),None)
                coord=[next((fields[k] for k in opts if k in fields),None) for opts in (("xmin","x_min","x1","left"),("ymin","y_min","y1","top"),("xmax","x_max","x2","right"),("ymax","y_max","y2","bottom"))]
                if fk and ck and all(coord):
                    for row in reader: csv_rows.setdefault(Path(row[fk]).stem,[]).append((row[ck].strip(),[float(row[k]) for k in coord]))
                    break
        except Exception: pass
    records=[]
    for img in images:
        label=img.with_suffix(".txt"); rows=[]
        if img.stem in {str(x.get("file_name","")).rsplit("/",1)[-1].rsplit(".",1)[0] for x in coco.values()}:
            meta=next((x for x in coco.values() if Path(x.get("file_name","")).stem==img.stem),None)
            if meta:
                imid=meta["id"]; w,h=meta["width"],meta["height"]
                for a in anns.get(imid,[]):
                    x,y,bw,bh=a["bbox"]; cid=name_to_id.get(categories.get(a["category_id"],""),0); rows.append(f"{cid} {(x+bw/2)/w:.6f} {(y+bh/2)/h:.6f} {bw/w:.6f} {bh/h:.6f}")
        elif label.exists():
            for line in label.read_text(errors="ignore").splitlines():
                bits=line.split()
                if len(bits)>=5:
                    try: rows.append(" ".join([str(int(float(bits[0]))),*bits[1:5]]))
                    except ValueError: pass
        elif img.stem in csv_rows:
            try:
                from PIL import Image
                w,h=Image.open(img).size
                for nm,(x1,y1,x2,y2) in csv_rows[img.stem]:
                    if nm not in name_to_id: continue
                    rows.append(f"{name_to_id[nm]} {(x1+x2)/(2*w):.6f} {(y1+y2)/(2*h):.6f} {(x2-x1)/w:.6f} {(y2-y1)/h:.6f}")
            except Exception: pass
        else:
            xml=img.with_suffix(".xml")
            if xml.exists():
                try:
                    root=ET.parse(xml).getroot(); w=int(root.findtext("size/width")); h=int(root.findtext("size/height"))
                    for obj in root.findall("object"):
                        nm=obj.findtext("name"); bb=obj.find("bndbox")
                        if nm not in name_to_id: continue
                        x1,y1,x2,y2=[float(bb.findtext(k)) for k in ("xmin","ymin","xmax","ymax")]
                        rows.append(f"{name_to_id[nm]} {(x1+x2)/(2*w):.6f} {(y1+y2)/(2*h):.6f} {(x2-x1)/w:.6f} {(y2-y1)/h:.6f}")
                except Exception: pass
        records.append((img,rows))
    if not names:
        # Infer names from class index observed in YOLO labels only.
        ids=set()
        for _,rows in records:
            for row in rows:
                try: ids.add(int(row.split()[0]))
                except Exception: pass
        names=[f"class_{i}" for i in range(max(ids)+1)] if ids else ["unspecified"]
    # Some source releases separate original images from augmented copies.
    # Keep every recognized augmentation in train; validation and test are drawn only
    # from original images. Thus no augmented sibling can leak across the evaluation.
    aug_markers=("augment","_aug","aug_",".rf.","-flip","_flip","-rotat","_rotat","-mosaic","_mosaic","-shear","_shear","-copy","_copy")
    originals=[]; augmented=[]
    for rec in records:
        img=rec[0]; tags=" ".join((part.lower() for part in img.parts))
        if "augment" in tags or any(mark in img.name.lower() for mark in aug_markers): augmented.append(rec)
        else: originals.append(rec)
    if not augmented:
        print("No augmented folder/filename markers found; splitting all images with a fixed seed.")
    rng=random.Random(SEED); rng.shuffle(originals); n=len(originals); a=round(n*.8); b=round(n*.9)
    original_groups={rec[0].stem:split for split,items in (("train",originals[:a]),("val",originals[a:b]),("test",originals[b:])) for rec in items}
    splits={"train":originals[:a],"val":originals[a:b],"test":originals[b:]}
    grouped_aug=Counter(); orphan_aug=0
    for rec in augmented:
        stem=rec[0].stem
        family=stem.split("_jpg.rf.",1)[0].split("_png.rf.",1)[0].split(".rf.",1)[0]
        target=original_groups.get(family,"train")
        if family not in original_groups: orphan_aug+=1
        splits[target].append(rec); grouped_aug[target]+=1
    counts={s:Counter() for s in splits}
    if OUT.exists(): shutil.rmtree(OUT)
    for split,items in splits.items():
        for folder in ("images","labels"): (OUT/folder/split).mkdir(parents=True,exist_ok=True)
        for img,rows in items:
            shutil.copy2(img,OUT/"images"/split/img.name); (OUT/"labels"/split/f"{img.stem}.txt").write_text("\n".join(rows)+("\n" if rows else ""))
            for row in rows:
                try: counts[split][names[int(row.split()[0])]]+=1
                except Exception: pass
    (OUT/"data.yaml").write_text(yaml.safe_dump({"path":str(OUT.resolve()),"train":"images/train","val":"images/val","test":"images/test","names":names,"nc":len(names)},sort_keys=False))
    print(f"Original images: {n}; augmented images grouped by source: {dict(grouped_aug)}; unpaired augmented images assigned to train: {orphan_aug}; classes present in label metadata: {names}")
    for split in splits: print(f"{split}: {len(splits[split])} images; boxes per class: {dict(counts[split])}")
    print(f"Wrote {OUT/'data.yaml'}")
if __name__=="__main__": main()
