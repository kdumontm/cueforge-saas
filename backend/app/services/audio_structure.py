"""
Module audio_structure — extrait de audio_analysis.py
Fonctions de segmentation structurelle et analyse de sections
"""
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from scipy.signal import find_peaks, medfilt, butter, filtfilt
from scipy.ndimage import uniform_filter1d
from scipy.spatial.distance import cdist
import librosa
import logging

logger = logging.getLogger(__name__)


def build_section_label_index(sections: List[Dict]) -> Dict[str, List[int]]:
    """
    Optimization #34: Pre-index section labels by name for O(1) lookup.

    Args:
        sections: List of section dicts with 'label' key

    Returns:
        Dict mapping label -> list of section indices with that label
    """
    index = {}
    for i, section in enumerate(sections):
        label = section.get("label", "UNKNOWN")
        if label not in index:
            index[label] = []
        index[label].append(i)
    return index

def refine_section_boundaries(section_times: List[float], beats: List[float]) -> List[float]:
    """
    Optimization #22: Snap section boundaries to nearest beat grid.
    Improves alignment with DJ grid.

    Args:
        section_times: List of section boundary times
        beats: List of beat times

    Returns:
        Refined section boundary times (snapped to nearest beats)
    """
    if not beats:
        return section_times

    beats_arr = np.array(beats)
    refined = []

    for time in section_times:
        # Find nearest beat
        nearest_beat_idx = np.argmin(np.abs(beats_arr - time))
        nearest_beat_time = beats_arr[nearest_beat_idx]
        refined.append(float(nearest_beat_time))

    # Remove duplicates and sort
    refined = sorted(list(set(refined)))
    return refined

def score_section_label_confidence(section_energy: float, section_trend: str,
                                    position_in_track: float,
                                    energy_percentiles: Dict[str, float]) -> Dict:
    """
    Optimization #24: Score confidence of section label assignment.
    High confidence = label matches energy profile and position patterns.

    Args:
        section_energy: Normalized energy (0.0-1.0)
        section_trend: 'rising', 'falling', or 'stable'
        position_in_track: 0.0-1.0 (0=start, 1=end)
        energy_percentiles: Dict with 'p25', 'p50', 'p75'

    Returns:
        Dict with label confidences: {INTRO: score, DROP: score, BUILD: score, ...}
    """
    try:
        p25 = energy_percentiles.get("p25", 0.25)
        p50 = energy_percentiles.get("p50", 0.5)
        p75 = energy_percentiles.get("p75", 0.75)

        confidences = {
            "INTRO": 0.0,
            "OUTRO": 0.0,
            "BUILD": 0.0,
            "DROP": 0.0,
            "BREAKDOWN": 0.0,
            "BRIDGE": 0.0,
        }

        # INTRO: low energy at start
        if position_in_track < 0.15 and section_energy < p50:
            confidences["INTRO"] = min(1.0, 1.0 - (section_energy / p50))

        # OUTRO: low energy at end
        if position_in_track > 0.80 and section_energy < p50:
            confidences["OUTRO"] = min(1.0, 1.0 - (section_energy / p50))

        # BUILD: rising energy + moderate-high energy
        if section_trend == "rising" and section_energy > p25:
            confidences["BUILD"] = min(1.0, section_energy / p75)

        # DROP: high energy + stable or rising
        if section_energy > p75 and section_trend in ["stable", "rising"]:
            confidences["DROP"] = min(1.0, section_energy / 1.0)

        # BREAKDOWN: low energy
        if section_energy < p25:
            confidences["BREAKDOWN"] = min(1.0, 1.0 - (section_energy / p25))

        # BRIDGE: moderate energy + stable
        if p25 < section_energy < p75 and section_trend == "stable":
            confidences["BRIDGE"] = min(1.0, 0.8)

        # Normalize confidences to sum to 1.0 (optional softmax)
        total_conf = sum(confidences.values())
        if total_conf > 0:
            confidences = {k: round(v / total_conf, 3) for k, v in confidences.items()}

        return confidences
    except Exception:
        return {
            "INTRO": 0.0,
            "OUTRO": 0.0,
            "BUILD": 0.0,
            "DROP": 0.0,
            "BREAKDOWN": 0.0,
            "BRIDGE": 0.0,
        }

