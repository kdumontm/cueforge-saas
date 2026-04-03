"""
CueForge v4 — Remix/Version Detection Service.

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


def detect_remix_info(title: str) -> Dict:
    """
    Parse a track title and extract remix/version/featuring info.

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

    Returns list of indices into tracks_titles that match.
    """
    info = detect_remix_info(title)
    clean = info["clean_title"].lower()

    if len(clean) < 3:
        return []

    related = []
    for i, other_title in enumerate(tracks_titles):
        if other_title == title:
            continue
        other_info = detect_remix_info(other_title)
        other_clean = other_info["clean_title"].lower()
        # Match if the clean titles are very similar
        if clean == other_clean:
            related.append(i)
        elif len(clean) > 5 and (clean in other_clean or other_clean in clean):
            related.append(i)

    return related
