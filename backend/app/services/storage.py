"""
Storage service — sauvegarde et lecture des fichiers audio uploadés.

Sécurité (fix path traversal) :
- Tout chemin servi depuis la DB est validé via _safe_path()
- Si le chemin résolu sort du répertoire UPLOAD_DIR → rejeté
"""
import hashlib
import os
from pathlib import Path
from typing import Optional

# Upload directory configuration
UPLOAD_DIR = os.path.realpath(os.getenv("UPLOAD_DIR", "uploads/"))

# Magic bytes des formats audio autorisés
AUDIO_MAGIC_BYTES: dict[str, list[bytes]] = {
    ".mp3":  [b"\xff\xfb", b"\xff\xf3", b"\xff\xf2", b"ID3"],
    ".wav":  [b"RIFF"],
    ".flac": [b"fLaC"],
    ".aiff": [b"FORM"],
    ".aif":  [b"FORM"],
    ".m4a":  [b"\x00\x00\x00\x18ftypM4A", b"\x00\x00\x00\x20ftyp"],
    ".ogg":  [b"OggS"],
    ".opus": [b"OggS"],
}


def ensure_upload_dir() -> None:
    """Crée le répertoire d'upload si nécessaire."""
    Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def validate_audio_magic_bytes(content: bytes, ext: str) -> bool:
    """
    🔴 FIX (faille 4) : Vérifie les magic bytes du fichier, pas seulement l'extension.
    Empêche d'uploader un fichier malveillant renommé en .mp3.
    """
    signatures = AUDIO_MAGIC_BYTES.get(ext, [])
    if not signatures:
        return False  # Extension inconnue → rejeté
    return any(content[:len(sig)] == sig for sig in signatures)


def safe_path(file_path: str) -> Optional[str]:
    """
    🔴 FIX (faille 5) : Valide qu'un chemin issu de la DB reste dans UPLOAD_DIR.
    Bloque toute tentative de path traversal (../../etc/passwd, etc.).

    Returns:
        Le chemin absolu résolu si sûr, None sinon.
    """
    resolved = os.path.realpath(file_path)
    if not resolved.startswith(UPLOAD_DIR + os.sep) and resolved != UPLOAD_DIR:
        return None
    return resolved


def save_upload(file_content: bytes, filename: str) -> str:
    """
    Sauvegarde un fichier uploadé dans UPLOAD_DIR.
    Le filename doit déjà être un UUID + extension propre (généré côté router).
    """
    ensure_upload_dir()

    # Nom déjà sanitisé (UUID + ext connue) — on filtre quand même les caractères dangereux
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._-")
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    # Unicité
    counter = 1
    base, ext = os.path.splitext(safe_filename)
    while os.path.exists(file_path):
        file_path = os.path.join(UPLOAD_DIR, f"{base}_{counter}{ext}")
        counter += 1

    with open(file_path, "wb") as f:
        f.write(file_content)

    return file_path


def delete_file(file_path: str) -> bool:
    """Supprime un fichier de manière sécurisée (vérifie qu'il est dans UPLOAD_DIR)."""
    resolved = safe_path(file_path)
    if not resolved:
        return False
    try:
        if os.path.exists(resolved):
            os.remove(resolved)
            return True
        return False
    except Exception:
        return False


def file_exists(file_path: str) -> bool:
    """Vérifie si un fichier existe (chemin validé)."""
    resolved = safe_path(file_path)
    return bool(resolved and os.path.exists(resolved))


def get_file_size(file_path: str) -> Optional[int]:
    """Retourne la taille d'un fichier en bytes (chemin validé)."""
    try:
        resolved = safe_path(file_path)
        if resolved and os.path.exists(resolved):
            return os.path.getsize(resolved)
        return None
    except Exception:
        return None
