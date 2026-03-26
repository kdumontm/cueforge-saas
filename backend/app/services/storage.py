from typing import Optional
import os
import shutil
from pathlib import Path

# Upload directory configuration
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads/")


def ensure_upload_dir() -> None:
    """Ensure upload directory exists."""
    Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def save_upload(file_content: bytes, filename: str) -> str:
    """
    Save uploaded file to local storage.

    Args:
        file_content: File content as bytes
        filename: Original filename

    Returns:
        Path to saved file relative to UPLOAD_DIR
    """
    ensure_upload_dir()

    # Create safe filename
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._-")
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Ensure unique filename
    counter = 1
    base, ext = os.path.splitext(safe_filename)
    while os.path.exists(file_path):
        file_path = os.path.join(UPLOAD_DIR, f"{base}_{counter}{ext}")
        counter += 1

    # Write file
    with open(file_path, 'wb') as f:
        f.write(file_content)

    return file_path


def delete_file(file_path: str) -> bool:
    """
    Delete a file from local storage.

    Args:
        file_path: Path to file to delete

    Returns:
        True if successful, False otherwise
    """
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return True
        return False
    except Exception:
        return False


def file_exists(file_path: str) -> bool:
    """Check if a file exists."""
    return os.path.exists(file_path)


def get_file_size(file_path: str) -> Optional[int]:
    """Get file size in bytes."""
    try:
        if os.path.exists(file_path):
            return os.path.getsize(file_path)
        return None
    except Exception:
        return None
