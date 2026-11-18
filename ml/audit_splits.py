"""Audit that the prepared Roboflow splits share no source group or exact image.

Roboflow augmentation filenames look like ``0026_jpg.rf.<hash>.jpg``. The prefix
before ``.rf.`` identifies the source image; every augmented version of a source
must stay in one split. Exact duplicate files (identical SHA-256) are checked
across splits too. This audit is read-only.
"""
from collections import defaultdict
from pathlib import Path
import hashlib
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "data" / "dental_rf" / "images"
EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
SOURCE = re.compile(r"^(.*?)(?:_jpg|_png)\.rf\.[^.]+$", re.IGNORECASE)


def source_id(image: Path) -> str:
    match = SOURCE.match(image.stem)
    if match:
        return match.group(1)
    # Unaugmented exports keep their plain stem; they remain auditable as a group.
    return image.stem.split(".rf.", 1)[0]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    if not IMAGES.is_dir():
        raise SystemExit(f"Missing prepared Roboflow images: {IMAGES}")

    source_splits: dict[str, set[str]] = defaultdict(set)
    hash_splits: dict[str, set[str]] = defaultdict(set)
    groups: dict[str, set[str]] = defaultdict(set)
    for split in ("train", "val", "test"):
        folder = IMAGES / split
        if not folder.is_dir():
            raise SystemExit(f"Missing split folder: {folder}")
        images = sorted(p for p in folder.iterdir() if p.suffix.lower() in EXTENSIONS)
        for image in images:
            group = source_id(image)
            groups[split].add(group)
            source_splits[group].add(split)
            hash_splits[sha256(image)].add(split)
        print(f"{split}: {len(images)} images, {len(groups[split])} source groups")

    leaked_sources = sorted(group for group, splits in source_splits.items() if len(splits) > 1)
    leaked_hashes = sorted(digest for digest, splits in hash_splits.items() if len(splits) > 1)
    for group in leaked_sources:
        print(f"LEAK source {group}: {','.join(sorted(source_splits[group]))}")
    for digest in leaked_hashes:
        print(f"LEAK duplicate image {digest[:12]}…: {','.join(sorted(hash_splits[digest]))}")

    if leaked_sources or leaked_hashes:
        print(
            f"FAIL: source groups spanning splits={len(leaked_sources)}, "
            f"duplicate hashes spanning splits={len(leaked_hashes)}"
        )
        return 1
    print("PASS: no source group or exact image appears in more than one split.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
