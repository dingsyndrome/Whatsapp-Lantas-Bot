"""PaddleOCR (PP-OCR) untuk SIGAP.

Menerima path gambar dan mengeluarkan JSON:
    { "lines": [{ "text": ..., "score": ..., "box": [[x, y], ...] }] }

Mendukung dua pembungkus:
- `rapidocr` (v3)  → PaddleOCR PP-OCRv4/v5 via ONNX
- `rapidocr_onnxruntime` (v1/v2, lama)

Jalankan: python scripts/paddle_ocr.py <path-gambar>
"""
import json
import sys


def run_v3(image_path):
    from rapidocr import RapidOCR

    engine = RapidOCR()
    result = engine(image_path)

    txts = getattr(result, "txts", None)
    scores = getattr(result, "scores", None)
    boxes = getattr(result, "boxes", None)

    lines = []
    if txts is None:
        return lines
    for index, text in enumerate(txts):
        score = float(scores[index]) if scores is not None and index < len(scores) else 0.0
        box = boxes[index] if boxes is not None and index < len(boxes) else []
        try:
            points = [[float(point[0]), float(point[1])] for point in box]
        except (TypeError, IndexError):
            points = []
        lines.append({"text": str(text), "score": score, "box": points})
    return lines


def run_legacy(image_path):
    from rapidocr_onnxruntime import RapidOCR

    engine = RapidOCR()
    result, _elapse = engine(image_path)
    lines = []
    for item in result or []:
        try:
            box, text, score = item[0], item[1], item[2]
        except (IndexError, TypeError):
            continue
        lines.append(
            {
                "text": str(text),
                "score": float(score),
                "box": [[float(point[0]), float(point[1])] for point in box],
            }
        )
    return lines


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "path gambar wajib diberikan"}), file=sys.stderr)
        return 2

    image_path = sys.argv[1]
    try:
        try:
            lines = run_v3(image_path)
        except ImportError:
            lines = run_legacy(image_path)
    except Exception as error:  # noqa: BLE001 - diteruskan ke Node
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}), file=sys.stderr)
        return 3

    print(json.dumps({"lines": lines}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