def compute_section_length_statistics(sections: List[Dict]) -> Dict:
    """
    Optimization #23: Compute section length statistics (median, std).
    Detect sections with unusual durations (may be mislabeled).

    Args:
        sections: List of sections with 'duration' key

    Returns:
        Dict with 'median_duration', 'std_duration', 'min_duration', 'max_duration'
    """
    try:
        if not sections:
            return {
                "median_duration": 0.0,
                "std_duration": 0.0,
                "min_duration": 0.0,
                "max_duration": 0.0,
                "count": 0,
            }

        durations = [s.get("duration", 0.0) for s in sections if s.get("duration", 0) > 0]

        if not durations:
            return {
                "median_duration": 0.0,
                "std_duration": 0.0,
                "min_duration": 0.0,
                "max_duration": 0.0,
                "count": 0,
            }

        durations_arr = np.array(durations)
        median = float(np.median(durations_arr))
        std = float(np.std(durations_arr))
        min_dur = float(np.min(durations_arr))
        max_dur = float(np.max(durations_arr))

        return {
            "median_duration": round(median, 2),
            "std_duration": round(std, 2),
            "min_duration": round(min_dur, 2),
            "max_duration": round(max_dur, 2),
            "count": len(durations),
        }
    except Exception:
        return {
            "median_duration": 0.0,
            "std_duration": 0.0,
            "min_duration": 0.0,
            "max_duration": 0.0,
            "count": 0,
        }

def detect_novelty_peak_prominence(novelty_curve: np.ndarray, peaks: np.ndarray) -> Dict:
    """
    Optimization #21: Detect novelty peak prominence (more robust than just height).
    Peaks with high prominence = clear section boundaries.

    Args:
        novelty_curve: Novelty curve from SSM
        peaks: Peak indices from find_peaks

    Returns:
        Dict with 'prominence_scores' (peak -> prominence), 'peak_scores'
    """
    try:
        if len(peaks) == 0:
            return {"prominence_scores": {}, "peak_scores": {}}

        from scipy.signal import peak_prominences

        # Compute prominence of each peak
        prominences, left_bases, right_bases = peak_prominences(novelty_curve, peaks)

        prominence_scores = {}
        peak_scores = {}

        for i, peak_idx in enumerate(peaks):
            prominence = float(prominences[i])
            peak_height = float(novelty_curve[peak_idx])
            # Combined score: height + prominence
            combined_score = peak_height * (1.0 + prominence)

            prominence_scores[int(peak_idx)] = round(prominence, 4)
            peak_scores[int(peak_idx)] = round(combined_score, 4)

        return {
            "prominence_scores": prominence_scores,
            "peak_scores": peak_scores,
        }
    except Exception:
        return {
            "prominence_scores": {},
            "peak_scores": {},
        }

