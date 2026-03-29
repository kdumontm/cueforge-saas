"""
Service Media — Upload et gestion des fichiers médias (images, logos).

Supporte le stockage local et S3 (selon STORAGE_BACKEND dans la config).
"""
import os
import uuid
import shutil
from datetime import datetime
from typing import Optional
from pathlib import Path

from fastapi import UploadFile, HTTPException

from app.config import get_settings

# Types MIME autorisés
ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/svg+xml", "image/x-icon",
}

# Taille max : 10 MB
MAX_FILE_SIZE = 10 * 1024 * 1024

MEDIA_DIR = "media"


def _ensure_media_dir() -> Path:
    """Crée le dossier media s'il n'existe pas."""
    settings = get_settings()
    base = Path(getattr(settings, 'UPLOAD_DIR', 'uploads')).parent / MEDIA_DIR
    base.mkdir(parents=True, exist_ok=True)
    return base


async def upload_media_file(
    file: UploadFile,
    category: str = "general",
) -> dict:
    """
    Upload un fichier média.

    Returns:
        dict avec filename, stored_filename, file_url, file_size, mime_type
    """
    # Vérifier le type MIME
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Type de fichier non autorisé : {file.content_type}. "
                   f"Types acceptés : {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )

    # Lire le contenu
    content = await file.read()

    # Vérifier la taille
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Fichier trop volumineux ({len(content) // (1024*1024)} MB). "
                   f"Maximum : {MAX_FILE_SIZE // (1024*1024)} MB.",
        )

    settings = get_settings()

    # Générer un nom unique
    ext = Path(file.filename or "image").suffix or ".jpg"
    stored_filename = f"{category}/{uuid.uuid4().hex}{ext}"

    if getattr(settings, 'STORAGE_BACKEND', 'local') == "s3" and getattr(settings, 'S3_BUCKET', None):
        file_url = await _upload_to_s3(content, stored_filename, file.content_type)
    else:
        file_url = _upload_to_local(content, stored_filename)

    return {
        "filename": file.filename,
        "stored_filename": stored_filename,
        "file_url": file_url,
        "file_size": len(content),
        "mime_type": file.content_type,
    }


def _upload_to_local(content: bytes, stored_filename: str) -> str:
    """Enregistre le fichier localement."""
    media_dir = _ensure_media_dir()
    file_path = media_dir / stored_filename
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with open(file_path, "wb") as f:
        f.write(content)

    return f"/media/{stored_filename}"


async def _upload_to_s3(content: bytes, stored_filename: str, content_type: str) -> str:
    """Upload vers S3."""
    try:
        import boto3
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="boto3 non installé — stockage S3 non disponible.",
        )

    settings = get_settings()
    s3 = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    )

    key = f"media/{stored_filename}"
    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=content_type,
    )

    return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"


def delete_media_file(stored_filename: str) -> bool:
    """Supprime un fichier média (local ou S3)."""
    settings = get_settings()

    if getattr(settings, 'STORAGE_BACKEND', 'local') == "s3" and getattr(settings, 'S3_BUCKET', None):
        return _delete_from_s3(stored_filename)
    else:
        return _delete_from_local(stored_filename)


def _delete_from_local(stored_filename: str) -> bool:
    """Supprime le fichier local."""
    media_dir = _ensure_media_dir()
    file_path = media_dir / stored_filename
    if file_path.exists():
        file_path.unlink()
        return True
    return False


def _delete_from_s3(stored_filename: str) -> bool:
    """Supprime de S3."""
    try:
        import boto3
    except ImportError:
        return False

    settings = get_settings()
    s3 = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
    )

    key = f"media/{stored_filename}"
    s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)
    return True
