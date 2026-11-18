# Dataset source and attribution

This project uses one dataset and one detector. All model paths, reports, and UI text refer to this setup.

## Panoramic X-ray image (Roboflow Universe)

- Source: [Roboflow Universe — panoramic-xray-image](https://universe.roboflow.com/teeth-detection-using-yolo/panoramic-xray-image)
- Author/project publisher: **teeth detection using yolo**
- License shown in the export: **CC BY 4.0**
- Downloaded archive: `data/raw_roboflow.zip`
- Extracted source export: `data/roboflow_raw/` (upstream `train`, `valid`, `test`)
- Prepared copy: `data/dental_rf/` (`valid` is named `val`; `data.yaml` uses relative paths)
- Portable Colab archive: `dental_rf_colab.zip`
- Active checkpoint: `models/best_roboflow_4class.pt` (YOLO11m)
- Class order: `Fillings`, `Impacted Tooth`, `Implant`, `cavity`

The downloaded export contains the upstream split folders, and augmented filenames use a `.rf.<hash>` suffix. The audit grouped every image by the source prefix before `.rf.` and compared SHA-256 hashes across splits. No source group and no exact duplicate image crossed a split boundary, so the supplied split allocation was preserved and the test results in `reports/metrics.md` are held out. Run `python ml/audit_splits.py` to repeat the read-only check; `python ml/download_data.py` locates or unpacks the source export.

The dataset is attributed to its listed publisher and licensed CC BY 4.0. Keep this attribution and the license when sharing the dataset or derivatives, and consult the source page for current terms and citation guidance.
