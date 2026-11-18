# Dental Disease Detection System

A university course prototype for dentist-facing review of panoramic dental X-rays. The system uses **one** detector: a YOLO11m model fine-tuned on the Roboflow 4-class panoramic X-ray dataset. The FastAPI service returns regions and confidence scores, stores scans against patient records, and the Next.js UI shows the annotations and offers PDF reports.

> **Decision-support only — not a diagnosis.** This software is not a medical device. A qualified dentist must independently review every image and result.

## Architecture

```
Browser (Next.js / TypeScript) -- JWT + REST --> FastAPI
       |                                          |-- SQLite patient/scan records
       |                                          |-- models/best_roboflow_4class.pt (single YOLO11m detector)
       |                                          |-- storage/ images and PDF reports
       +-- Canvas overlay / PDF download          +-- reports/metrics.json / metrics.md

Roboflow export (data/raw_roboflow.zip) --> data/roboflow_raw/ --> data/dental_rf/
                                                                  --> models/best_roboflow_4class.pt
```

There is no second model, automatic download, or fallback path. If the configured checkpoint is missing, `/detect` returns HTTP 503.

## Dataset and attribution

The project uses one dataset: [Roboflow Universe — panoramic-xray-image](https://universe.roboflow.com/teeth-detection-using-yolo/panoramic-xray-image), publisher **teeth detection using yolo**, license **CC BY 4.0**. Keep this attribution when sharing the data or derivatives and recheck the source page for current terms.

- Downloaded archive: `data/raw_roboflow.zip`
- Extracted source export: `data/roboflow_raw/` (upstream `train`, `valid` → `val`, `test`)
- Prepared, leakage-audited copy: `data/dental_rf/` (`data.yaml` uses relative paths)
- Portable Colab archive of the prepared copy: `dental_rf_colab.zip`
- Class order: **Fillings**, **Impacted Tooth**, **Implant**, **cavity** (`data/dental_rf/data.yaml` stores the last name lowercase; the UI displays "Cavity")

The supplied split assignment was kept: an audit grouped augmented filenames by the source prefix before `.rf.` and compared SHA-256 hashes across splits. No source group and no exact image crossed a split boundary, so the held-out test results below remain valid. See [DATASETS.md](DATASETS.md) for attribution details. Legacy `data/dental/` and `data/raw/` folders are not used by this model.

## Setup and run

Python 3.10+ and Node.js 18+ are required. From the repository root:

1. In Windows PowerShell, run `python -m venv backend/.venv`, `backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r ml/requirements.txt`, then `Copy-Item .env.example .env`. Set a long random `JWT_SECRET` in `.env`. The verified environment here is Python 3.14.7 and Node.js 24.12.0.
2. Confirm `models/best_roboflow_4class.pt` is present. It is the only supported detector; no model is fetched at startup.
3. In one terminal run `cd backend` then `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.
4. In another run `cd frontend`, `npm install`, then `npm run dev`.
5. Open [http://localhost:3000](http://localhost:3000), register a dentist account, then add a patient or analyze an image. API docs are at [http://localhost:8000/docs](http://localhost:8000/docs).

### Seed the university demo

After confirming the detector is available, run from the repository root:

```powershell
.\backend\.venv\Scripts\python.exe backend/scripts/seed_demo.py
```

This creates three clearly fictional records (Demo Patient A–C), each with one original test image analyzed by the loaded model at confidence 0.10. The script stores the model's actual detections and annotated/original images; it does not insert synthetic findings. It is safe to rerun: it reuses its marked demo patients and reports the per-patient finding counts it obtained. Counts can change if the weights change.

### Three-minute demo script

1. **Sign in** at `/login` with a dentist account (register one first if needed).
2. **Dashboard:** point out Patients, Saved scans, Total findings, and the model name. Show the four test metrics and clarify that they come from `reports/metrics.json`; then show the four model class chips and findings-by-class counts from saved scans.
3. **Recent scan:** click a Demo Patient row, open a scan card, review the annotated X-ray and findings, then click **Download PDF report**.
4. **New patient workflow:** use **New scan for this patient**, upload an image from `data/dental_rf/images/test`, choose a confidence threshold, click **Analyze image**, then **Save to patient**. The patient is preselected from the patient record link.
5. **Patients:** return to the patient list, search for the demo patient by name or phone, and open the record to show the new scan history card.

Convenience targets are in the Makefile: `make setup`, `make prepare-data`, `make train`, `make evaluate`, `make run-backend`, and `make run-frontend` (Windows users can run the corresponding Python/uvicorn/npm commands directly).

### Data preparation and audit

`data/dental_rf/` is already prepared; no preparation step is needed to run the app. To recover the source export, run `python ml/download_data.py`. If the automatic lookup cannot retrieve the Roboflow ZIP, download it from the source page and save it as `data/raw_roboflow.zip`; the script then extracts it into `data/roboflow_raw/`. To recheck split separation, run `python ml/audit_splits.py`; it reports image and source-group counts per split and fails if a source group or exact image hash spans splits. `ml/prepare_dataset.py` is a generic YOLO/COCO/VOC/CSV annotation normalizer and is not part of this model's workflow.

### Colab and local training

Open `ml/train_colab.ipynb` in Google Colab, select a GPU runtime, and upload `dental_rf_colab.zip` and `best_roboflow_4class.pt` when prompted. The notebook installs dependencies, evaluates the fixed checkpoint, and can optionally fine-tune it.

Local optional fine-tuning: `python ml/train.py`. It starts from the configured model, writes to `runs/roboflow4_finetune`, and never replaces `models/best_roboflow_4class.pt`; promote a reviewed checkpoint deliberately. Local evaluation of the active checkpoint: `python ml/evaluate.py`. It writes `reports/metrics.json`, copies newly generated plots without overwriting existing report images, and does not fabricate training-history plots. The Colab notebook and evaluation script use the same four class names in the same order.

## Model performance

Evaluated on the held-out Roboflow test split (65 images, 474 instances). Full details are in [reports/metrics.md](reports/metrics.md) and machine-readable values in `reports/metrics.json`.

| Metric | Value |
|---|---:|
| mAP@50 | 0.894 |
| mAP@50–95 | 0.536 |
| Precision | 0.867 |
| Recall | 0.823 |

| Class | Images | Instances | Precision | Recall | mAP@50 | mAP@50–95 |
|---|---:|---:|---:|---:|---:|---:|
| Fillings | 49 | 329 | 0.941 | 0.839 | 0.942 | 0.589 |
| Impacted Tooth | 14 | 34 | 0.934 | 0.835 | 0.945 | 0.538 |
| Implant | 35 | 83 | 0.988 | 0.976 | 0.991 | 0.661 |
| cavity | 14 | 28 | 0.605 | 0.643 | 0.697 | 0.357 |

Inference speed (T4 GPU): 2.9 ms preprocess, 27.9 ms inference, 2.4 ms postprocess per image. The `cavity` class has the fewest test instances (28) and the lowest scores. These are dataset scores, not evidence of clinical performance.

## API summary

All routes except `/health`, `/auth/register`, and `/auth/login` require `Authorization: Bearer <JWT>`.

| Method and path | Purpose |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Dentist account and JWT |
| `GET/POST /patients`, `GET/PUT/DELETE /patients/{id}` | Patient records |
| `POST /detect?conf=0.25` | JPG/PNG inference (max 15 MB), JSON boxes and image URLs |
| `POST/GET /patients/{id}/scans` | Save and list patient scans |
| `GET /scans/{id}` | Retrieve scan |
| `DELETE /scans/{id}` | Delete scan |
| `GET /scans/{id}/report.pdf` | PDF including images, findings, metrics when present, and disclaimer |
| `GET /health`, `GET /model-info`, `GET /dashboard` | Service/model and dashboard summary |

## Limitations

The dataset is small and may contain lab-style imagery, uneven class representation, and annotation noise. Model scores depend on the supplied labels, split, and hardware/software versions and do not establish clinical safety. There is no fallback model: when the checkpoint is unavailable, detection is disabled. Patient information and radiographs are sensitive: this demo uses a local SQLite database and local files without production-grade access controls, encryption, audit logging, retention policy, or deployment hardening. Do not use real patient data in an unsecured deployment. It is not a medical device and is not a substitute for professional diagnosis.

## Viva cheat sheet

- **YOLO vs classification:** classification assigns a label to the whole image; object detection predicts a class and a bounding box for each localized finding.
- **IoU:** intersection-over-union is the area overlap between predicted and reference boxes divided by their union; it measures localization agreement.
- **mAP:** mean average precision summarizes the precision-recall curve. mAP@50 counts a detection as matched at IoU 0.50; mAP@50-95 averages thresholds from 0.50 to 0.95 and is stricter.
- **Precision and recall:** precision is the share of predicted findings that are correct; recall is the share of labeled findings found by the model. Their tradeoff changes with confidence threshold.
- **Augmentation:** mosaic, HSV shifts, horizontal flips, and scale changes create varied training views and can reduce overfitting, but should reflect plausible image transformations.
- **Class imbalance:** frequent classes dominate learning; report per-class AP and counts, and consider balanced sampling or additional licensed data.
- **Transfer learning:** fine-tuning pretrained YOLO weights starts from learned visual features, which can help when a dental dataset is small; domain differences still limit generalization.
