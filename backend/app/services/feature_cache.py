"""
Disk-based feature cache for audio analysis.
Caches expensive intermediate features (STFT, onset_strength, mel-spectrogram, beats)
so re-analyses don't recompute them.

Cache structure:
  /tmp/cueforge_feature_cache/
    {file_hash}/
      stft.npy
      onset_strength.npy
      mel_spectrogram.npy
      beats.npy
      metadata.json  (sr, duration, bpm, key, etc.)
      checkpoint.json  (for resume capability)
"""
import os
import json
import hashlib
import logging
import shutil
import numpy as np
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

CACHE_DIR = Path(os.environ.get('FEATURE_CACHE_DIR', '/tmp/cueforge_feature_cache'))
CACHE_TTL_DAYS = 30
MAX_CACHE_SIZE_GB = 5.0


def _get_file_hash(file_path: str) -> str:
    """Compute a fast hash of an audio file (first + last 1MB + file size)."""
    h = hashlib.md5()
    file_size = os.path.getsize(file_path)
    h.update(str(file_size).encode())

    with open(file_path, 'rb') as f:
        # First 1MB
        h.update(f.read(1024 * 1024))
        # Last 1MB
        if file_size > 2 * 1024 * 1024:
            f.seek(-1024 * 1024, 2)
            h.update(f.read(1024 * 1024))

    return h.hexdigest()


def _get_cache_path(file_hash: str) -> Path:
    """Get the cache directory for a given file hash."""
    return CACHE_DIR / file_hash


