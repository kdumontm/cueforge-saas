"""
v6.8: Security utilities — input validation, file checks, rate limiting, response caching.

Used across routers to harden API surface without polluting business logic.
"""
import hashlib
import logging
import os
import time
from collections import defaultdict
from functools import wraps
from typing import Optional, Set

from fastapi import HTTPException, Request, Response

logger = logging.getLogger(__name__)

# ── File validation ─────────────────────────────────────────────────────

ALLOWED_AUDIO_EXTENSIONS: Set[str] = {
    ".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".ogg", ".opus",
}

# Magic bytes for common audio formats
MAGIC_BYTES = {
    b"\xff\xfb": "mp3",          # MP3 frame sync
    b"\xff\xf3": "mp3",          # MP3 frame sync (variant)
    b"\xff\xf2": "mp3",          # MP3 frame sync (variant)
    b"ID3": "mp3",               # MP3 with ID3 tag
    b"RIFF": "wav",              # WAV
    b"fLaC": "flac",             # FLAC
    b"FORM": "aiff",             # AIFF
    b"OggS": "ogg",              # OGG/Opus
    b"\x00\x00\x00": "m4a",     # M4A/MP4 (partial — ftyp follows)
}

MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB hard limit


def validate_audio_file(file_path: str, max_size_mb: int = 500) -> None:
    """
    Validate an audio file:
    - Exists on disk
    - Extension is allowed
    - File size within limits
    - Magic bytes match an audio format (not a ZIP bomb, executable, etc.)

    Raises HTTPException on failure.
    """
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")

    # Extension check
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid audio format: {ext}. Allowed: {', '.join(sorted(ALLOWED_AUDIO_EXTENSIONS))}",
        )

    # Size check
    file_size = os.path.getsize(file_path)
    max_bytes = max_size_mb * 1024 * 1024
    if file_size > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file_size / (1024*1024):.1f} MB (max {max_size_mb} MB)",
        )

    if file_size == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    # Magic bytes check (read first 12 bytes)
    try:
        with open(file_path, "rb") as f:
            header = f.read(12)

        matched = False
        for magic, fmt in MAGIC_BYTES.items():
            if header.startswith(magic):
                matched = True
                break

        # Also check for M4A/MP4 ftyp box
        if not matched and b"ftyp" in header[:12]:
            matched = True

        if not matched:
            logger.warning(f"[SECURITY] File failed magic byte check: {file_path}")
            raise HTTPException(
                status_code=400,
                detail="File does not appear to be a valid audio file (invalid header)",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Magic byte check error: {e}")


# ── Input sanitization ──────────────────────────────────────────────────

def sanitize_string(value: Optional[str], max_length: int = 255) -> Optional[str]:
    """Sanitize string input: strip, truncate, remove null bytes."""
    if value is None:
        return None
    # Remove null bytes and control characters (except newline/tab)
    cleaned = "".join(c for c in value if c == "\n" or c == "\t" or (ord(c) >= 32))
    cleaned = cleaned.strip()
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length]
    return cleaned or None


def sanitize_filename(filename: str) -> str:
    """Sanitize filename: remove path traversal, special chars."""
    # Remove path components
    filename = os.path.basename(filename)
    # Remove null bytes
    filename = filename.replace("\x00", "")
    # Replace dangerous characters
    for ch in ['..', '/', '\\', '<', '>', '|', '"', "'", '`', ';', '&', '$']:
        filename = filename.replace(ch, "_")
    return filename.strip() or "unnamed"


def validate_track_id(track_id: int) -> None:
    """Validate track ID is a reasonable integer."""
    if track_id < 1 or track_id > 2_147_483_647:
        raise HTTPException(status_code=400, detail="Invalid track ID")


# ── In-memory rate limiter ──────────────────────────────────────────────

class RateLimiter:
    """
    Simple in-memory rate limiter per user.
    Not suitable for multi-process — use Redis for production.
    """

    def __init__(self):
        self._requests: dict = defaultdict(list)  # user_id -> [timestamps]

    def check(self, user_id: int, limit: int = 60, window_seconds: int = 60) -> None:
        """
        Check if user is within rate limit.
        Raises HTTPException 429 if limit exceeded.
        """
        now = time.time()
        cutoff = now - window_seconds
        # Clean old entries
        self._requests[user_id] = [t for t in self._requests[user_id] if t > cutoff]
        if len(self._requests[user_id]) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: {limit} requests per {window_seconds}s",
            )
        self._requests[user_id].append(now)


# Global rate limiter instances
analysis_limiter = RateLimiter()     # For analysis endpoints (expensive)
general_limiter = RateLimiter()      # For general API calls


# ── ETag / caching helpers ──────────────────────────────────────────────

def compute_etag(data: dict) -> str:
    """Compute ETag from dict (hash of sorted JSON-like representation)."""
    import json
    raw = json.dumps(data, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


def add_cache_headers(response: Response, etag: str, max_age: int = 3600) -> None:
    """Add ETag and Cache-Control headers to response."""
    response.headers["ETag"] = f'"{etag}"'
    response.headers["Cache-Control"] = f"private, max-age={max_age}"


def check_etag(request: Request, etag: str) -> bool:
    """Check if client's If-None-Match matches current ETag. Return True if cached."""
    client_etag = request.headers.get("If-None-Match", "").strip('"')
    return client_etag == etag


# ── ZIP bomb protection ─────────────────────────────────────────────────

MAX_ZIP_RATIO = 100  # Max compression ratio (uncompressed/compressed)
MAX_ZIP_FILES = 1000  # Max files in a ZIP archive


def validate_zip_safe(zip_path: str) -> None:
    """
    Validate ZIP file against ZIP bomb attacks.
    Checks compression ratio and file count.
    """
    import zipfile

    if not zipfile.is_zipfile(zip_path):
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    compressed_size = os.path.getsize(zip_path)
    if compressed_size == 0:
        raise HTTPException(status_code=400, detail="Empty ZIP file")

    with zipfile.ZipFile(zip_path, "r") as zf:
        # Check file count
        if len(zf.namelist()) > MAX_ZIP_FILES:
            raise HTTPException(
                status_code=400,
                detail=f"ZIP contains too many files (max {MAX_ZIP_FILES})",
            )

        # Check total uncompressed size
        total_uncompressed = sum(info.file_size for info in zf.infolist())
        ratio = total_uncompressed / compressed_size if compressed_size > 0 else 0

        if ratio > MAX_ZIP_RATIO:
            logger.warning(f"[SECURITY] ZIP bomb detected: ratio={ratio:.1f}x")
            raise HTTPException(
                status_code=400,
                detail="ZIP file appears to be a ZIP bomb (suspicious compression ratio)",
            )

        # Check for path traversal in filenames
        for name in zf.namelist():
            if ".." in name or name.startswith("/"):
                raise HTTPException(
                    status_code=400,
                    detail="ZIP contains path traversal attack",
                )
