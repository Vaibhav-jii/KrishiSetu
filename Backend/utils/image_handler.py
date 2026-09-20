"""
KisanMind Image Handler
━━━━━━━━━━━━━━━━━━━━━━━
Handles image conversion from multipart uploads to base64,
ready for Gemini Vision API consumption.
"""

import base64
import io
from typing import Optional

from fastapi import UploadFile


async def upload_to_base64(upload_file: UploadFile) -> Optional[str]:
    """
    Read a FastAPI UploadFile and return its content as a
    base64-encoded string. Returns None if the file is empty
    or unreadable.
    """
    if upload_file is None:
        return None

    try:
        contents = await upload_file.read()
        if not contents:
            return None
        return base64.b64encode(contents).decode("utf-8")
    except Exception:
        return None


def get_image_mime_type(upload_file: UploadFile) -> str:
    """Infer MIME type from the upload's content_type or filename."""
    if upload_file.content_type and upload_file.content_type.startswith("image/"):
        return upload_file.content_type

    filename = (upload_file.filename or "").lower()
    if filename.endswith(".png"):
        return "image/png"
    elif filename.endswith(".webp"):
        return "image/webp"
    elif filename.endswith(".gif"):
        return "image/gif"
    else:
        return "image/jpeg"  # safe default


def base64_to_bytes(b64_string: str) -> bytes:
    """Decode a base64 string back to raw bytes (for PDF embedding, etc.)."""
    return base64.b64decode(b64_string)


def validate_image_size(b64_string: str, max_mb: float = 10.0) -> bool:
    """Check that the base64 payload doesn't exceed max_mb."""
    size_bytes = len(b64_string) * 3 / 4  # approximate decoded size
    return size_bytes <= max_mb * 1024 * 1024
