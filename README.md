# Dental Disease Detection

A web app that detects findings on panoramic dental X-rays using a fine-tuned **YOLO11m** model. It is an assistive tool: it suggests regions for a dentist to review and does not provide a diagnosis.

**Detected classes:** Fillings, Impacted Tooth, Implant, Cavity

## Results

Evaluated on the held-out test split (65 images, 474 labelled instances).

| Metric | Score |
|---|---|
| mAP@50 | 0.894 |
| mAP@50-95 | 0.536 |
| Precision | 0.867 |
| Recall | 0.823 |

| Class | Precision | Recall | mAP@50 | mAP@50-95 |
|---|---|---|---|---|
| Fillings | 0.941 | 0.839 | 0.942 | 0.589 |
| Impacted Tooth | 0.934 | 0.835 | 0.945 | 0.538 |
| Implant | 0.988 | 0.976 | 0.991 | 0.661 |
| Cavity | 0.605 | 0.643 | 0.697 | 0.357 |

Cavity is the weakest class: it has only 28 test instances and the subtlest appearance. Full numbers and plots (confusion matrices, PR and F1 curves, training curves) are in [`reports/`](reports/).

## How it works

1. **Model:** YOLO11m (Ultralytics), fine-tuned on a Roboflow Universe dental X-ray dataset (see [DATASETS.md](DATASETS.md)). Training ran on a Colab T4 GPU at 640x640.
2. **Backend:** FastAPI. Loads `models/best_roboflow_4class.pt`, runs detection, stores patients and scans, and generates PDF reports.
3. **Frontend:** Next.js. Upload an X-ray, adjust the confidence threshold, review the boxes, save scans to a patient record.

The detect page requests all detections at a very low confidence and filters them locally with the slider. A threshold of about 0.25-0.30 works well for most classes. Cavity may need 0.10-0.20.

## Project structure

```
backend/    FastAPI app, demo seed script (scripts/seed_demo.py), tests
frontend/   Next.js web interface
ml/         Dataset preparation, training and evaluation scripts, Colab notebook
reports/    Metrics (metrics.md, metrics.json) and evaluation plots
models/     Model weights (not in this repo, see below)
data/       Dataset (not in this repo, see below)
```

## Setup

### 1. Model weights

The weights file is not stored in this repository. Download `best_roboflow_4class.pt` from **[ADD YOUR DRIVE LINK HERE]** and place it at:

```
models/best_roboflow_4class.pt
```

### 2. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts/seed_demo.py        # optional: load demo data
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:3000, then register or log in.

Run only one backend at a time. If port 8000 is already in use, an old server is still running: stop it before starting a new one.

### 4. Tests

```powershell
cd backend
pytest
```

## Retraining (optional)

The dataset is a Roboflow Universe export placed in `data/dental_rf/` (see [DATASETS.md](DATASETS.md) for the source, license and class order). Class order: `0 Fillings, 1 Impacted Tooth, 2 Implant, 3 cavity`.

- Train: `ml/train.py`, or `ml/train_colab.ipynb` on a Colab GPU
- Check splits for leakage: `python ml/audit_splits.py`
- Evaluate: `ml/evaluate.py`

## Limitations

- Cavity detection is noticeably weaker than the other classes.
- Trained and tested on one dataset. Images from other X-ray machines or types (bitewing, periapical, photos of X-rays) may give much lower confidence.
- Part of the dataset uses Roboflow augmentation, so some images are cropped or padded.
- Not a medical device. Every finding must be confirmed by a qualified dentist.

## Credits

Dataset: see [DATASETS.md](DATASETS.md). Model: [Ultralytics YOLO11](https://github.com/ultralytics/ultralytics).
