"""
TrackCue v4 — Remix/Version Detection Service.

Parses track titles to extract remix info, version type, and featured artists.
Follows standard music industry naming conventions:
  "Track Title (Artist Remix)" / "Track Title - Extended Mix" / "Track Title (feat. Artist)"
"""

import re
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

# ── Remix patterns ─────────────────────────────────────────────────────────

# Common remix suffixes and their canonical types
REMIX_PATTERNS = [
    # (regex pattern, remix_type)
    (r'\(([^)]+?)\s+remix\)', 'Remix'),
    (r'\(([^)]+?)\s+bootleg\)', 'Bootleg'),
    (r'\(([^)]+?)\s+edit\)', 'Edit'),
    (r'\(([^)]+?)\s+rework\)', 'Rework'),
    (r'\(([^)]+?)\s+flip\)', 'Flip'),
    (r'\(([^)]+?)\s+dub\s*mix\)', 'Dub Mix'),
    (r'\(([^)]+?)\s+club\s*mix\)', 'Club Mix'),
    (r'\(([^)]+?)\s+vip\s*mix\)', 'VIP Mix'),
    (r'\(([^)]+?)\s+version\)', 'Version'),
    # Hyphenated patterns
    (r'\s*-\s*([^-]+?)\s+remix$', 'Remix'),
    (r'\s*-\s*([^-]+?)\s+bootleg$', 'Bootleg'),
    (r'\s*-\s*([^-]+?)\s+edit$', 'Edit'),
]

# Version types (no artist attribution)
VERSION_PATTERNS = [
    (r'\(extended\s*mix\)', 'Extended Mix', None),
    (r'\(original\s*mix\)', 'Original Mix', None),
    (r'\(radio\s*edit\)', 'Radio Edit', None),
    (r'\(radio\s*mix\)', 'Radio Mix', None),
    (r'\(club\s*mix\)', 'Club Mix', None),
    (r'\(dub\s*mix\)', 'Dub Mix', None),
    (r'\(instrumental\)', 'Instrumental', None),
    (r'\(acapella\)', 'Acapella', None),
    (r'\(a\s*cappella\)', 'Acapella', None),
    (r'\(acoustic\)', 'Acoustic', None),
    (r'\(live\)', 'Live', None),
    (r'\(vip\)', 'VIP', None),
    (r'\(remastered\)', 'Remastered', None),
    (r'\(deluxe\)', 'Deluxe', None),
    # Hyphenated
    (r'\s*-\s*extended\s*mix$', 'Extended Mix', None),
    (r'\s*-\s*original\s*mix$', 'Original Mix', None),
    (r'\s*-\s*radio\s*edit$', 'Radio Edit', None),
    (r'\s*-\s*instrumental$', 'Instrumental', None),
]

# Featured artist patterns
FEAT_PATTERNS = [
    r'\(feat\.?\s+([^)]+)\)',
    r'\(ft\.?\s+([^)]+)\)',
    r'\(featuring\s+([^)]+)\)',
    r'\(with\s+([^)]+)\)',
    r'\s+feat\.?\s+(.+?)(?:\s*[\(\[-]|$)',
    r'\s+ft\.?\s+(.+?)(?:\s*[\(\[-]|$)',
]


