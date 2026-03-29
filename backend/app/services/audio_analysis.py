"""
CueForge Pro Audio Analysis Ã¢ÂÂ v3.0
State-of-the-art DJ-oriented audio analysis based on:
- MIREX/ISMIR music structure segmentation research
- Rekordbox/Mixed In Key/Serato analysis approaches
- Beat-synchronous feature extraction (MFCC + Chroma + Spectral Contrast)
- Novelty-based structural segmentation with checkerboard kernel on SSM
- Multi-factor drop detection (6 signals + adaptive thresholds)
- 4-bar/8-bar phrase grid alignment
- Krumhansl-Schmuckler key detection
- Full track analysis (no duration limit for DJ tracks)

References:
- Ellis (2007) dynamic programming beat tracking
- Foote (2000) novelty-based segmentation
- Serra et al. (2014) structure analysis in MIREX
- librosa beat-synchronous feature aggregation
"""
from typing import Dict, List, Optional, Tuple
import gc

import librosa
import numpy as np
from scipy.signal import find_peaks, medfilt
from scipy.ndimage import uniform_filter1d
from scipy.spatial.distance import cdist
from sqlalchemy.orm import Session

from app.models import Track, TrackAnalysis
from app.database import SessionLocal


# Ã¢ÂÂÃ¢ÂÂ Constants Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
SR = 22050
HOP_LENGTH = 512
N_FFT = 2048
MAX_DURATION = 600  # 10 min Ã¢ÂÂ covers all DJ tracks

# Ã¢ÂÂÃ¢ÂÂ Krumhansl-Schmuckler key profiles Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
KEY_NAMES_MAJOR = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
KEY_NAMES_MINOR = ["Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm"]


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   KEY DETECTION
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def detect_key_ks(y: np.ndarray, sr: int) -> Tuple[str, float]:
    """Krumhansl-Schmuckler key detection with CQT chroma for accuracy."""
    try:
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        best_corr = -1.0
        best_key = "C"
        for shift in range(12):
            shifted = np.roll(chroma_mean, -shift)
            corr_maj = float(np.corrcoef(shifted, KS_MAJOR)[0, 1])
            if corr_maj > best_corr:
                best_corr = corr_maj
                best_key = KEY_NAMES_MAJOR[shift]
            corr_min = float(np.corrcoef(shifted, KS_MINOR)[0, 1])
            if corr_min > best_corr:
                best_corr = corr_min
                best_key = KEY_NAMES_MINOR[shift]
        del chroma
        return best_key, round(best_corr, 4)
    except Exception:
        return "C", 0.0


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   BPM / BEAT DETECTION
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def detect_bpm_and_beats_from_y(y: np.ndarray, sr: int) -> Dict:
    """Detect BPM and beat positions using Ellis dynamic programming."""
    try:
        tempo, beats_frames = librosa.beat.beat_track(y=y, sr=sr)
        beats = librosa.frames_to_time(beats_frames, sr=sr).tolist()
        bpm = float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0])
        return {"bpm": bpm, "beats": beats, "beat_frames": beats_frames.tolist()}
    except Exception as e:
        raise Exception(f"Error detecting BPM and beats: {str(e)}")


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   BEAT-SYNCHRONOUS FEATURE EXTRACTION
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def extract_beat_sync_features(y: np.ndarray, sr: int, beat_frames: np.ndarray) -> Dict:
    """
    Extract beat-synchronous features for structural analysis.
    Based on MIREX best practices: MFCC (timbre) + Chroma (harmony) + Spectral Contrast.
    Features are aggregated per beat using median (chroma) and mean (MFCC, contrast).
    """
    hop = HOP_LENGTH

    # MFCC Ã¢ÂÂ captures timbre/texture changes
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop)
    mfcc_sync = librosa.util.sync(mfcc, beat_frames, aggregate=np.mean)

    # Chroma CQT Ã¢ÂÂ captures harmonic content
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.median)

    # Spectral contrast Ã¢ÂÂ captures spectral shape (peaks vs valleys)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr, hop_length=hop, n_bands=6)
    contrast_sync = librosa.util.sync(contrast, beat_frames, aggregate=np.mean)

    # RMS energy Ã¢ÂÂ beat-synchronous
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_sync = librosa.util.sync(rms.reshape(1, -1), beat_frames, aggregate=np.mean)[0]

    # Stack all features for structure analysis
    features = np.vstack([mfcc_sync, chroma_sync, contrast_sync])

    # Normalize each feature dimension to zero mean, unit variance
    features = (features - features.mean(axis=1, keepdims=True)) / (
        features.std(axis=1, keepdims=True) + 1e-8
    )

    del mfcc, chroma, contrast
    gc.collect()

    return {
        "features": features,      # (n_features, n_beats) Ã¢ÂÂ for SSM
        "rms_sync": rms_sync,       # (n_beats,) Ã¢ÂÂ beat-level energy
        "mfcc_sync": mfcc_sync,
        "chroma_sync": chroma_sync,
    }


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   NOVELTY-BASED STRUCTURAL SEGMENTATION (Foote 2000 + checkerboard)
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def compute_ssm_novelty(features: np.ndarray, kernel_size: int = 16) -> np.ndarray:
    """
    Compute novelty function from Self-Similarity Matrix using checkerboard kernel.
    This is the gold standard for music structure segmentation (Foote 2000, MIREX).

    1. Build SSM from cosine similarity of beat-sync features
    2. Apply checkerboard kernel along diagonal to detect structural changes
    3. Return novelty curve (peaks = section boundaries)
    """
    n_beats = features.shape[1]
    if n_beats < kernel_size * 2:
        return np.zeros(n_beats)

    # Compute SSM using cosine similarity (more robust than euclidean for music)
    S = 1.0 - cdist(features.T, features.T, metric='cosine')
    S = np.nan_to_num(S, nan=0.0)

    # Build checkerboard kernel
    half = kernel_size // 2
    kernel = np.ones((kernel_size, kernel_size))
    kernel[:half, :half] = -1   # top-left quadrant
    kernel[half:, half:] = -1   # bottom-right quadrant
    # Top-right and bottom-left stay +1

    # Apply kernel along the main diagonal
    novelty = np.zeros(n_beats)
    for i in range(half, n_beats - half):
        patch = S[i - half:i + half, i - half:i + half]
        if patch.shape == (kernel_size, kernel_size):
            novelty[i] = np.sum(patch * kernel)

    # Half-wave rectify (only positive = boundaries)
    novelty = np.maximum(novelty, 0)

    # Normalize
    max_val = np.max(novelty)
    if max_val > 0:
        novelty = novelty / max_val

    # Smooth slightly to reduce noise
    if len(novelty) > 5:
        novelty = uniform_filter1d(novelty, size=3)

    del S
    gc.collect()
    return novelty


