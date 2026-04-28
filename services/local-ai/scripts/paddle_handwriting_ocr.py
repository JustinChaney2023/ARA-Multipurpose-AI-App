#!/usr/bin/env python3
"""PaddleOCR bridge for local handwriting OCR.

The Node service reads only the final stdout line, which is JSON. Other library
output is tolerated as long as this script finishes by printing the result JSON.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any


def _emit(payload: dict[str, Any], exit_code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=True), flush=True)
    raise SystemExit(exit_code)


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _collect_from_v3_result(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "json", None)
    if isinstance(data, dict) and isinstance(data.get("res"), dict):
        data = data["res"]

    if not isinstance(data, dict):
        return []

    texts = data.get("rec_texts") or []
    scores = data.get("rec_scores") or []
    lines: list[dict[str, Any]] = []

    for index, text in enumerate(texts):
        if not isinstance(text, str) or not text.strip():
            continue
        confidence = _as_float(scores[index] if index < len(scores) else None)
        line: dict[str, Any] = {"text": text.strip()}
        if confidence is not None:
            line["confidence"] = confidence
        lines.append(line)

    return lines


def _collect_from_v2_result(result: Any) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    if not isinstance(result, list):
        return lines

    pages = result
    if pages and isinstance(pages[0], list):
        pages = [line for page in pages for line in (page or [])]

    for item in pages:
        try:
            text = item[1][0]
            confidence = _as_float(item[1][1])
        except (TypeError, IndexError):
            continue

        if not isinstance(text, str) or not text.strip():
            continue

        line: dict[str, Any] = {"text": text.strip()}
        if confidence is not None:
            line["confidence"] = confidence
        lines.append(line)

    return lines


def main() -> None:
    if len(sys.argv) != 2:
        _emit({"error": "Usage: paddle_handwriting_ocr.py <image-path>"}, 2)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        _emit({"error": f"Image not found: {image_path}"}, 2)

    try:
        from paddleocr import PaddleOCR
    except Exception:
        _emit(
            {
                "error": "PaddleOCR is not installed. Install with: python -m pip install paddleocr"
            },
            3,
        )

    device = os.environ.get("PADDLEOCR_DEVICE", "cpu")
    model = os.environ.get("PADDLEOCR_MODEL", "PP-OCRv5_server_rec")

    try:
        try:
            ocr = PaddleOCR(
                text_recognition_model_name=model,
                use_doc_orientation_classify=True,
                use_doc_unwarping=True,
                use_textline_orientation=True,
                device=device,
            )
            output = ocr.predict(image_path)
            lines = []
            for result in output:
                lines.extend(_collect_from_v3_result(result))
        except TypeError:
            ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
            output = ocr.ocr(image_path, cls=True)
            lines = _collect_from_v2_result(output)
    except Exception as exc:
        _emit({"error": f"PaddleOCR failed: {exc}"}, 4)

    _emit({"lines": lines})


if __name__ == "__main__":
    main()