def _ensure_cache_dir():
    """Ensure cache directory exists."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def save_feature(file_path: str, feature_name: str, data: np.ndarray) -> bool:
    """Save a computed feature to disk cache."""
    try:
        _ensure_cache_dir()
        file_hash = _get_file_hash(file_path)
        cache_path = _get_cache_path(file_hash)
        cache_path.mkdir(parents=True, exist_ok=True)

        feature_path = cache_path / f"{feature_name}.npy"
        np.save(str(feature_path), data)

        # Update metadata
        meta_path = cache_path / "metadata.json"
        meta = {}
        if meta_path.exists():
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
            except Exception:
                meta = {}

        meta[f'{feature_name}_cached_at'] = datetime.utcnow().isoformat()
        meta['last_accessed'] = datetime.utcnow().isoformat()
        meta['file_path'] = file_path

        with open(meta_path, 'w') as f:
            json.dump(meta, f)

        logger.debug(f"Cached feature '{feature_name}' for {file_hash}")
        return True
    except Exception as e:
        logger.warning(f"Failed to cache feature '{feature_name}': {e}")
        return False


def load_feature(file_path: str, feature_name: str) -> Optional[np.ndarray]:
    """Load a cached feature from disk. Returns None if not found or expired."""
    try:
        file_hash = _get_file_hash(file_path)
        cache_path = _get_cache_path(file_hash)
        feature_path = cache_path / f"{feature_name}.npy"

        if not feature_path.exists():
            return None

        # Check TTL
        meta_path = cache_path / "metadata.json"
        if meta_path.exists():
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
                cached_at = meta.get(f'{feature_name}_cached_at')
                if cached_at:
                    cached_time = datetime.fromisoformat(cached_at)
                    if datetime.utcnow() - cached_time > timedelta(days=CACHE_TTL_DAYS):
                        logger.debug(f"Cache expired for '{feature_name}' ({file_hash})")
                        feature_path.unlink(missing_ok=True)
                        return None

                # Update last_accessed
                meta['last_accessed'] = datetime.utcnow().isoformat()
                with open(meta_path, 'w') as f:
                    json.dump(meta, f)
            except Exception:
                pass

        data = np.load(str(feature_path))
        logger.debug(f"Cache hit: '{feature_name}' for {file_hash}")
        return data
    except Exception as e:
        logger.warning(f"Failed to load cached feature '{feature_name}': {e}")
        return None


def save_analysis_checkpoint(file_path: str, checkpoint_data: Dict[str, Any]) -> bool:
    """Save an analysis checkpoint for resume capability."""
    try:
        _ensure_cache_dir()
        file_hash = _get_file_hash(file_path)
        cache_path = _get_cache_path(file_hash)
        cache_path.mkdir(parents=True, exist_ok=True)

        checkpoint_path = cache_path / "checkpoint.json"

        # Convert numpy arrays to lists for JSON serialization
        serializable = {}
        for key, value in checkpoint_data.items():
            if isinstance(value, np.ndarray):
                serializable[key] = value.tolist()
            elif isinstance(value, (np.float32, np.float64)):
                serializable[key] = float(value)
            elif isinstance(value, (np.int32, np.int64)):
                serializable[key] = int(value)
            else:
                serializable[key] = value

        serializable['_checkpoint_at'] = datetime.utcnow().isoformat()
        serializable['_completed_steps'] = checkpoint_data.get('_completed_steps', [])

        with open(checkpoint_path, 'w') as f:
            json.dump(serializable, f)

        logger.info(f"Checkpoint saved: steps={serializable['_completed_steps']}")
        return True
    except Exception as e:
        logger.warning(f"Failed to save checkpoint: {e}")
        return False


def load_analysis_checkpoint(file_path: str) -> Optional[Dict[str, Any]]:
    """Load an analysis checkpoint for resume. Returns None if no valid checkpoint."""
    try:
        file_hash = _get_file_hash(file_path)
        cache_path = _get_cache_path(file_hash)
        checkpoint_path = cache_path / "checkpoint.json"

        if not checkpoint_path.exists():
            return None

        with open(checkpoint_path) as f:
            data = json.load(f)

        # Check if checkpoint is recent enough (< 1 hour)
        checkpoint_at = data.get('_checkpoint_at')
        if checkpoint_at:
            checkpoint_time = datetime.fromisoformat(checkpoint_at)
            if datetime.utcnow() - checkpoint_time > timedelta(hours=1):
                logger.info("Checkpoint too old (>1h), starting fresh")
                checkpoint_path.unlink(missing_ok=True)
                return None

        completed = data.get('_completed_steps', [])
        logger.info(f"Resuming analysis from checkpoint: completed steps={completed}")
        return data
    except Exception as e:
        logger.warning(f"Failed to load checkpoint: {e}")
        return None


def clear_checkpoint(file_path: str):
    """Clear the checkpoint after successful analysis completion."""
    try:
        file_hash = _get_file_hash(file_path)
        checkpoint_path = _get_cache_path(file_hash) / "checkpoint.json"
        checkpoint_path.unlink(missing_ok=True)
        logger.debug(f"Checkpoint cleared for {file_hash}")
    except Exception:
        pass


def cleanup_old_cache():
    """Remove cached features older than TTL and enforce size limit."""
    if not CACHE_DIR.exists():
        return

    total_size = 0
    entries = []

    for entry_dir in CACHE_DIR.iterdir():
        if not entry_dir.is_dir():
            continue

        meta_path = entry_dir / "metadata.json"
        last_accessed = datetime.utcnow() - timedelta(days=CACHE_TTL_DAYS + 1)

        if meta_path.exists():
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
                la = meta.get('last_accessed')
                if la:
                    last_accessed = datetime.fromisoformat(la)
            except Exception:
                pass

        try:
            dir_size = sum(f.stat().st_size for f in entry_dir.rglob('*') if f.is_file())
        except Exception:
            dir_size = 0

        total_size += dir_size
        entries.append((entry_dir, last_accessed, dir_size))

    # Remove expired entries
    removed = 0
    for entry_dir, last_accessed, size in entries:
        if datetime.utcnow() - last_accessed > timedelta(days=CACHE_TTL_DAYS):
            try:
                shutil.rmtree(entry_dir, ignore_errors=True)
                total_size -= size
                removed += 1
            except Exception:
                pass

    # If still over size limit, remove oldest
    if total_size > MAX_CACHE_SIZE_GB * 1024**3:
        entries.sort(key=lambda x: x[1])  # Sort by last_accessed
        for entry_dir, _, size in entries:
            if not entry_dir.exists():
                continue
            try:
                shutil.rmtree(entry_dir, ignore_errors=True)
                total_size -= size
                removed += 1
            except Exception:
                pass
            if total_size <= MAX_CACHE_SIZE_GB * 1024**3 * 0.8:  # Clean to 80%
                break

    if removed > 0:
        logger.info(f"Cache cleanup: removed {removed} entries, "
                     f"remaining: {total_size / (1024**3):.1f} GB")


def get_cache_stats() -> dict:
    """Get cache statistics."""
    if not CACHE_DIR.exists():
        return {'entries': 0, 'size_mb': 0, 'path': str(CACHE_DIR)}

    entries = 0
    total_size = 0
    try:
        for entry_dir in CACHE_DIR.iterdir():
            if entry_dir.is_dir():
                entries += 1
                try:
                    total_size += sum(f.stat().st_size for f in entry_dir.rglob('*') if f.is_file())
                except Exception:
                    pass
    except Exception:
        pass

    return {
        'entries': entries,
        'size_mb': round(total_size / (1024**2), 1),
        'max_size_gb': MAX_CACHE_SIZE_GB,
        'ttl_days': CACHE_TTL_DAYS,
        'path': str(CACHE_DIR),
    }
