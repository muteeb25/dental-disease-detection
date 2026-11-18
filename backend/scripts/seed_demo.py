"""Seed three fictional patients with real inference results from test images.

Safe to rerun: existing seeded patients and their scans are left untouched.
Run from the repository root with ``python backend/scripts/seed_demo.py``.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
os.chdir(BACKEND)  # DATABASE_URL in .env is relative to the backend working directory.
sys.path.insert(0, str(BACKEND))

from PIL import Image  # noqa: E402
from app import main  # noqa: E402


DEMO_MARKER = "Fictional demo record created by seed_demo.py"
DEMO_PATIENTS = [
    ("Demo Patient A", 28, "Female", "+1 555 010 1001"),
    ("Demo Patient B", 43, "Male", "+1 555 010 1002"),
    ("Demo Patient C", 35, "Prefer not to say", "+1 555 010 1003"),
]


def main_seed() -> None:
    if main.detector is None:
        raise SystemExit("No detector is loaded. Check models/best_roboflow_4class.pt and its four class names.")
    test_images = sorted((ROOT / "data" / "dental" / "images" / "test").glob("*"))
    test_images = [p for p in test_images if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and "_jpg.rf." not in p.name and "_png.rf." not in p.name]
    if len(test_images) < len(DEMO_PATIENTS):
        raise SystemExit("Need at least three real images in data/dental/images/test. Prepare the dataset first.")

    db = main.SessionLocal()
    output = []
    try:
        for index, (name, age, gender, phone) in enumerate(DEMO_PATIENTS):
            patient = db.query(main.Patient).filter_by(name=name, notes=DEMO_MARKER).first()
            if patient is None:
                conflicting = db.query(main.Patient).filter_by(name=name).first()
                if conflicting is not None:
                    raise SystemExit(f"A patient named {name!r} exists without the demo marker; refusing to alter it.")
                patient = main.Patient(name=name, age=age, gender=gender, phone=phone, notes=DEMO_MARKER)
                db.add(patient); db.commit(); db.refresh(patient)

            existing_scans = db.query(main.Scan).filter_by(patient_id=patient.id).all()
            if any(scan.model_name == main.detector_name for scan in existing_scans):
                scan_count = len(existing_scans)
                finding_count = sum(len(json.loads(s.findings)) for s in existing_scans)
                image_name = "already seeded"
            else:
                # Remove only demo-marker scans made by the previous project seeder,
                # including their image files, before reseeding with the fixed model.
                for old_scan in existing_scans:
                    for old_path in (old_scan.original_path, old_scan.annotated_path):
                        path=Path(old_path).resolve()
                        if path.parent == main.STORAGE.resolve() and path.exists(): path.unlink()
                    db.delete(old_scan)
                db.commit()
                source = test_images[index]
                with Image.open(source) as opened:
                    image = opened.convert("RGB")
                key = uuid.uuid4().hex
                original_path = main.STORAGE / f"{key}_original.jpg"
                annotated_path = main.STORAGE / f"{key}_annotated.png"
                image.save(original_path, quality=95)
                # Lower demo threshold so the real model produces a useful review
                # view on this small held-out sample; detections remain model output.
                boxes = main.run_detection(image.copy(), 0.10)
                main.annotate(image.copy(), boxes, annotated_path)
                scan = main.Scan(
                    patient_id=patient.id,
                    original_path=str(original_path.resolve()),
                    annotated_path=str(annotated_path.resolve()),
                    findings=json.dumps(boxes),
                    model_name=main.detector_name,
                )
                db.add(scan); db.commit(); db.refresh(scan)
                scan_count = 1
                finding_count = len(boxes)
                image_name = source.name
            output.append({"patient": name, "patient_id": patient.id, "scan_count": scan_count, "new_image": image_name, "model_findings": finding_count})
    finally:
        db.close()
    print(json.dumps({"seeded": output, "model": main.detector_name}, indent=2))


if __name__ == "__main__":
    main_seed()
