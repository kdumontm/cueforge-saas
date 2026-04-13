"""
Audio fingerprinting service for remix/bootleg/cover detection.
Points 751-760: Fingerprint V2 (chroma + onset), remix detection,
version detection, duplicate detection, compact storage.
"""

import numpy as np
import librosa
import hashlib
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass
from enum import Enum


class TrackVersion(Enum):
    """Audio version types."""
    ORIGINAL = "original"
    RADIO_EDIT = "radio_edit"
    EXTENDED = "extended"
    CLUB = "club"
    REMIX = "remix"
    BOOTLEG = "bootleg"
    COVER = "cover"
    UNKNOWN = "unknown"


@dataclass
class AudioFingerprint:
    """Audio fingerprint V2 data."""
    fingerprint_id: str      # Hash of fingerprint
    chroma_hash: str         # Chroma-based hash
    onset_hash: str          # Onset-based hash
    combined_hash: str       # Combined fingerprint
    length_seconds: float
    timestamp: int           # Unix timestamp


@dataclass
class RemixDetection:
    """Remix/bootleg/cover detection results."""
    is_remix: bool
    is_bootleg: bool
    is_cover: bool
    confidence: float
    match_fingerprints: List[str]  # Matching original fingerprints
    detection_type: str      # 'remix', 'bootleg', 'cover', 'original'


@dataclass
class VersionDetection:
    """Version detection (radio/extended/club/etc)."""
    detected_version: TrackVersion
    confidence: float
    length_category: str     # 'short', 'standard', 'extended'
    fade_characteristics: Dict[str, float]


@dataclass
class DuplicateAnalysis:
    """Duplicate detection by audio."""
    is_duplicate: bool
    match_similarity: float  # 0-1
    matches: List[Tuple[str, float]]  # (fingerprint_id, similarity)
    match_type: str          # 'exact', 'similar', 'different'


@dataclass
class CompactFingerprint:
    """Compact fingerprint storage (minimal bytes)."""
    chroma_bits: bytes       # Quantized chroma (36 bits per frame)
    onset_bits: bytes        # Quantized onset (8 bits per frame)
    metadata: Dict[str, str]


