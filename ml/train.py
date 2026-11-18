"""Optional fine-tuning of the project's configured Roboflow checkpoint.

Training writes a run under runs/roboflow4_finetune and never changes the active
models/best_roboflow_4class.pt file. Promote a reviewed checkpoint deliberately.
"""
from pathlib import Path
import argparse

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "models" / "best_roboflow_4class.pt"
DATA = ROOT / "data" / "dental_rf" / "data.yaml"


def main():
    parser = argparse.ArgumentParser(description="Fine-tune the fixed Roboflow YOLO11m model")
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--patience", type=int, default=20)
    parser.add_argument("--batch", type=int, default=-1)
    args = parser.parse_args()
    if not MODEL.is_file():
        raise SystemExit(f"Required project checkpoint not found: {MODEL}")
    if not DATA.is_file():
        raise SystemExit(f"Prepared Roboflow data not found: {DATA}")
    YOLO(str(MODEL)).train(
        data=str(DATA), imgsz=args.imgsz, epochs=args.epochs, patience=args.patience,
        batch=args.batch, project=str(ROOT / "runs"), name="roboflow4_finetune",
        mosaic=1.0, hsv_h=.015, hsv_s=.7, hsv_v=.4, fliplr=.5, scale=.5,
    )


if __name__ == "__main__":
    main()