def detect_sections_ssm(
    y: np.ndarray,
    sr: int,
    beats: List[float],
    beat_frames: List[int],
    drops: List[Dict],
    rms_sync: np.ndarray,
) -> List[Dict]:
    """
    Detect sections using SSM novelty + energy-based intelligent labeling.

    Process:
    1. Extract beat-synchronous features
    2. Build SSM and compute novelty function
    3. Pick peaks in novelty = section boundaries
    4. Label sections using energy + position + drop proximity + trend
    """
    try:
        hop = HOP_LENGTH
        duration = len(y) / sr
        n_beats = len(beats)

        if n_beats < 8:
            return [{"time": 0.0, "label": "INTRO", "duration": duration, "energy": 0.5}]

        beat_frames_arr = np.array(beat_frames)

        # Extract beat-synchronous features
        feat_data = extract_beat_sync_features(y, sr, beat_frames_arr)
        features = feat_data["features"]
        energy_sync = feat_data["rms_sync"]

        # Normalize energy for labeling
        energy_norm = energy_sync / (np.max(energy_sync) + 1e-8)

        # Compute SSM novelty
        # Kernel size: ~16 beats (4 bars in 4/4) is optimal for DJ music
        kernel_size = min(16, n_beats // 4)
        kernel_size = max(4, kernel_size)
        if kernel_size % 2 != 0:
            kernel_size += 1

        novelty = compute_ssm_novelty(features, kernel_size=kernel_size)

        # Pick novelty peaks = section boundaries
        # Minimum distance: 8 beats (2 bars) Ã¢ÂÂ DJ music rarely has sections < 2 bars
        min_dist_beats = max(8, kernel_size)

        # Adaptive threshold: use percentile of novelty values
        threshold = np.percentile(novelty[novelty > 0], 30) if np.any(novelty > 0) else 0.1

        peaks, properties = find_peaks(
            novelty,
            height=threshold,
            distance=min_dist_beats,
            prominence=0.05,
        )

        # Convert beat indices to time boundaries
        boundary_beats = [0] + peaks.tolist() + [n_beats - 1]
        boundary_times = [beats[b] if b < len(beats) else duration for b in boundary_beats]

        # Drop times for labeling
        drop_times = [d["time"] for d in drops]

        # Energy percentiles for adaptive labeling
        all_section_energies = []
        for i in range(len(boundary_beats) - 1):
            b_start = boundary_beats[i]
            b_end = boundary_beats[i + 1]
            if b_end > b_start:
                section_e = float(np.mean(energy_norm[b_start:b_end]))
                all_section_energies.append(section_e)

        if not all_section_energies:
            return [{"time": 0.0, "label": "INTRO", "duration": duration, "energy": 0.5}]

        e_arr = np.array(all_section_energies)
        e_p25 = float(np.percentile(e_arr, 25))
        e_median = float(np.percentile(e_arr, 50))
        e_p75 = float(np.percentile(e_arr, 75))

        # Label each section
        sections = []
        for i in range(len(boundary_beats) - 1):
            b_start = boundary_beats[i]
            b_end = boundary_beats[i + 1]
            start_time = boundary_times[i]
            end_time = boundary_times[i + 1]
            dur = end_time - start_time
            if dur < 0.5:
                continue

            section_energy = float(np.mean(energy_norm[b_start:b_end]))
            position = start_time / duration if duration > 0 else 0

            # Energy trend: rising or falling?
            mid = (b_start + b_end) // 2
            first_half_e = float(np.mean(energy_norm[b_start:mid])) if mid > b_start else 0
            second_half_e = float(np.mean(energy_norm[mid:b_end])) if b_end > mid else 0
            energy_trend = second_half_e - first_half_e

            # Does a drop fall in this section?
            has_drop = any(start_time <= dt < end_time for dt in drop_times)

            # Ã¢ÂÂÃ¢ÂÂ Intelligent labeling Ã¢ÂÂÃ¢ÂÂ
            # INTRO: low energy at start of track
            if position < 0.06 and section_energy < e_median:
                label = "INTRO"
            elif position < 0.14 and section_energy < e_p25 * 1.4:
                label = "INTRO"
            # OUTRO: low energy at end of track
            elif position > 0.88 and section_energy < e_median:
                label = "OUTRO"
            elif position > 0.80 and section_energy < e_p25 * 1.4 and energy_trend < 0:
                label = "OUTRO"
            # DROP: high energy section with detected drop point
            elif has_drop and section_energy > e_p75 * 0.8:
                label = "DROP"
            # DROP: very high energy even without detected drop
            elif section_energy > e_p75 * 1.1:
                label = "DROP"
            # BUILD: rising energy, moderate level
            elif energy_trend > 0.06 and section_energy > e_p25:
                label = "BUILD"
            # BREAKDOWN: low energy section (not at start/end)
            elif section_energy < e_p25 * 1.15:
                label = "BREAKDOWN"
            # Moderate energy with rising trend = BUILD
            elif energy_trend > 0.02 and section_energy > e_median * 0.8:
                label = "BUILD"
            # Moderate energy with falling trend = BREAKDOWN
            elif energy_trend < -0.02:
                label = "BREAKDOWN"
            # Default: use energy level
            elif section_energy > e_median:
                label = "DROP"
            else:
                label = "BREAKDOWN"

            sections.append({
                "time": round(start_time, 3),
                "label": label,
                "duration": round(dur, 3),
                "energy": round(section_energy, 4),
            })

        # Merge consecutive sections with same label
        merged = []
        for s in sections:
            if merged and merged[-1]["label"] == s["label"]:
                merged[-1]["duration"] += s["duration"]
                # Update energy to weighted average
                total_dur = merged[-1]["duration"]
                if total_dur > 0:
                    old_dur = total_dur - s["duration"]
                    merged[-1]["energy"] = round(
                        (merged[-1]["energy"] * old_dur + s["energy"] * s["duration"]) / total_dur, 4
                    )
            else:
                merged.append(dict(s))

        del features, feat_data
        gc.collect()

        if not merged:
            return [{"time": 0.0, "label": "INTRO", "duration": duration, "energy": 0.5}]

        # Ensure INTRO and OUTRO exist
        if merged[0]["label"] != "INTRO" and merged[0]["time"] < 1.0:
            merged[0]["label"] = "INTRO"
        if merged[-1]["label"] != "OUTRO" and merged[-1]["time"] > duration * 0.75:
            merged[-1]["label"] = "OUTRO"

        return merged

    except Exception as e:
        return [{"time": 0.0, "label": "UNKNOWN", "duration": len(y) / sr, "energy": 0.5}]


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   DROP DETECTION Ã¢ÂÂ 6-factor multi-signal analysis
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def detect_drops_from_y(y: np.ndarray, sr: int, beats: List[float]) -> List[Dict]:
    """
    Detect DJ-style drop points using 6-factor analysis:
    1. Energy contrast (before/after comparison) Ã¢ÂÂ 30% weight
    2. Onset strength envelope Ã¢ÂÂ 20% weight
    3. Spectral flux Ã¢ÂÂ 15% weight
    4. Low-frequency energy ratio (bass drops) Ã¢ÂÂ 15% weight
    5. Spectral centroid drop (frequency drops = bass) Ã¢ÂÂ 10% weight
    6. RMS energy level Ã¢ÂÂ 10% weight

    All peaks are snapped to nearest downbeat (every 4 beats).
    Adaptive thresholding based on track characteristics.
    """
    try:
        hop = HOP_LENGTH

        # 1. Onset strength
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
        onset_env = onset_env / (np.max(onset_env) + 1e-8)

        # 2. RMS energy
        rms = librosa.feature.rms(y=y, hop_length=hop)[0]
        rms_norm = rms / (np.max(rms) + 1e-8)

        # 3. Spectral flux (half-wave rectified)
        S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=hop))
        spectral_diff = np.diff(S, axis=1)
        spectral_flux = np.sum(np.maximum(spectral_diff, 0), axis=0)
        spectral_flux = np.pad(spectral_flux, (1, 0))
        spectral_flux = spectral_flux / (np.max(spectral_flux) + 1e-8)

        # 4. Low-frequency energy ratio (bass presence)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
        bass_mask = freqs < 150
        bass_energy = np.sum(S[bass_mask, :] ** 2, axis=0)
        total_energy = np.sum(S ** 2, axis=0) + 1e-8
        bass_ratio = bass_energy / total_energy
        bass_ratio = bass_ratio / (np.max(bass_ratio) + 1e-8)

        # 5. Spectral centroid (inverted: low centroid = bassy = drop)
        centroid = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
        centroid_norm = centroid / (np.max(centroid) + 1e-8)
        centroid_drop = 1.0 - centroid_norm

        del S, spectral_diff
        gc.collect()

        # 6. Energy contrast (before vs after Ã¢ÂÂ key indicator of drops)
        n_frames = len(rms_norm)
        window_sec = 4.0
        window_frames = int(window_sec * sr / hop)
        energy_contrast = np.zeros(n_frames)
        for i in range(window_frames, n_frames - window_frames):
            before = np.mean(rms_norm[max(0, i - window_frames):i])
            after = np.mean(rms_norm[i:min(n_frames, i + window_frames)])
            energy_contrast[i] = max(0, after - before)
        ec_max = np.max(energy_contrast)
        if ec_max > 0:
            energy_contrast = energy_contrast / ec_max

        # Combined drop score (6 factors)
        min_len = min(
            len(onset_env), len(rms_norm), len(spectral_flux),
            len(bass_ratio), len(energy_contrast), len(centroid_drop)
        )
        drop_score = (
            0.30 * energy_contrast[:min_len]
            + 0.20 * onset_env[:min_len]
            + 0.15 * spectral_flux[:min_len]
            + 0.15 * bass_ratio[:min_len]
            + 0.10 * centroid_drop[:min_len]
            + 0.10 * rms_norm[:min_len]
        )

        # Smooth the drop score for cleaner peaks
        if len(drop_score) > 7:
            drop_score = uniform_filter1d(drop_score, size=5)

        # Adaptive threshold: use percentile of positive values
        positive_scores = drop_score[drop_score > 0.1]
        if len(positive_scores) > 0:
            threshold = float(np.percentile(positive_scores, 60))
        else:
            threshold = 0.25
        threshold = max(0.20, min(0.50, threshold))

        # Minimum distance between drops: 8 seconds
        min_distance_frames = int(8.0 * sr / hop)

        peaks, properties = find_peaks(
            drop_score,
            height=threshold,
            distance=min_distance_frames,
            prominence=0.08,
        )

        # Convert to beat-snapped positions (snap to nearest downbeat = every 4 beats)
        peak_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop)
        drops = []

        if len(beats) == 0:
            for pt in peak_times:
                drops.append({"time": float(pt), "beat_index": 0, "score": 0.0})
        else:
            beats_arr = np.array(beats)
            # Build downbeat list (every 4 beats)
            downbeat_indices = list(range(0, len(beats), 4))
            if not downbeat_indices:
                downbeat_indices = list(range(len(beats)))

            for pi, pt in enumerate(peak_times):
                # Snap to nearest downbeat
                nearest_db_idx = min(downbeat_indices, key=lambda idx: abs(beats_arr[idx] - pt))
                # Allow up to 3 seconds snap distance
                if abs(beats_arr[nearest_db_idx] - pt) < 3.0:
                    frame_idx = peaks[pi] if pi < len(peaks) else 0
                    score = float(drop_score[frame_idx]) if frame_idx < min_len else 0.0
                    drops.append({
                        "time": float(beats_arr[nearest_db_idx]),
                        "beat_index": int(nearest_db_idx),
                        "score": score,
                    })

        # Deduplicate (same beat index)
        seen = set()
        unique_drops = []
        for drop in drops:
            if drop["beat_index"] not in seen:
                unique_drops.append(drop)
                seen.add(drop["beat_index"])

        # Keep top 8 by score
        if len(unique_drops) > 8:
            unique_drops.sort(key=lambda d: d.get("score", 0), reverse=True)
            unique_drops = unique_drops[:8]
        unique_drops.sort(key=lambda d: d["time"])

        del onset_env, rms, rms_norm, spectral_flux, bass_ratio
        del energy_contrast, drop_score, centroid_drop
        gc.collect()

        return unique_drops

    except Exception as e:
        raise Exception(f"Error detecting drops: {str(e)}")


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   PHRASE DETECTION Ã¢ÂÂ 8-bar and 16-bar grid
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def detect_phrases(beats: List[float]) -> List[Dict]:
    """
    Detect phrase boundaries aligned to 8-bar grid (32 beats in 4/4).
    Also marks 16-bar (64 beat) super-phrases.
    """
    phrases = []
    beats_per_phrase = 32  # 8 bars in 4/4

    for i in range(0, len(beats) - beats_per_phrase, beats_per_phrase):
        start_beat = i
        end_beat = i + beats_per_phrase
        if end_beat <= len(beats):
            start_time = beats[start_beat]
            end_time = beats[end_beat - 1]
            duration = end_time - start_time
            is_super = (i % 64 == 0)  # 16-bar boundary
            phrases.append({
                "start_beat": start_beat,
                "end_beat": end_beat,
                "start_time": float(start_time),
                "duration": float(duration),
                "is_16bar": is_super,
            })

    return phrases


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   ENERGY CURVE
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def compute_energy_curve(y: np.ndarray, sr: int, hop: int = HOP_LENGTH) -> np.ndarray:
    """Compute smoothed RMS energy envelope."""
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)
    if len(rms_norm) > 15:
        rms_norm = medfilt(rms_norm, kernel_size=15)
    return rms_norm


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   WAVEFORM DATA FOR FRONTEND
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def compute_waveform_data(y: np.ndarray, sr: int, num_peaks: int = 800) -> Dict:
    """Compute waveform peaks + 3-band spectral energy for RGB rendering."""
    try:
        seg_len = max(1, len(y) // num_peaks)
        peaks = []
        spectral_low = []
        spectral_mid = []
        spectral_high = []

        for i in range(num_peaks):
            start = i * seg_len
            end = min(start + seg_len, len(y))
            if start >= len(y):
                break
            segment = y[start:end]
            peaks.append(float(np.max(np.abs(segment))))

            if len(segment) >= 256:
                fft = np.fft.rfft(segment * np.hanning(len(segment)))
                power = np.abs(fft) ** 2
                freqs = np.fft.rfftfreq(len(segment), d=1.0 / sr)
                low = float(np.sum(power[freqs < 250]))
                mid = float(np.sum(power[(freqs >= 250) & (freqs < 4000)]))
                high = float(np.sum(power[freqs >= 4000]))
                total = low + mid + high + 1e-10
                spectral_low.append(low / total)
                spectral_mid.append(mid / total)
                spectral_high.append(high / total)
            else:
                spectral_low.append(0.33)
                spectral_mid.append(0.33)
                spectral_high.append(0.33)

        max_peak = max(peaks) if peaks else 1.0
        peaks = [p / max_peak for p in peaks]

        return {
            "waveform_peaks": peaks,
            "spectral_energy": {
                "low_energy": round(float(np.mean(spectral_low)), 4),
                "mid_energy": round(float(np.mean(spectral_mid)), 4),
                "high_energy": round(float(np.mean(spectral_high)), 4),
            },
        }
    except Exception:
        return {"waveform_peaks": [], "spectral_energy": None}


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   BACKWARD-COMPATIBLE WRAPPERS
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def detect_bpm_and_beats(file_path: str) -> Dict:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_bpm_and_beats_from_y(y, sr)
    del y
    gc.collect()
    return result


def detect_drops(file_path: str, beats: List[float]) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_drops_from_y(y, sr, beats)
    del y
    gc.collect()
    return result


def detect_sections(file_path: str) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_sections_ssm(y, sr, [], [], [], np.array([]))
    del y
    gc.collect()
    return result


def analyze_track_background(track_id: int, db: Session) -> None:
    """Full pipeline: BPM, beats, key, drops, sections, phrases."""
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return
        track.status = "analyzing"
        db.commit()

        bpm_data = detect_bpm_and_beats(track.file_path)
        drops = detect_drops(track.file_path, bpm_data["beats"])
        sections = detect_sections(track.file_path)
        phrases = detect_phrases(bpm_data["beats"])

        analysis = TrackAnalysis(
            track_id=track_id,
            bpm=bpm_data["bpm"],
            beats=bpm_data["beats"],
            drops=drops,
            sections=sections,
            phrases=phrases,
        )
        db.add(analysis)
        track.status = "completed"
        db.commit()
    except Exception as e:
        track = db.query(Track).filter(Track.id == track_id).first()
        if track:
            track.status = "error"
            db.commit()
        raise Exception(f"Background analysis failed: {str(e)}")


# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
#   MAIN ANALYSIS PIPELINE Ã¢ÂÂ v3.0
# Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

def detect_genre(y: np.ndarray, sr: int, bpm: float) -> Dict:
    """
    Professional DJ genre detection using audio features.
    Combines tempo, spectral, rhythm pattern and energy analysis.
    Returns: {genre, subgenre, confidence, genre_scores}
    """
    import warnings
    warnings.filterwarnings('ignore')

    # -- Spectral features --
    spec_cent = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
    spec_bw = np.mean(librosa.feature.spectral_bandwidth(y=y, sr=sr))
    spec_flat = np.mean(librosa.feature.spectral_flatness(y=y))
    spec_rolloff = np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr))

    # -- Rhythm / beat pattern --
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    beat_frames = librosa.beat.beat_track(y=y, sr=sr, bpm=bpm)[1]
    if len(beat_frames) > 4:
        beat_strengths = onset_env[beat_frames[beat_frames < len(onset_env)]]
        beat_regularity = 1.0 - min(1.0, np.std(beat_strengths) / (np.mean(beat_strengths) + 1e-6))
    else:
        beat_regularity = 0.5

    # -- Bass energy analysis --
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    sub_bass_mask = freqs < 80
    bass_mask = (freqs >= 80) & (freqs < 250)
    mid_mask = (freqs >= 250) & (freqs < 2000)
    hi_mask = freqs >= 2000
    total_energy = np.sum(S ** 2) + 1e-10
    sub_bass_ratio = np.sum(S[sub_bass_mask] ** 2) / total_energy
    bass_ratio = np.sum(S[bass_mask] ** 2) / total_energy
    mid_ratio = np.sum(S[mid_mask] ** 2) / total_energy
    hi_ratio = np.sum(S[hi_mask] ** 2) / total_energy

    # -- Percussion vs tonal --
    harmonic, percussive = librosa.effects.hpss(y)
    perc_energy = np.sum(percussive ** 2)
    harm_energy = np.sum(harmonic ** 2)
    perc_ratio = perc_energy / (perc_energy + harm_energy + 1e-10)

    # -- Dynamic range --
    rms = librosa.feature.rms(y=y)[0]
    dynamic_range = np.max(rms) / (np.mean(rms) + 1e-10)
    energy_variance = np.std(rms) / (np.mean(rms) + 1e-10)

    # -- Genre scoring --
    scores = {}

    # HOUSE (120-130 BPM, 4otf, moderate bass, warm mids)
    s = 0.0
    if 118 <= bpm <= 132: s += 35
    elif 115 <= bpm <= 135: s += 20
    s += beat_regularity * 25
    if bass_ratio > 0.15: s += 15
    if mid_ratio > 0.25: s += 10
    if spec_cent < 3000: s += 10
    if 0.3 < perc_ratio < 0.6: s += 5
    scores["House"] = min(100, s)

    # TECH HOUSE (124-130, percussive, groovy)
    s = 0.0
    if 122 <= bpm <= 132: s += 30
    elif 120 <= bpm <= 135: s += 18
    s += beat_regularity * 20
    if perc_ratio > 0.45: s += 20
    if bass_ratio > 0.12: s += 10
    if spec_flat > 0.02: s += 10
    if dynamic_range < 3.0: s += 10
    scores["Tech House"] = min(100, s)

    # TECHNO (128-150, dark, industrial, perc heavy)
    s = 0.0
    if 126 <= bpm <= 150: s += 30
    elif 124 <= bpm <= 155: s += 18
    s += beat_regularity * 15
    if perc_ratio > 0.5: s += 20
    if spec_cent < 2500: s += 15
    if sub_bass_ratio > 0.08: s += 10
    if spec_flat > 0.03: s += 10
    scores["Techno"] = min(100, s)

    # MELODIC TECHNO (122-135, harmonic, pads)
    s = 0.0
    if 122 <= bpm <= 136: s += 30
    elif 120 <= bpm <= 140: s += 18
    s += beat_regularity * 15
    if perc_ratio < 0.45: s += 15
    if harm_energy > perc_energy: s += 15
    if 1800 < spec_cent < 3500: s += 10
    if mid_ratio > 0.3: s += 10
    scores["Melodic Techno"] = min(100, s)

    # TRANCE (130-150, bright, big builds)
    s = 0.0
    if 128 <= bpm <= 150: s += 30
    elif 125 <= bpm <= 155: s += 18
    s += beat_regularity * 15
    if spec_cent > 3000: s += 15
    if hi_ratio > 0.15: s += 10
    if energy_variance > 0.4: s += 15
    if harm_energy > perc_energy * 1.2: s += 10
    scores["Trance"] = min(100, s)

    # DRUM & BASS (160-180, breakbeat, heavy bass)
    s = 0.0
    if 160 <= bpm <= 180: s += 40
    elif 155 <= bpm <= 185: s += 25
    elif 80 <= bpm <= 92: s += 30
    if beat_regularity < 0.6: s += 15
    if sub_bass_ratio > 0.1: s += 15
    if bass_ratio > 0.15: s += 10
    if perc_ratio > 0.4: s += 10
    scores["Drum & Bass"] = min(100, s)

    # DUBSTEP (140, massive sub bass)
    s = 0.0
    if 138 <= bpm <= 142: s += 35
    elif 135 <= bpm <= 145: s += 22
    elif 68 <= bpm <= 72: s += 30
    if sub_bass_ratio > 0.12: s += 20
    if energy_variance > 0.5: s += 15
    if spec_cent < 2000: s += 10
    scores["Dubstep"] = min(100, s)

    # HIP-HOP (70-100)
    s = 0.0
    if 70 <= bpm <= 100: s += 35
    elif 65 <= bpm <= 110: s += 20
    elif 130 <= bpm <= 160: s += 15
    if beat_regularity < 0.65: s += 10
    if bass_ratio > 0.15: s += 15
    if spec_cent < 2800: s += 10
    scores["Hip-Hop"] = min(100, s)

    # TRAP (130-170, 808 sub, hihat rolls)
    s = 0.0
    if 130 <= bpm <= 170: s += 25
    elif 65 <= bpm <= 85: s += 25
    if sub_bass_ratio > 0.1: s += 20
    if hi_ratio > 0.12: s += 15
    if beat_regularity < 0.55: s += 15
    scores["Trap"] = min(100, s)

    # DEEP HOUSE (118-125, warm, soulful)
    s = 0.0
    if 118 <= bpm <= 126: s += 35
    elif 115 <= bpm <= 128: s += 20
    s += beat_regularity * 20
    if bass_ratio > 0.18: s += 15
    if spec_cent < 2200: s += 10
    if dynamic_range < 2.5: s += 10
    scores["Deep House"] = min(100, s)

    # AFRO HOUSE (118-128, percussive, organic)
    s = 0.0
    if 118 <= bpm <= 128: s += 30
    elif 115 <= bpm <= 132: s += 18
    if perc_ratio > 0.5: s += 20
    if mid_ratio > 0.3: s += 15
    if 2000 < spec_cent < 4000: s += 10
    scores["Afro House"] = min(100, s)

    # DISCO / FUNK (110-130, groovy, live instruments)
    s = 0.0
    if 110 <= bpm <= 130: s += 25
    if harm_energy > perc_energy * 1.5: s += 20
    if mid_ratio > 0.35: s += 15
    if spec_flat < 0.015: s += 10
    scores["Disco / Funk"] = min(100, s)

    # MINIMAL (120-132, sparse, steady)
    s = 0.0
    if 120 <= bpm <= 132: s += 25
    s += beat_regularity * 15
    if dynamic_range < 2.2: s += 15
    if energy_variance < 0.25: s += 15
    if perc_ratio > 0.45: s += 10
    scores["Minimal"] = min(100, s)

    # PROGRESSIVE HOUSE (122-130, builds, melodic)
    s = 0.0
    if 122 <= bpm <= 130: s += 30
    s += beat_regularity * 15
    if energy_variance > 0.3: s += 15
    if harm_energy > perc_energy: s += 10
    if mid_ratio > 0.28: s += 10
    scores["Progressive House"] = min(100, s)

    # HARDSTYLE (150-160, distorted kick)
    s = 0.0
    if 148 <= bpm <= 162: s += 40
    elif 145 <= bpm <= 165: s += 25
    if sub_bass_ratio > 0.1: s += 15
    if dynamic_range > 3.5: s += 10
    scores["Hardstyle"] = min(100, s)

    # REGGAETON (85-105, dembow)
    s = 0.0
    if 85 <= bpm <= 105: s += 30
    if beat_regularity < 0.6: s += 15
    if bass_ratio > 0.15: s += 10
    if perc_ratio > 0.4: s += 10
    scores["Reggaeton"] = min(100, s)

    # -- Select top genre --
    sorted_genres = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_genre = sorted_genres[0][0]
    top_score = sorted_genres[0][1]
    second_score = sorted_genres[1][1] if len(sorted_genres) > 1 else 0

    # Confidence based on margin
    margin = top_score - second_score
    confidence = min(1.0, max(0.3, margin / 30.0))

    # Subgenre refinement
    subgenre = top_genre
    if top_genre == "House":
        if spec_cent > 2800: subgenre = 'Funky House'
        elif bass_ratio > 0.2: subgenre = 'Bass House'
        elif perc_ratio < 0.4: subgenre = 'Vocal House'
    elif top_genre == "Techno":
        if bpm > 140: subgenre = 'Hard Techno'
        elif perc_ratio > 0.55: subgenre = 'Industrial Techno'
        elif energy_variance < 0.25: subgenre = 'Hypnotic Techno'
    elif top_genre == "Drum & Bass":
        if spec_cent > 3000: subgenre = 'Liquid D&B'
        elif perc_ratio > 0.55: subgenre = 'Neurofunk'
    elif top_genre == "Hip-Hop":
        if bpm > 130: subgenre = 'Trap'
        elif spec_cent < 2000: subgenre = 'Boom Bap'
        elif harm_energy > perc_energy: subgenre = 'R&B'

    return {
        "genre": top_genre,
        "subgenre": subgenre,
        "confidence": round(confidence, 2),
        "genre_scores": {k: round(v, 1) for k, v in sorted_genres[:5]},
    }

