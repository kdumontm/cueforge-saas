"""
Waveform peak extraction and spectral analysis for frontend visualization.

Generates downsampled waveform peaks (~800 points) and spectral energy bands
for colored waveform rendering. Stores data in TrackAnalysis for future retrieval.
"""
import logging
import os
from typing import Dict, List, Optional, Tuple

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.track import Track, TrackAnalysis
from app.models.user import User
from app.middleware.auth import get_current_user
from app.schemas.track import TrackResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/waveforms", tags=["waveforms"])


def extract_waveform_peaks(
    file_path: str,
    num_peaks: int = 800,
) -> Tuple[Optional[List[float]], Optional[Dict[str, float]]]:
    """
    Extract waveform peaks from audio file for frontend visualization.

    Args:
        file_path: Path to audio file
        num_peaks: Number of peak samples to extract (default ~800 for good detail)

    Returns:
        Tuple of (peaks_list, spectral_energy_dict) or (None, None) on error
        - peaks_list: Normalized float values 0.0-1.0, length num_peaks
        - spectral_energy_dict: {
            "low_energy": 0.0-1.0,     # ~0-500Hz
            "mid_energy": 0.0-1.0,     # ~500-4000Hz
            "high_energy": 0.0-1.0,    # ~4000Hz+
          }
    """
    try:
        import librosa

        # Load audio at reduced sample rate for efficiency
        y, sr = librosa.load(file_path, sr=22050, mono=True)

        # Safety check
        if len(y) == 0:
            logger.warning(f"Empty audio: {file_path}")
            return None, None

        # Compute RMS energy to get signal strength
        frame_length = len(y) // num_peaks
        if frame_length < 1:
            frame_length = 1

        peaks = []
        for i in range(num_peaks):
            start = i * frame_length
            end = min(start + frame_length, len(y))
            if start >= len(y):
                break

            # RMS for this frame
            frame = y[start:end]
            rms = np.sqrt(np.mean(frame ** 2))
            peaks.append(float(rms))

        # Normalize peaks to 0-1
        max_peak = max(peaks) if peaks else 1.0
        if max_peak > 0:
            peaks = [p / max_peak for p in peaks]
        else:
            peaks = [0.0] * num_peaks

        # Pad/trim to exact num_peaks
        if len(peaks) < num_peaks:
            peaks.extend([0.0] * (num_peaks - len(peaks)))
        else:
            peaks = peaks[:num_peaks]

        # --- Spectral Analysis ---
        # Compute mel spectrogram for spectral energy bands
        S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
        S_db = librosa.power_to_db(S, ref=np.max)

        # Map mel bands to frequency ranges (mel-scale is perceptual)
        # 128 mel bands span full hearing range
        low_band = 128 // 6      # bottom 1/6 ~ 0-500Hz
        mid_band = 128 // 2      # middle ~ 500-4000Hz
        high_band = 128          # top ~ 4000Hz+

        low_energy = float(np.mean(S_db[:low_band])) if low_band > 0 else -80.0
        mid_energy = float(np.mean(S_db[low_band:mid_band]))
        high_energy = float(np.mean(S_db[mid_band:high_band])) if high_band > mid_band else -80.0

        # Normalize dB values to 0-1 range (-80dB to 0dB â 0.0 to 1.0)
        low_energy = max(0.0, min(1.0, (low_energy + 80) / 80))
        mid_energy = max(0.0, min(1.0, (mid_energy + 80) / 80))
        high_energy = max(0.0, min(1.0, (high_energy + 80) / 80))

        spectral_energy = {
            "low_energy": round(low_energy, 3),     # bass/kick
            "mid_energy": round(mid_energy, 3),     # body/warmth
            "high_energy": round(high_energy, 3),   # clarity/hi-hats
        }

        logger.info(
            f"Waveform extracted: {len(peaks)} peaks, "
            f"spectral={spectral_energy}"
        )
        return peaks, spectral_energy

    except ImportError:
        logger.error("librosa not installed â cannot extract waveform peaks")
        return None, None
    except Exception as e:
        logger.error(f"Waveform extraction failed for {file_path}: {e}")
        return None, None


def _generate_waveform_background(
    track_id: int,
    file_path: str,
):
    """Background task: extract and store waveform data."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        # Extract waveform
        peaks, spectral = extract_waveform_peaks(file_path)

        if peaks is None or spectral is None:
            logger.warning(f"Failed to extract waveform for track {track_id}")
            return

        # Store in database
        analysis = db.query(TrackAnalysis).filter(
            TrackAnalysis.track_id == track_id
        ).first()

        if not analysis:
            logger.warning(f"No analysis record for track {track_id}")
            return

        analysis.waveform_peaks = peaks
        analysis.spectral_energy = spectral
        db.commit()

        logger.info(f"Waveform stored for track {track_id}")

    except Exception as e:
        logger.error(f"Background waveform task failed: {e}")
    finally:
        db.close()


# ââ Endpoints âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

@router.post("/{track_id}/generate", response_model=Dict)
async def generate_waveform(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Extract and store waveform peaks + spectral energy for a track.
    Runs in background; returns immediately with status.

    The waveform data will be stored in TrackAnalysis and available
    via GET /waveforms/{track_id}.
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=400, detail="Audio file not accessible")

    # Queue background task
    background_tasks.add_task(
        _generate_waveform_background,
        track_id=track_id,
        file_path=track.file_path,
    )

    return {
        "status": "generating",
        "message": "Waveform extraction queued",
        "track_id": track_id,
    }


@router.get("/{track_id}", response_model=Dict)
async def get_waveform(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve pre-computed waveform peaks and spectral energy for a track.

    Returns:
        {
            "track_id": int,
            "waveform_peaks": [float, ...],  # 800 normalized values 0.0-1.0
            "spectral_energy": {
                "low_energy": float,
                "mid_energy": float,
                "high_energy": float,
            },
            "generated_at": ISO timestamp,
        }
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()

    if not analysis or analysis.waveform_peaks is None:
        raise HTTPException(
            status_code=404,
            detail="Waveform data not available. Generate with POST /waveforms/{track_id}/generate",
        )

    return {
        "track_id": track_id,
        "waveform_peaks": analysis.waveform_peaks,
        "spectral_energy": analysis.spectral_energy or {},
        "generated_at": analysis.analyzed_at.isoformat() if analysis.analyzed_at else None,
    }


@router.post("/{track_id}/regenerate", response_model=Dict)
async def regenerate_waveform(
    track_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Force regenerate waveform, overwriting existing data.
    Useful if extraction previously failed or settings have changed.
    """
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id,
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.file_path or not os.path.exists(track.file_path):
        raise HTTPException(status_code=400, detail="Audio file not accessible")

    # Clear old waveform
    analysis = db.query(TrackAnalysis).filter(
        TrackAnalysis.track_id == track_id
    ).first()

    if analysis:
        analysis.waveform_peaks = None
        analysis.spectral_energy = None
        db.commit()

    # Queue background task
    background_tasks.add_task(
        _generate_waveform_background,
        track_id=track_id,
        file_path=track.file_path,
    )

    return {
        "status": "regenerating",
        "message": "Waveform regeneration queued",
        "track_id": track_id,
    }
