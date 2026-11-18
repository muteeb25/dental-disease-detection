"""Evaluate the single project checkpoint on the Roboflow test split."""
from pathlib import Path
import json
import shutil

from ultralytics import YOLO
import yaml

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models" / "best_roboflow_4class.pt"
DATA = ROOT / "data" / "dental_rf" / "data.yaml"
CLASS_NAMES = ["Fillings", "Impacted Tooth", "Implant", "Cavity"]


def main():
    if not MODEL.is_file():
        raise SystemExit(f"Required project checkpoint not found: {MODEL}")
    if not DATA.is_file():
        raise SystemExit(f"Prepared Roboflow data not found: {DATA}")
    model = YOLO(str(MODEL))
    names = model.names
    names = [str(names[k]) for k in sorted(names, key=int)] if isinstance(names, dict) else list(map(str, names))
    if [name.casefold() for name in names] != [name.casefold() for name in CLASS_NAMES]:
        raise SystemExit(f"Checkpoint class names do not match expected Roboflow class order: {names}")

    # Normalize display capitalization without modifying the checkpoint on disk.
    model.model.names = {i: name for i, name in enumerate(CLASS_NAMES)}
    runtime_data = ROOT / "storage" / "roboflow4_eval_data.yaml"
    data_config = yaml.safe_load(DATA.read_text(encoding="utf-8"))
    data_config["path"] = str(DATA.parent.resolve())
    runtime_data.write_text(yaml.safe_dump(data_config, sort_keys=False), encoding="utf-8")
    result = model.val(data=str(runtime_data), split="test", plots=True, project=str(ROOT / "runs"), name="roboflow4_test_eval", exist_ok=True)
    box = result.box
    class_ap = {
        CLASS_NAMES[int(class_id)]: float(ap)
        for class_id, ap in zip(box.ap_class_index, box.ap50)
    }
    metrics = {
        "model": MODEL.name,
        "dataset": "Roboflow Universe panoramic-xray-image",
        "split": "test",
        "map50": float(box.map50),
        "map50_95": float(box.map),
        "precision": float(box.mp),
        "recall": float(box.mr),
        "per_class_ap50": class_ap,
        "class_names": CLASS_NAMES,
    }
    report_dir = ROOT / "reports"
    report_dir.mkdir(exist_ok=True)
    (report_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    result_dir = Path(result.save_dir)
    # Copy the available plots under their original names. Never replace an image
    # that is already in reports/: reviewed assets stay under project control.
    for name in ("BoxPR_curve.png", "confusion_matrix.png", "confusion_matrix_normalized.png"):
        source = result_dir / name
        destination = report_dir / name
        if not source.is_file():
            continue
        if destination.exists():
            print(f"Keeping existing report image: {destination}")
            continue
        shutil.copy2(source, destination)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