def analyze_audio(file_path: str) -> Dict:
    """
    Full audio analysis pipeline v3.0
    Loads audio ONCE, runs all analysis with beat-synchronous features.
    """
    y, sr_loaded = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    # Get REAL file duration (not limited by MAX_DURATION)
    try:
        real_duration = librosa.get_duration(path=file_path)
        duration_ms = int(real_duration * 1000)
    except Exception:
        # Get REAL file duration (not limited by MAX_DURATION)
    try:
        real_duration = librosa.get_duration(path=file_path)
        duration_ms = int(real_duration * 1000)
    except Exception:
        duration_ms = int(len(y) / sr_loaded * 1000)

    # BPM and beats
    bpm_data = detect_bpm_and_beats_from_y(y, sr_loaded)
    bpm = bpm_data["bpm"]
    beats = bpm_data["beats"]
    beat_frames = bpm_data.get("beat_frames", [])
    beat_positions = [int(b * 1000) for b in beats]

    # Key detection
    try:
        key, key_confidence = detect_key_ks(y, sr_loaded)
    except Exception:
        key, key_confidence = None, None

    # Energy
    try:
        rms = librosa.feature.rms(y=y)[0]
        energy = round(float(np.mean(rms)), 4)
        del rms
    except Exception:
        energy = None

    # Drops (6-factor detection with downbeat snapping)
    try:
        drops = detect_drops_from_y(y, sr_loaded, beats)
        drop_positions = [int(d["time"] * 1000) for d in drops]
    except Exception:
        drops = []
        drop_positions = []

    # Beat-synchronous RMS for section labeling
    try:
        beat_frames_arr = np.array(beat_frames) if beat_frames else np.array([])
        if len(beat_frames_arr) > 4:
            rms_raw = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]
            rms_sync = librosa.util.sync(
                rms_raw.reshape(1, -1), beat_frames_arr, aggregate=np.mean
            )[0]
            del rms_raw
        else:
            rms_sync = np.array([])
    except Exception:
        rms_sync = np.array([])

    # Sections (SSM novelty-based segmentation)
    try:
        sections = detect_sections_ssm(
            y, sr_loaded, beats, beat_frames, drops, rms_sync
        )
        section_labels = [
            {
                "time_ms": int(s["time"] * 1000),
                "label": s["label"],
                "duration_ms": int(s["duration"] * 1000),
                "energy": s.get("energy", 0.5),
            }
            for s in sections
        ]
    except Exception:
        section_labels = []

    # Phrases (8-bar grid)
    try:
        phrases = detect_phrases(beats)
        phrase_positions = [int(p["start_time"] * 1000) for p in phrases]
    except Exception:
        phrase_positions = []

    # Waveform data for frontend
    try:
        waveform_data = compute_waveform_data(y, sr_loaded)
    except Exception:
        waveform_data = {"waveform_peaks": [], "spectral_energy": None}

    del y
    gc.collect()


    return {
        "bpm": bpm,
        "bpm_confidence": key_confidence,
        "key": key,
        "energy": energy,
        "duration_ms": duration_ms,
        "drop_positions": drop_positions,
        "phrase_positions": phrase_positions,
        "beat_positions": beat_positions,
        "section_labels": section_labels,
        "waveform_peaks": waveform_data.get("waveform_peaks"),
        "spectral_energy": waveform_data.get("spectral_energy"),
    }