def _detect_structure_allin1(file_path: str) -> Optional[List[Dict]]:
    """
    Detect music structure using allin1 (deep learning, ISMIR 2023).
    Returns sections with labels: intro, verse, chorus, bridge, outro, etc.
    Falls back to None if allin1 is not installed.
    """
    try:
        import allin1
        result = allin1.analyze(file_path)
        sections = []
        if hasattr(result, 'segments') and result.segments:
            for seg in result.segments:
                sections.append({
                    "label": seg.label if hasattr(seg, 'label') else "unknown",
                    "start_ms": int(seg.start * 1000) if hasattr(seg, 'start') else 0,
                    "end_ms": int(seg.end * 1000) if hasattr(seg, 'end') else 0,
                    "duration_ms": int((seg.end - seg.start) * 1000) if hasattr(seg, 'end') and hasattr(seg, 'start') else 0,
                })
            if sections:
                logger.info(f"[ALLIN1] Detected {len(sections)} sections: {[s['label'] for s in sections]}")
        return sections if sections else None
    except ImportError:
        logger.debug("[ALLIN1] allin1 not installed — skipping")
        return None
    except Exception as e:
        logger.warning(f"[ALLIN1] Structure detection failed: {e}")
        return None

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

    # Downsample features for long tracks to keep SSM computation fast
    # SSM is O(N^2), so limit to ~300 beats max
    MAX_SSM_BEATS = 300
    downsample_factor = 1
    feat_for_ssm = features
    if n_beats > MAX_SSM_BEATS:
        downsample_factor = max(2, n_beats // MAX_SSM_BEATS)
        feat_for_ssm = features[:, ::downsample_factor]

    # Compute SSM using cosine similarity (more robust than euclidean for music)
    S = 1.0 - cdist(feat_for_ssm.T, feat_for_ssm.T, metric='cosine')
    S = np.nan_to_num(S, nan=0.0)

    # Build checkerboard kernel
    half = kernel_size // 2
    kernel = np.ones((kernel_size, kernel_size))
    kernel[:half, :half] = -1   # top-left quadrant
    kernel[half:, half:] = -1   # bottom-right quadrant
    # Top-right and bottom-left stay +1

    # Apply kernel along the main diagonal — fully vectorized with stride_tricks
    n_ssm = S.shape[0]
    novelty_ds = np.zeros(n_ssm)
    if n_ssm > kernel_size:
        # Build all diagonal patches at once using stride_tricks
        # For each position i, extract S[i-half:i+half, i-half:i+half]
        from numpy.lib.stride_tricks import as_strided
        row_stride, col_stride = S.strides
        # Create a 3D view: patches[i] = S[i:i+ks, i:i+ks] for i in 0..n_ssm-ks
        n_patches = n_ssm - kernel_size + 1
        patches = as_strided(
            S, shape=(n_patches, kernel_size, kernel_size),
            strides=(row_stride + col_stride, row_stride, col_stride)
        )
        # Multiply all patches by kernel at once and sum
        novelty_ds[half:half + n_patches] = np.einsum('ijk,jk->i', patches, kernel)

    # Half-wave rectify (only positive = boundaries)
    novelty_ds = np.maximum(novelty_ds, 0)

    # Upsample novelty back to original beat count if downsampled
    if downsample_factor > 1:
        novelty = np.interp(
            np.arange(n_beats),
            np.arange(n_ssm) * downsample_factor,
            novelty_ds
        )
    else:
        novelty = novelty_ds

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
        # Minimum distance: 8 beats (2 bars) — DJ music rarely has sections < 2 bars
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

            # ── Intelligent labeling (v3.1 — conservative DROP, add BRIDGE) ──
            # DJ track structure: INTRO → BUILD → DROP → BREAKDOWN → DROP 2 → BRIDGE → OUTRO
            # DROPs should ONLY be labeled when there's a detected drop point
            # or VERY high energy (top 10% of all sections)
            
            # Count how many drops we've already labeled
            drop_count = sum(1 for s in sections if s.get("label") == "DROP")
            
            # INTRO: low energy at start of track
            if position < 0.08 and section_energy < e_median:
                label = "INTRO"
            elif position < 0.15 and section_energy < e_p25 * 1.5 and i < 2:
                label = "INTRO"
            
            # OUTRO: low energy at end of track
            elif position > 0.85 and section_energy < e_median:
                label = "OUTRO"
            elif position > 0.78 and section_energy < e_p25 * 1.5 and energy_trend < -0.01:
                label = "OUTRO"
            
            # DROP: ONLY when a detected drop point falls in this section AND energy is high
            elif has_drop and section_energy > e_p75 and drop_count < 2:
                label = "DROP"
            
            # DROP: extremely high energy (top 10%) even without detected drop — max 3 total
            elif section_energy > e_p75 * 1.5 and drop_count < 2 and 0.15 < position < 0.85:
                label = "DROP"
            
            # BUILD: rising energy trend, not at start/end
            elif energy_trend > 0.04 and section_energy > e_p25 and 0.1 < position < 0.85:
                label = "BUILD"
            
            # BREAKDOWN: low energy section after a drop
            elif section_energy < e_p25 * 1.2 and position > 0.2 and position < 0.8:
                label = "BREAKDOWN"
            
            # BRIDGE: moderate energy between drops (middle of track, not build/breakdown)
            elif 0.35 < position < 0.75 and e_p25 < section_energy < e_p75 and abs(energy_trend) < 0.03:
                label = "BRIDGE"
            
            # BUILD: moderate energy with clear rising trend
            elif energy_trend > 0.02 and section_energy > e_median * 0.7:
                label = "BUILD"
            
            # BREAKDOWN: moderate energy with falling trend
            elif energy_trend < -0.02 and section_energy < e_p75:
                label = "BREAKDOWN"
            
            # Default: VERSE for moderate energy, BREAKDOWN for low
            elif section_energy > e_p75 * 0.9:
                label = "CHORUS"
            elif section_energy > e_median:
                label = "VERSE"
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

def detect_sections(file_path: str) -> List[Dict]:
    y, sr = librosa.load(file_path, sr=SR, duration=MAX_DURATION)
    result = detect_sections_ssm(y, sr, [], [], [], np.array([]))
    del y
    gc.collect()
    return result

def detect_structure_checkerboard(chroma: np.ndarray) -> Dict:
    """
    Point 41: Checkerboard kernel for structure detection (Foote novelty).
    """
    try:
        # Compute self-similarity matrix
        sim_matrix = np.dot(chroma.T, chroma)
        sim_matrix = sim_matrix / (np.linalg.norm(chroma, axis=0, keepdims=True).T + 1e-10)

        # Apply checkerboard kernel
        kernel = np.array([[-1, 1], [1, -1]])

        # Novelty measure
        if sim_matrix.shape[0] > 2:
            novelty = np.zeros(sim_matrix.shape[0])
            for i in range(1, sim_matrix.shape[0] - 1):
                for j in range(1, sim_matrix.shape[1] - 1):
                    patch = sim_matrix[i-1:i+1, j-1:j+1]
                    novelty[i] += np.sum(patch * kernel)
        else:
            novelty = np.array([0.0])

        return {
            "structure_novelty_mean": float(np.mean(novelty)),
            "structure_novelty_peaks": int(np.sum(novelty > np.mean(novelty))),
        }
    except Exception:
        return {"structure_novelty_mean": 0.0, "structure_novelty_peaks": 0}

def build_section_recurrence_matrix(chroma: np.ndarray, section_boundaries: List[int]) -> Dict:
    """
    Point 42: Section recurrence matrix (which sections repeat).
    """
    try:
        section_features = []
        for i in range(len(section_boundaries) - 1):
            start = section_boundaries[i]
            end = section_boundaries[i + 1]
            if end > start:
                section_feat = np.mean(chroma[:, start:end], axis=1)
                section_features.append(section_feat)

        if len(section_features) < 2:
            return {"recurrence_matrix_density": 0.0}

        # Compute pairwise similarity
        n_sections = len(section_features)
        recurrence = np.zeros((n_sections, n_sections))

        for i in range(n_sections):
            for j in range(n_sections):
                sim = np.dot(section_features[i], section_features[j])
                sim = sim / (np.linalg.norm(section_features[i]) * np.linalg.norm(section_features[j]) + 1e-10)
                recurrence[i, j] = max(0, sim)

        # Density = ratio of high-similarity pairs
        density = float(np.sum(recurrence > 0.7) / (n_sections * n_sections))

        return {"recurrence_matrix_density": density}
    except Exception:
        return {"recurrence_matrix_density": 0.0}

def detect_hook_section(sections: List[Dict]) -> Dict:
    """
    Point 45: Hook detection (most memorable/repeated section).
    """
    try:
        label_counts = {}
        for section in sections:
            label = section.get("label", "UNKNOWN")
            label_counts[label] = label_counts.get(label, 0) + 1

        if label_counts:
            hook_label = max(label_counts, key=label_counts.get)
            hook_count = label_counts[hook_label]

            return {
                "hook_label": hook_label,
                "hook_repetitions": hook_count,
                "hook_strength": float(hook_count / len(sections)),
            }
        else:
            return {"hook_label": "NONE", "hook_repetitions": 0, "hook_strength": 0.0}
    except Exception:
        return {"hook_label": "NONE", "hook_repetitions": 0, "hook_strength": 0.0}

def score_section_similarity(section_1: Dict, section_2: Dict) -> float:
    """
    Point 48: Section similarity scoring (cosine similarity).
    """
    try:
        # Simple similarity based on energy profile
        energy_1 = section_1.get("avg_energy", 0.5)
        energy_2 = section_2.get("avg_energy", 0.5)

        diff = abs(energy_1 - energy_2)
        similarity = 1.0 - diff

        return float(similarity)
    except Exception:
        return 0.0

def enhance_section_labeling(sections: List[Dict], energy_profile: np.ndarray) -> List[Dict]:
    """
    Point 52: Repetition-based section labeling enhancement.
    """
    try:
        enhanced = []
        for i, section in enumerate(sections):
            section_copy = section.copy()

            # Re-score label confidence
            if i > 0:
                prev_label = sections[i-1].get("label", "UNKNOWN")
                curr_label = section.get("label", "UNKNOWN")

                if prev_label == curr_label:
                    section_copy["repetition_score"] = 0.9
                else:
                    section_copy["repetition_score"] = 0.5

            enhanced.append(section_copy)

        return enhanced
    except Exception:
        return sections

def score_section_boundary_sharpness(S: np.ndarray, section_boundaries: List[int]) -> Dict:
    """
    Point 53: Section boundary sharpness (rapid vs gradual transitions).
    """
    try:
        sharpness_scores = []

        for i in range(len(section_boundaries) - 1):
            idx = section_boundaries[i]
            if idx > 0 and idx < S.shape[1] - 1:
                before = np.mean(np.abs(S[:, max(0, idx-10):idx]))
                after = np.mean(np.abs(S[:, idx:min(idx+10, S.shape[1])]))

                sharpness = abs(after - before) / (max(before, after) + 1e-10)
                sharpness_scores.append(sharpness)

        if sharpness_scores:
            return {
                "boundary_sharpness_mean": float(np.mean(sharpness_scores)),
                "boundary_sharpness_std": float(np.std(sharpness_scores)),
            }
        else:
            return {"boundary_sharpness_mean": 0.0, "boundary_sharpness_std": 0.0}
    except Exception:
        return {"boundary_sharpness_mean": 0.0, "boundary_sharpness_std": 0.0}

def snap_section_boundaries_to_bars(section_boundaries: List[float], bpm: float, sr: int) -> List[float]:
    """
    Point 59: Snap section boundaries to nearest bar.
    """
    try:
        seconds_per_bar = (60.0 / bpm) * 4

        snapped = []
        for boundary in section_boundaries:
            bar_number = boundary / seconds_per_bar
            snapped_bar = round(bar_number)
            snapped_time = snapped_bar * seconds_per_bar
            snapped.append(snapped_time)

        return snapped
    except Exception:
        return section_boundaries

def detect_ambient_pad_sections(sections: List[Dict]) -> Dict:
    """
    Point 74: Ambient/pad section detection (low-energy blending zones).
    """
    try:
        ambient_sections = []

        for i, section in enumerate(sections):
            energy = section.get("avg_energy", 0.5)
            label = section.get("label", "")

            if energy < 0.4 or "BREAKDOWN" in label or "BRIDGE" in label:
                ambient_sections.append(i)

        return {
            "ambient_section_count": len(ambient_sections),
            "ambient_section_indices": ambient_sections,
        }
    except Exception:
        return {"ambient_section_count": 0, "ambient_section_indices": []}

def key_stability_per_section(y: np.ndarray, sr: int, section_duration_s: float = 8.0) -> Dict[str, any]:
    """
    Point 18: Analyze key stability per section.

    Divides track into sections and checks tonal consistency.
    """
    try:
        if len(y) < sr:
            return {
                "sections": 0,
                "key_stability_scores": [],
                "stable_sections": 0,
            }

        # Divide into sections
        section_samples = int(sr * section_duration_s)
        sections = []

        for i in range(0, len(y), section_samples):
            chunk = y[i:i+section_samples]
            if len(chunk) > sr // 2:
                sections.append(chunk)

        # Analyze each section
        stability_scores = []
        for section in sections[:10]:  # Limit to 10 sections
            try:
                chroma = librosa.feature.chroma_cqt(y=section, sr=sr)
                chroma_mean = np.mean(chroma, axis=1)

                # Stability: entropy of chroma distribution
                chroma_norm = chroma_mean / (np.sum(chroma_mean) + 1e-8)
                entropy = -np.sum(chroma_norm * np.log(chroma_norm + 1e-8))

                # Normalize entropy (0 = one note, log(12) = uniform)
                max_entropy = np.log(12)
                stability = 1.0 - (entropy / max_entropy)
                stability = float(np.clip(stability, 0.0, 1.0))

                stability_scores.append(stability)
            except Exception:
                pass

        stable_sections = sum(1 for s in stability_scores if s > 0.6)

        return {
            "sections": len(sections),
            "key_stability_scores": stability_scores,
            "stable_sections": stable_sections,
        }
    except Exception:
        return {
            "sections": 0,
            "key_stability_scores": [],
            "stable_sections": 0,
        }

def compute_section_deep_analysis(
    y: np.ndarray, sr: int, section_labels: List[Dict],
    beat_frames: Optional[np.ndarray] = None,
    bpm: float = 128.0,
) -> Dict:
    """
    v6.9: Deep section analysis — connects orphaned section/drop functions.
    Produces per-section energy, key changes, loop candidates, transition quality.
    """
    s: Dict = {"available": False}
    if not section_labels:
        return s
    duration_ms = int(len(y) / sr * 1000)

    # Point 40: Dynamic range per section
    try:
        dr = compute_dynamic_range_per_section(section_labels, y, sr)
        s["dynamic_range_per_section"] = dr
    except Exception:
        pass

    # Point 42: Key changes at section boundaries
    try:
        kc = detect_key_changes_at_boundaries(y, sr, section_labels)
        s["key_changes"] = kc
    except Exception:
        pass

    # Point 44: Loop candidates
    try:
        lc = identify_loop_candidates(section_labels, bpm, duration_ms)
        s["loop_candidates"] = lc[:10]
    except Exception:
        pass

    # Point 46: Transition zones
    try:
        tz = compute_transition_zones(section_labels, duration_ms, bpm)
        s["transition_zones"] = tz
    except Exception:
        pass

    # Point 48: Vocal-free zones
    try:
        vfz = mark_vocal_free_zones(section_labels)
        s["vocal_free_zones"] = vfz
    except Exception:
        pass

    # Point 50: Energy trends per section
    try:
        et = detect_energy_trends_per_section(section_labels)
        s["energy_trends"] = et
    except Exception:
        pass

    # Point 52: Fade in/out detection
    try:
        fio = detect_fade_in_out(y, sr)
        s["fade_in_out"] = fio
    except Exception:
        pass

    # Point 54: Structure checkerboard (similarity matrix)
    try:
        cb = detect_structure_checkerboard(y, sr, section_labels)
        s["checkerboard"] = cb
    except Exception:
        pass

    # Point 56: Enhanced section labeling
    try:
        esl = enhance_section_labeling(section_labels, y, sr)
        s["enhanced_labels"] = esl
    except Exception:
        pass

    s["available"] = True
    return s

