"""Audio decoding with caching and mmap for fast shared access across analysis phases."""
import os
import time
import logging
import hashlib
import numpy as np
import librosa
from pathlib import Path
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

# Constants (match audio_analysis.py)
SR = 22050
MAX_DURATION = 600  # 10 min
CACHE_DIR = Path("/tmp/trackcue_decoded")
CACHE_TTL_SECONDS = 86400  # 24h
MAX_CACHE_SIZE_GB = 5.0
CLEANUP_INTERVAL_SECONDS = 60

# Track last cleanup to avoid hammer
_last_cleanup_time = 0


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


def _ensure_cache_dir():
    """Ensure cache directory exists."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _cleanup_old_files():
    """Best-effort cleanup of files > 24h old, max 1x per minute."""
    global _last_cleanup_time
    now = time.time()
    
    if now - _last_cleanup_time < CLEANUP_INTERVAL_SECONDS:
        return
    
    _last_cleanup_time = now
    
    try:
        _ensure_cache_dir()
        for file in CACHE_DIR.glob("*.npy"):
            if os.path.getmtime(file) < now - CACHE_TTL_SECONDS:
                try:
                    os.remove(file)
                    logger.debug(f"Cleaned up old cache file: {file}")
                except Exception as e:
                    logger.warning(f"Failed to cleanup {file}: {e}")
    except Exception as e:
        logger.warning(f"Cache cleanup failed: {e}")


def _get_cache_size_gb() -> float:
    """Get total cache size in GB."""
    try:
        _ensure_cache_dir()
        total = sum(f.stat().st_size for f in CACHE_DIR.glob("*.npy") if f.is_file())
        return total / (1024 ** 3)
    except Exception:
        return 0.0


def _purge_lru_if_needed():
    """Purge least recently used files if cache > MAX_CACHE_SIZE_GB."""
    try:
        size_gb = _get_cache_size_gb()
        if size_gb > MAX_CACHE_SIZE_GB:
            logger.info(f"Cache at {size_gb:.2f} GB, purging LRU")
            
            _ensure_cache_dir()
            files = sorted(
                CACHE_DIR.glob("*.npy"),
                key=lambda f: os.path.getmtime(f)
            )
            
            removed = 0
            for file in files:
                if _get_cache_size_gb() <= MAX_CACHE_SIZE_GB * 0.8:
                    break
                try:
                    os.remove(file)
                    removed += 1
                except Exception as e:
                    logger.warning(f"Failed to remove {file}: {e}")
            
            logger.info(f"Purged {removed} LRU cache files")
    except Exception as e:
        logger.warning(f"LRU purge failed: {e}")


def decode_audio_cached(
    file_path: str,
    sr: int = SR,
    max_duration: int = MAX_DURATION,
    trim_to_duration: Optional[float] = None,
) -> Tuple[np.ndarray, int]:
    """
    Load audio file with caching and mmap.
    
    Returns a numpy array and sample rate. If trim_to_duration is specified,
    the array is trimmed to that duration (in seconds).
    
    Args:
        file_path: Path to audio file
        sr: Target sample rate (default 22050)
        max_duration: Max duration to load (default 600s)
        trim_to_duration: Optional duration to trim to (in seconds)
    
    Returns:
        (audio_array, sample_rate)
    """
    # Cleanup old files (best-effort, once per minute)
    _cleanup_old_files()
    
    file_hash = _get_file_hash(file_path)
    cache_path = CACHE_DIR / f"{file_hash}_sr{sr}_dur{max_duration}.npy"
    
    # Try to load from cache
    if cache_path.exists():
        try:
            # Use mmap_mode='r' for instant load (no actual I/O yet)
            y = np.load(cache_path, mmap_mode='r')
            logger.debug(f"Loaded {file_path} from cache (mmap, {y.shape[0]} samples)")
            
            # If trim requested, trim now
            if trim_to_duration is not None:
                trim_samples = int(trim_to_duration * sr)
                y = y[:trim_samples].copy()
            else:
                # Return a copy to avoid mmap read-only issues
                y = np.array(y, dtype=np.float32)
            
            return y, sr
        except Exception as e:
            logger.warning(f"Failed to load cached audio {cache_path}: {e}")
            # Fall through to decode
    
    # Decode from source
    logger.debug(f"Decoding {file_path} (max {max_duration}s)")
    y, sr_loaded = librosa.load(
        file_path,
        sr=sr,
        duration=max_duration,
        mono=True,
        dtype=np.float32,
    )
    
    # Save to cache
    try:
        _ensure_cache_dir()
        np.save(cache_path, y)
        logger.debug(f"Cached {file_path} at {cache_path}")
        
        # Check if we need to purge LRU
        _purge_lru_if_needed()
    except Exception as e:
        logger.warning(f"Failed to cache {file_path}: {e}")
    
    # Trim if needed
    if trim_to_duration is not None:
        trim_samples = int(trim_to_duration * sr)
        y = y[:trim_samples]
    
    return y, sr