def detect_remix_info(title: str, id3_meta: Optional[Dict] = None) -> Dict:
    """
    Parse a track title and extract remix/version/featuring info.
    
    Optionally uses ID3 tags (subtitle/TIT3) for remix detection with higher priority.
    Beatport/Traktor mettent souvent le type de mix dans le subtitle: "Original Mix", "Extended Mix", "John Doe Remix"

    Args:
        title: Track title to parse
        id3_meta: Optional dict with ID3 tags {'subtitle': '...', 'genre': '...', etc.}

    Returns:
        {
            "clean_title": "Track Title",          # Title without remix/feat info
            "remix_artist": "DJ Name" or None,     # Who remixed it
            "remix_type": "Remix" or None,         # Type of remix
            "version_type": "Extended Mix" or None, # Version type
            "feat_artist": "Featured Artist" or None,
            "is_remix": bool,
            "is_original": bool,
        }
    """
    if not title:
        return {
            "clean_title": title,
            "remix_artist": None, "remix_type": None,
            "version_type": None, "feat_artist": None,
            "is_remix": False, "is_original": True,
        }

    result = {
        "clean_title": title,
        "remix_artist": None,
        "remix_type": None,
        "version_type": None,
        "feat_artist": None,
        "is_remix": False,
        "is_original": True,
    }

    working_title = title.strip()
    
    # 0. Check ID3 tags first (subtitle/TIT3 field)
    if id3_meta:
        subtitle = id3_meta.get("subtitle") or id3_meta.get("TIT3")
        if subtitle:
            sub_lower = subtitle.lower()
            if "remix" in sub_lower:
                # Extract remixer name: "John Doe Remix" → "John Doe"
                m = re.match(r'^(.+?)\s+remix\s*$', subtitle, flags=re.I)
                if m:
                    result["remix_artist"] = m.group(1).strip()
                    result["remix_type"] = "Remix"
                    result["is_remix"] = True
                    result["is_original"] = False
                    return result  # ID3 tags sont prioritaires
            elif "extended" in sub_lower:
                result["version_type"] = "Extended Mix"
                result["is_original"] = False
                return result
            elif "radio" in sub_lower or "edit" in sub_lower:
                result["version_type"] = "Radio Edit" if "radio" in sub_lower else "Edit"
                result["is_original"] = False
                return result
            elif "original" in sub_lower:
                result["version_type"] = "Original Mix"
                return result

    # 1. Extract featured artists first
    for pattern in FEAT_PATTERNS:
        match = re.search(pattern, working_title, re.IGNORECASE)
        if match:
            result["feat_artist"] = match.group(1).strip()
            working_title = re.sub(pattern, '', working_title, flags=re.IGNORECASE).strip()
            break

    # 2. Check for remix (artist-attributed)
    for pattern, remix_type in REMIX_PATTERNS:
        match = re.search(pattern, working_title, re.IGNORECASE)
        if match:
            result["remix_artist"] = match.group(1).strip()
            result["remix_type"] = remix_type
            result["is_remix"] = True
            result["is_original"] = False
            working_title = re.sub(pattern, '', working_title, flags=re.IGNORECASE).strip()
            break

    # 3. Check for version type (no artist)
    if not result["is_remix"]:
        for pattern, version, _ in VERSION_PATTERNS:
            match = re.search(pattern, working_title, re.IGNORECASE)
            if match:
                result["version_type"] = version
                if version not in ("Original Mix",):
                    result["is_original"] = False
                working_title = re.sub(pattern, '', working_title, flags=re.IGNORECASE).strip()
                break

    # Clean up title
    working_title = re.sub(r'\s*[-–—]\s*$', '', working_title).strip()
    working_title = re.sub(r'\(\s*\)', '', working_title).strip()
    result["clean_title"] = working_title

    return result


def find_related_versions(title: str, tracks_titles: list) -> list:
    """
    Given a track title, find other tracks in the library that are
    different versions/remixes of the same song.

    Optimized O(n) with normalized title indexing instead of O(n²).

    Returns list of indices into tracks_titles that match.
    """
    info = detect_remix_info(title)
    clean = info["clean_title"].lower()

    if len(clean) < 3:
        return []

    # Build index of normalized titles for O(n) lookup
    # Map normalized title -> list of (index, original_title) pairs
    title_index = {}
    for i, other_title in enumerate(tracks_titles):
        if other_title == title:
            continue
        other_info = detect_remix_info(other_title)
        other_clean = other_info["clean_title"].lower()

        if other_clean not in title_index:
            title_index[other_clean] = []
        title_index[other_clean].append(i)

    # O(1) lookup for exact match, then check partial matches
    related = []
    if clean in title_index:
        related.extend(title_index[clean])

    # For longer titles, check for substring matches (only among candidates)
    if len(clean) > 5:
        for normalized, indices in title_index.items():
            if normalized != clean and (clean in normalized or normalized in clean):
                related.extend(indices)

    return list(set(related))  # Deduplicate
