"""Locate or unpack the Roboflow panoramic X-ray export used by this project.

The Roboflow Universe export is distributed as a ZIP that must be downloaded
manually (its API requires a key). Save it as ``data/raw_roboflow.zip`` and run
this script, or extract it yourself into ``data/roboflow_raw/``. The prepared,
leakage-audited copy used for training lives in ``data/dental_rf/``.
"""
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "roboflow_raw"
ARCHIVE = ROOT / "data" / "raw_roboflow.zip"
SOURCE_URL = "https://universe.roboflow.com/teeth-detection-using-yolo/panoramic-xray-image"


def main() -> int:
    if (RAW / "data.yaml").is_file():
        print(f"Roboflow source export already present: {RAW}")
        print("Prepared dataset: data/dental_rf (dental_rf_colab.zip for Colab).")
        return 0
    if not ARCHIVE.is_file():
        print(f"Download the Roboflow export ZIP from {SOURCE_URL}")
        print(f"and save it as {ARCHIVE}, then run this script again.")
        return 1
    if not zipfile.is_zipfile(ARCHIVE):
        print(f"Not a valid ZIP archive: {ARCHIVE}")
        return 1

    RAW.mkdir(parents=True, exist_ok=True)
    root = RAW.resolve()
    with zipfile.ZipFile(ARCHIVE) as archive:
        for member in archive.infolist():
            if not (root / member.filename).resolve().is_relative_to(root):
                raise SystemExit(f"Unsafe path in archive: {member.filename}")
        archive.extractall(RAW)
    print(f"Roboflow export extracted to {RAW}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
