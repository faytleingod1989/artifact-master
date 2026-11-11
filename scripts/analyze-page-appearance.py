"""Offline numerical comparison only: never capture a window or send input."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image


def descriptor(image, rect):
    x, y, w, h = (rect[k] for k in ("x", "y", "width", "height"))
    left, top = x+int(w*.15), y+int(h*.24)
    right, bottom = x+int(w*.85), y+int(h*1.19)
    region = image[top:bottom, left:right]
    rows = []
    for row in range(48):
        line = []
        for col in range(32):
            block = region[row*region.shape[0]//48:(row+1)*region.shape[0]//48,
                           col*region.shape[1]//32:(col+1)*region.shape[1]//32]
            line.append(np.floor(block.mean(axis=(0, 1))))
        rows.append(line)
    return np.asarray(rows, dtype=np.float32)


def appearance_metrics(a, b):
    # Report only fixed-coordinate evidence. No registration/scale search is
    # performed or implied by this diagnostic or the production comparator.
    parts = []
    for name, band in (("icon", slice(1, 33)), ("level", slice(40, 47))):
        first, second = a[band, 1:31].reshape(-1, 3), b[band, 1:31].reshape(-1, 3)
        mae = float(np.mean(np.abs(first-second)))
        first = first-first.mean(axis=0)
        second = second-second.mean(axis=0)
        denominator = np.sqrt(np.sum(first*first)*np.sum(second*second))
        ncc = float(np.sum(first*second)/denominator) if denominator > 0 else None
        parts.append({"band": name, "mae": round(mae, 4), "ncc": round(ncc, 6) if ncc is not None else None})
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("--after-crop-offset", nargs=2, type=int, metavar=("X", "Y"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    native = root / "apps/web/native-capture/PageScanInput.ps1"
    probe = root / "apps/web/electron/fixtures/pageScanPairProbe.ps1"
    with Image.open(args.before) as image:
        before = np.asarray(image.convert("RGB"), dtype=np.int16)
    with Image.open(args.after) as image:
        after = np.asarray(image.convert("RGB"), dtype=np.int16)
    if args.after_crop_offset:
        x, y = args.after_crop_offset
        if x < 0 or y < 0 or x+after.shape[1] > before.shape[1] or y+after.shape[0] > before.shape[0]:
            raise ValueError("Invalid known screenshot crop; scaling is never allowed")
        restored = before.copy()
        restored[y:y+after.shape[0], x:x+after.shape[1]] = after
        after = restored
    elif before.shape != after.shape:
        raise ValueError("Different image dimensions; do not rescale evidence")
    with tempfile.TemporaryDirectory(prefix="artifact-offline-pair-") as temporary:
        after_path = args.after.resolve()
        if args.after_crop_offset:
            after_path = Path(temporary) / "crop-offset-restored.png"
            Image.fromarray(after.astype(np.uint8)).save(after_path)
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(probe),
             "-Source", str(native), "-Before", str(args.before.resolve()), "-After", str(after_path)],
            capture_output=True, encoding="utf-8", check=True, timeout=30,
        )
    data = json.loads(result.stdout.lstrip("\ufeff"))
    step = max(2, before.shape[1] // 960)
    cells = []
    reference_descriptors = [descriptor(before, r) for r in data["bounds"]]
    for rect in data["bounds"]:
        x, y, w, h = (rect[key] for key in ("x", "y", "width", "height"))
        if args.after_crop_offset:
            crop_x, crop_y = args.after_crop_offset
            if x+int(w*.15) < crop_x or y+int(h*.24) < crop_y:
                raise ValueError("An evidence patch includes an unobserved part of the cropped screenshot")
        # Same fixed interior and stride as production; no threshold tuning.
        region = np.s_[y + int(h*.24):y + int(np.ceil(h*.90)):step,
                       x + int(w*.15):x + int(np.ceil(w*.85)):step]
        a, b = before[region], after[region]
        difference = np.abs(a-b)
        quantized = np.any((a >> 4) != (b >> 4), axis=2)
        cells.append({"id": rect["id"], "rect": rect,
                      "quantizedChanged": int(quantized.sum()), "samples": int(quantized.size),
                      "maxChannelDelta": int(difference.max()),
                      "meanChannelDelta": round(float(difference.mean()), 4),
                      "over16Fraction": round(float(np.mean(np.max(difference, axis=2) > 16)), 6)})
        if quantized.any():
            cells[-1]["boundedAppearance"] = appearance_metrics(reference_descriptors[len(cells)-1], descriptor(after, rect))
    summary = {key: {field: data[key].get(field) for field in
               ("validLayout", "selectedCellId", "pageSignature", "gridSignature")}
               for key in ("before", "raw", "anchored")}
    negative = appearance_metrics(reference_descriptors[0], reference_descriptors[4]) if len(cells) > 4 else None
    print(json.dumps({"knownAfterCropOffset": args.after_crop_offset,
                      "analysis": summary, "cells": cells,
                      "firstVsFifthDifferentItem": negative}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
