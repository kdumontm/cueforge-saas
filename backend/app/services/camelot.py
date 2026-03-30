"""
CueForge v2 — Camelot Wheel harmonic compatibility service.

The Camelot wheel maps musical keys to a number+letter code (e.g., 8B = C major).
Compatible keys are: same key, ±1 on the wheel, and inner/outer switch (A↔B).
"""

from typing import Optional

# Full Camelot wheel mapping: musical key → Camelot code
KEY_TO_CAMELOT: dict[str, str] = {
    # Minor keys (A column)
    "Ab minor": "1A", "G# minor": "1A",
    "Eb minor": "2A", "D# minor": "2A",
    "Bb minor": "3A", "A# minor": "3A",
    "F minor": "4A",
    "C minor": "5A",
    "G minor": "6A",
    "D minor": "7A",
    "A minor": "8A",
    "E minor": "9A",
    "B minor": "10A",
    "F# minor": "11A", "Gb minor": "11A",
    "Db minor": "12A", "C# minor": "12A",
    # Major keys (B column)
    "B major": "1B", "Cb major": "1B",
    "F# major": "2B", "Gb major": "2B",
    "Db major": "3B", "C# major": "3B",
    "Ab major": "4B", "G# major": "4B",
    "Eb major": "5B", "D# major": "5B",
    "Bb major": "6B", "A# major": "6B",
    "F major": "7B",
    "C major": "8B",
    "G major": "9B",
    "D major": "10B",
    "A major": "11B",
    "E major": "12B",
}

# Reverse mapping: Camelot code → canonical key name
CAMELOT_TO_KEY: dict[str, str] = {
    "1A": "Ab minor", "2A": "Eb minor", "3A": "Bb minor",
    "4A": "F minor", "5A": "C minor", "6A": "G minor",
    "7A": "D minor", "8A": "A minor", "9A": "E minor",
    "10A": "B minor", "11A": "F# minor", "12A": "Db minor",
    "1B": "B major", "2B": "F# major", "3B": "Db major",
    "4B": "Ab major", "5B": "Eb major", "6B": "Bb major",
    "7B": "F major", "8B": "C major", "9B": "G major",
    "10B": "D major", "11B": "A major", "12B": "E major",
}


def key_to_camelot(key: str) -> Optional[str]:
    """Convert a musical key string to Camelot code.

    Accepts formats like: "C major", "Am", "8B", "Cm", "C#m", "Db major"
    """
    if not key:
        return None

    key = key.strip()

    # Already a Camelot code?
    upper = key.upper()
    if upper in CAMELOT_TO_KEY:
        return upper

    # Shorthand: "Am", "C#m", "Bbm" → minor; "C", "F#", "Db" → major
    if key.endswith("m") and not key.endswith("major") and not key.endswith("minor"):
        base = key[:-1].strip()
        lookup = f"{base} minor"
    elif " " not in key:
        lookup = f"{key} major"
    else:
        lookup = key

    return KEY_TO_CAMELOT.get(lookup)


def camelot_to_key(code: str) -> Optional[str]:
    """Convert Camelot code to musical key string."""
    if not code:
        return None
    return CAMELOT_TO_KEY.get(code.upper())


def get_compatible_keys(camelot_code: str) -> list[str]:
    """Return list of Camelot codes compatible with the given code.

    Compatibility rules (standard DJ harmonic mixing):
    1. Same key (e.g., 8A → 8A)
    2. +1 on wheel (e.g., 8A → 9A)
    3. -1 on wheel (e.g., 8A → 7A)
    4. Inner/outer switch (e.g., 8A → 8B)
    """
    code = camelot_code.upper().strip()
    if code not in CAMELOT_TO_KEY:
        return []

    number = int(code[:-1])
    letter = code[-1]

    compatible = [code]  # same key

    # ±1 on wheel (wrapping 1-12)
    plus_one = ((number % 12) + 1)
    if plus_one == 0:
        plus_one = 12
    minus_one = number - 1
    if minus_one == 0:
        minus_one = 12

    compatible.append(f"{plus_one}{letter}")
    compatible.append(f"{minus_one}{letter}")

    # Inner/outer switch
    other_letter = "B" if letter == "A" else "A"
    compatible.append(f"{number}{other_letter}")

    return compatible


def compatibility_score(key1: str, key2: str) -> int:
    """Return a compatibility score between two keys.

    Returns:
        3 = same key (perfect match)
        2 = adjacent on Camelot wheel (±1) or inner/outer switch
        1 = ±2 on wheel (energy boost/drop)
        0 = not harmonically compatible
    """
    c1 = key_to_camelot(key1)
    c2 = key_to_camelot(key2)

    if not c1 or not c2:
        return 0

    if c1 == c2:
        return 3

    n1, l1 = int(c1[:-1]), c1[-1]
    n2, l2 = int(c2[:-1]), c2[-1]

    # Distance on wheel (circular)
    dist = min(abs(n1 - n2), 12 - abs(n1 - n2))

    if dist == 0 and l1 != l2:
        return 2  # inner/outer switch
    if dist == 1 and l1 == l2:
        return 2  # adjacent same column
    if dist == 2 and l1 == l2:
        return 1  # energy boost
    if dist == 1 and l1 != l2:
        return 1  # diagonal

    return 0


def bpm_compatible(bpm1: float, bpm2: float, tolerance: float = 6.0) -> bool:
    """Check if two BPMs are mix-compatible (within tolerance or half/double time)."""
    if not bpm1 or not bpm2:
        return False
    diff = abs(bpm1 - bpm2)
    half_diff = abs(bpm1 - bpm2 / 2)
    double_diff = abs(bpm1 - bpm2 * 2)
    return diff <= tolerance or half_diff <= tolerance or double_diff <= tolerance


def transition_score(
    bpm1: float, key1: str,
    bpm2: float, key2: str,
    bpm_tolerance: float = 6.0,
) -> dict:
    """Calculate an overall transition score between two tracks.

    Returns dict with:
        - harmonic_score: 0-3
        - bpm_compatible: bool
        - bpm_diff: float
        - overall_score: 0-100
        - recommendation: str
    """
    h_score = compatibility_score(key1, key2)
    bpm_ok = bpm_compatible(bpm1, bpm2, bpm_tolerance)
    bpm_diff = abs(bpm1 - bpm2) if bpm1 and bpm2 else 999

    # Overall: harmonic (60%) + BPM (40%)
    h_pct = (h_score / 3.0) * 60
    b_pct = 40.0 if bpm_ok else max(0, 40 - bpm_diff * 4)
    overall = round(h_pct + b_pct)

    if overall >= 80:
        rec = "excellent"
    elif overall >= 60:
        rec = "good"
    elif overall >= 40:
        rec = "possible"
    else:
        rec = "risky"

    return {
        "harmonic_score": h_score,
        "camelot_from": key_to_camelot(key1),
        "camelot_to": key_to_camelot(key2),
        "bpm_compatible": bpm_ok,
        "bpm_diff": round(bpm_diff, 1),
        "overall_score": overall,
        "recommendation": rec,
    }
