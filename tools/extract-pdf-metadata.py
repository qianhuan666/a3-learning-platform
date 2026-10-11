import argparse
import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def build_chunks(page_texts, chunk_chars: int):
    chunks = []
    buffer = []
    start_page = None
    end_page = None

    def flush():
        nonlocal buffer, start_page, end_page
        body = clean_text(" ".join(buffer))
        if body:
            chunks.append(
                {
                    "heading": f"PDF pages {start_page}-{end_page}",
                    "body": body,
                    "page_ref": f"{start_page}-{end_page}",
                    "token_count": max(1, len(body) // 2),
                    "metadata": {"page_start": start_page, "page_end": end_page},
                }
            )
        buffer = []
        start_page = None
        end_page = None

    for page_no, text in page_texts:
        if not text:
            continue
        if start_page is None:
            start_page = page_no
        end_page = page_no
        if sum(len(part) for part in buffer) + len(text) > chunk_chars and buffer:
            flush()
            start_page = page_no
            end_page = page_no
        buffer.append(text)
    flush()
    return chunks


def main():
    parser = argparse.ArgumentParser(description="Extract lightweight PDF metadata and text chunks for A3.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--chunk-chars", type=int, default=3200)
    parser.add_argument("--min-text-chars", type=int, default=800)
    args = parser.parse_args()

    pdf_path = args.pdf.resolve()
    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)
    page_texts = []
    extraction_errors = []

    for index, page in enumerate(reader.pages, start=1):
        try:
            text = clean_text(page.extract_text() or "")
        except Exception as error:  # pypdf can fail on malformed page objects.
            text = ""
            extraction_errors.append({"page": index, "error": str(error)[:180]})
        if text:
            page_texts.append((index, text))

    text_chars = sum(len(text) for _, text in page_texts)
    non_empty_pages = len(page_texts)
    has_text_layer = text_chars >= args.min_text_chars and non_empty_pages >= max(2, int(page_count * 0.05))
    chunks = build_chunks(page_texts, args.chunk_chars) if has_text_layer else []

    metadata = {
        "file_name": pdf_path.name,
        "file_size_bytes": pdf_path.stat().st_size,
        "sha256": sha256_file(pdf_path),
        "page_count": page_count,
        "is_encrypted": bool(getattr(reader, "is_encrypted", False)),
        "pdf_metadata": {str(key): str(value) for key, value in (reader.metadata or {}).items()},
        "text_layer": has_text_layer,
        "ocr_required": not has_text_layer,
        "text_chars": text_chars,
        "non_empty_pages": non_empty_pages,
        "chunks": chunks,
        "extraction_errors": extraction_errors[:20],
    }

    print(json.dumps(metadata, ensure_ascii=False))


if __name__ == "__main__":
    main()