class AudioFingerprintService:
    """Generate and match audio fingerprints for version/remix/duplicate detection."""

    def __init__(self, sr: int = 22050, hop_length: int = 512):
        self.sr = sr
        self.hop_length = hop_length

    def generate_fingerprint(self, y: np.ndarray) -> AudioFingerprint:
        """Generate fingerprint V2 (chroma + onset based)."""
        # Extract chroma and onset features
        chroma = librosa.feature.chroma_cqt(y=y, sr=self.sr, hop_length=self.hop_length)
        onset_env = librosa.onset.onset_strength(y=y, sr=self.sr, hop_length=self.hop_length)

        # Generate hashes
        chroma_hash = self._hash_chroma(chroma)
        onset_hash = self._hash_onset(onset_env)
        combined_hash = self._combine_hashes(chroma_hash, onset_hash)

        fingerprint_id = hashlib.sha256(
            (chroma_hash + onset_hash).encode()
        ).hexdigest()[:16]

        duration = len(y) / self.sr

        return AudioFingerprint(
            fingerprint_id=fingerprint_id,
            chroma_hash=chroma_hash,
            onset_hash=onset_hash,
            combined_hash=combined_hash,
            length_seconds=duration,
            timestamp=int(np.random.random() * 1e9)  # Placeholder
        )

    def detect_remix(self, fingerprint1: AudioFingerprint, fingerprint2: AudioFingerprint) -> RemixDetection:
        """Detect if track is a remix of original."""
        # Compare fingerprints
        chroma_sim = self._similarity_score(fingerprint1.chroma_hash, fingerprint2.chroma_hash)
        onset_sim = self._similarity_score(fingerprint1.onset_hash, fingerprint2.onset_hash)

        # Remix detection: high chroma sim but different onset pattern
        is_remix = chroma_sim > 0.6 and onset_sim < 0.5
        is_bootleg = chroma_sim > 0.7 and onset_sim > 0.6  # Similar but not identical
        is_cover = chroma_sim > 0.5 and (fingerprint1.length_seconds / fingerprint2.length_seconds) > 0.8

        confidence = (chroma_sim + onset_sim) / 2

        detection_type = "original"
        if is_remix:
            detection_type = "remix"
        elif is_bootleg:
            detection_type = "bootleg"
        elif is_cover:
            detection_type = "cover"

        return RemixDetection(
            is_remix=is_remix,
            is_bootleg=is_bootleg,
            is_cover=is_cover,
            confidence=float(confidence),
            match_fingerprints=[fingerprint2.fingerprint_id],
            detection_type=detection_type
        )

    def detect_version(self, y: np.ndarray) -> VersionDetection:
        """Detect version (radio/extended/club/original)."""
        duration = len(y) / self.sr

        # Duration-based classification
        if duration < 240:  # < 4 min
            length_category = "short"
            detected_version = TrackVersion.RADIO_EDIT
        elif duration < 360:  # 4-6 min
            length_category = "standard"
            detected_version = TrackVersion.ORIGINAL
        else:
            length_category = "extended"
            detected_version = TrackVersion.EXTENDED

        # Fade characteristics
        fade_chars = self._analyze_fades(y)

        # Adjust version based on fades
        if fade_chars.get('intro_length', 0) > 5.0:
            detected_version = TrackVersion.CLUB
        if fade_chars.get('outro_length', 0) > 10.0:
            detected_version = TrackVersion.EXTENDED

        confidence = 0.75

        return VersionDetection(
            detected_version=detected_version,
            confidence=confidence,
            length_category=length_category,
            fade_characteristics=fade_chars
        )

    def detect_duplicate(self, fingerprint1: AudioFingerprint, fingerprints: List[AudioFingerprint]) -> DuplicateAnalysis:
        """Detect duplicates by audio analysis."""
        matches = []

        for fp in fingerprints:
            if fp.fingerprint_id == fingerprint1.fingerprint_id:
                continue

            chroma_sim = self._similarity_score(fingerprint1.chroma_hash, fp.chroma_hash)
            onset_sim = self._similarity_score(fingerprint1.onset_hash, fp.onset_hash)
            combined_sim = (chroma_sim + onset_sim) / 2

            if combined_sim > 0.8:
                matches.append((fp.fingerprint_id, combined_sim))

        matches = sorted(matches, key=lambda x: x[1], reverse=True)

        is_duplicate = len(matches) > 0
        match_similarity = matches[0][1] if matches else 0.0

        # Determine match type
        if match_similarity > 0.95:
            match_type = "exact"
        elif match_similarity > 0.75:
            match_type = "similar"
        else:
            match_type = "different"

        return DuplicateAnalysis(
            is_duplicate=is_duplicate,
            match_similarity=match_similarity,
            matches=matches,
            match_type=match_type
        )

    def compress_fingerprint(self, fingerprint: AudioFingerprint) -> CompactFingerprint:
        """Compress fingerprint for compact storage."""
        # Quantize chroma hash to bits
        chroma_bits = self._quantize_hash_to_bits(fingerprint.chroma_hash, 36)

        # Quantize onset hash to bits
        onset_bits = self._quantize_hash_to_bits(fingerprint.onset_hash, 8)

        metadata = {
            "fingerprint_id": fingerprint.fingerprint_id,
            "length": str(fingerprint.length_seconds),
            "combined_hash": fingerprint.combined_hash
        }

        return CompactFingerprint(
            chroma_bits=chroma_bits,
            onset_bits=onset_bits,
            metadata=metadata
        )

    def decompress_fingerprint(self, compact: CompactFingerprint) -> AudioFingerprint:
        """Decompress compact fingerprint back to full format."""
        chroma_hash = self._bits_to_hash(compact.chroma_bits, 36)
        onset_hash = self._bits_to_hash(compact.onset_bits, 8)

        return AudioFingerprint(
            fingerprint_id=compact.metadata["fingerprint_id"],
            chroma_hash=chroma_hash,
            onset_hash=onset_hash,
            combined_hash=compact.metadata["combined_hash"],
            length_seconds=float(compact.metadata["length"]),
            timestamp=0
        )

    def fingerprint_batch(self, tracks: List[np.ndarray]) -> List[AudioFingerprint]:
        """Generate fingerprints for batch of tracks."""
        fingerprints = []

        for track in tracks:
            fp = self.generate_fingerprint(track)
            fingerprints.append(fp)

        return fingerprints

    # Helper methods

    def _hash_chroma(self, chroma: np.ndarray) -> str:
        """Generate hash from chroma features."""
        if chroma.shape[1] == 0:
            return ""

        # Binarize chroma: keep only top 3 pitches per frame
        binary_chroma = np.zeros_like(chroma)

        for i in range(chroma.shape[1]):
            top_3 = np.argsort(chroma[:, i])[-3:]
            binary_chroma[top_3, i] = 1

        # Flatten and hash
        hash_input = binary_chroma.astype(int).tobytes()
        return hashlib.md5(hash_input).hexdigest()[:16]

    def _hash_onset(self, onset_env: np.ndarray) -> str:
        """Generate hash from onset features."""
        # Threshold onset envelope
        threshold = np.mean(onset_env) + np.std(onset_env)
        binary_onset = (onset_env > threshold).astype(int)

        # Hash
        hash_input = binary_onset.tobytes()
        return hashlib.md5(hash_input).hexdigest()[:16]

    def _combine_hashes(self, chroma_hash: str, onset_hash: str) -> str:
        """Combine two hashes into one."""
        combined = chroma_hash + onset_hash
        return hashlib.sha256(combined.encode()).hexdigest()[:16]

    def _similarity_score(self, hash1: str, hash2: str) -> float:
        """Calculate similarity between two hashes (Hamming distance)."""
        if len(hash1) == 0 or len(hash2) == 0:
            return 0.0

        # Hamming distance
        distance = sum(c1 != c2 for c1, c2 in zip(hash1, hash2))
        max_distance = max(len(hash1), len(hash2))

        similarity = 1.0 - (distance / max_distance)
        return float(np.clip(similarity, 0, 1))

    def _analyze_fades(self, y: np.ndarray) -> Dict[str, float]:
        """Analyze intro/outro fades."""
        # RMS over time
        frame_len = self.hop_length * 4
        n_frames = len(y) // frame_len

        if n_frames < 2:
            return {"intro_length": 0.0, "outro_length": 0.0}

        rms_frames = []
        for i in range(n_frames):
            segment = y[i * frame_len:(i+1) * frame_len]
            rms = np.sqrt(np.mean(segment**2))
            rms_frames.append(rms)

        rms_frames = np.array(rms_frames)

        # Find intro fade (rising part)
        intro_length = 0.0
        for i in range(len(rms_frames) // 4):
            if rms_frames[i] < 0.1 * np.max(rms_frames):
                intro_length = i * frame_len / self.sr
            else:
                break

        # Find outro fade (falling part)
        outro_length = 0.0
        for i in range(len(rms_frames) - 1, max(0, len(rms_frames) - len(rms_frames) // 4), -1):
            if rms_frames[i] < 0.1 * np.max(rms_frames):
                outro_length = (len(rms_frames) - i) * frame_len / self.sr
            else:
                break

        return {
            "intro_length": float(intro_length),
            "outro_length": float(outro_length)
        }

    def _quantize_hash_to_bits(self, hash_str: str, bits_per_element: int) -> bytes:
        """Convert hash string to quantized bits."""
        # Simple: convert hex chars to binary
        bin_str = bin(int(hash_str, 16))[2:].zfill(len(hash_str) * 4)

        # Truncate or pad to desired length
        desired_length = bits_per_element
        if len(bin_str) > desired_length:
            bin_str = bin_str[:desired_length]
        else:
            bin_str = bin_str.ljust(desired_length, '0')

        # Convert to bytes
        byte_length = (len(bin_str) + 7) // 8
        byte_value = int(bin_str, 2)
        return byte_value.to_bytes(byte_length, byteorder='big')

    def _bits_to_hash(self, bits: bytes, bits_per_element: int) -> str:
        """Convert bits back to hash string."""
        int_value = int.from_bytes(bits, byteorder='big')
        hex_str = hex(int_value)[2:]
        return hex_str.ljust(bits_per_element // 4, '0')
