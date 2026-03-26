"""
Track tools: clean title, parse remix, fix tags, detect genre, Spotify lookup.
Professional DJ-oriented utilities for CueForge.
"""
import re
import os
import logging
from typing import Dict, Optional, List, Any

logger = logging.getLogger(__name__)

# ── Title cleaning ───────────────────────────────────────────────────────────

# Common junk patterns in DJ track filenames
JUNK_PATTERNS = [
    r'\[?\d{2,4}kbps\]?',           # bitrate info
    r'\(?(Official\s*)?(Music\s*)?Video\)?',
    r'\(?Official\s*Audio\)?',
    r'\(?Lyrics?\s*(Video)?\)?',
    r'\(?HD\)?',
    r'\(?HQ\)?',
    r'\[?www\..*?\]?',              # website urls
    r'\(?(FREE\s*)?DOWNLOAD\)?',
    r'\(?OUT\s*NOW\)?',
    r'\(?PREMIERE\)?',
    r'\(?Clip\s*Officiel\)?',
    r'\d{6,}',                         # long numbers (IDs)
    r'\s*-\s*$',                      # trailing dash
    r'^\s*-\s*',                      # leading dash
    r'^\d+\.?\s+',                   # leading track numbers
]

def clean_title(raw_title: str) -> Dict[str, str]:
    """
    Clean a track title: proper capitalization, remove junk,
    normalize separators.
    Returns dict with 'title' and optionally 'artist'.
    """
    title = raw_title.strip()
    
    # Remove file extension if present
    title = re.sub(r'\.(mp3|wav|flac|aiff?|m4a|ogg|opus)$', '', title, flags=re.IGNORECASE)
    
    # Remove junk patterns
    for pattern in JUNK_PATTERNS:
        title = re.sub(pattern, '', title, flags=re.IGNORECASE)
    
    # Try to split artist - title
    artist = None
    separators = [' - ', ' – ', ' — ', ' _ ']
    for sep in separators:
        if sep in title:
            parts = title.split(sep, 1)
            if len(parts) == 2:
                artist = parts[0].strip()
                title = parts[1].strip()
                break
    
    # Title case with DJ/music exceptions
    title = _smart_title_case(title)
    if artist:
        artist = _smart_title_case(artist)
    
    # Clean up whitespace
    title = re.sub(r'\s+', ' ', title).strip()
    if artist:
        artist = re.sub(r'\s+', ' ', artist).strip()
    
    result = {'title': title}
    if artist:
        result['artist'] = artist
    return result


def _smart_title_case(text: str) -> str:
    """Title case that respects DJ naming conventions."""
    # Words that should stay lowercase (unless first word)
    lowercase_words = {'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'vs', 'ft', 'feat'}
    # Words/abbreviations that should stay uppercase
    uppercase_words = {'DJ', 'MC', 'VIP', 'UK', 'US', 'EP', 'LP', 'ID', 'TV', 'AI', 'II', 'III', 'IV'}
    
    words = text.split()
    result = []
    for i, word in enumerate(words):
        upper = word.upper()
        if upper in uppercase_words:
            result.append(upper)
        elif i > 0 and word.lower() in lowercase_words:
            result.append(word.lower())
        else:
            result.append(word.capitalize())
    return ' '.join(result)


# ── Remix parsing ────────────────────────────────────────────────────────────

REMIX_PATTERNS = [
    r'\(([^)]+?)\s+(Remix|Rmx|Mix|Edit|Bootleg|Rework|Flip|Dub|VIP|Refix|Mashup)\)',
    r'\[([^\]]+?)\s+(Remix|Rmx|Mix|Edit|Bootleg|Rework|Flip|Dub|VIP|Refix|Mashup)\]',
    r'-\s*([^-]+?)\s+(Remix|Rmx|Mix|Edit|Bootleg|Rework|Flip|Dub|VIP)$',
]

FEAT_PATTERNS = [
    r'\(feat\.?\s+([^)]+)\)',
    r'\(ft\.?\s+([^)]+)\)',
    r'\[feat\.?\s+([^\]]+)\]',
    r'\[ft\.?\s+([^\]]+)\]',
    r'\sfeat\.?\s+(.+?)(?:\s*[-\(\[]|$)',
    r'\sft\.?\s+(.+?)(?:\s*[-\(\[]|$)',
]

def parse_remix(title: str) -> Dict[str, Optional[str]]:
    """
    Extract remix artist, remix type, and featured artist from title.
    Returns dict with: clean_title, remix_artist, remix_type, feat_artist
    """
    result = {
        'clean_title': title,
        'remix_artist': None,
        'remix_type': None,
        'feat_artist': None,
    }
    
    working = title
    
    # Extract featured artist
    for pattern in FEAT_PATTERNS:
        match = re.search(pattern, working, re.IGNORECASE)
        if match:
            result['feat_artist'] = match.group(1).strip()
            working = working[:match.start()] + working[match.end():]
            break
    
    # Extract remix info
    for pattern in REMIX_PATTERNS:
        match = re.search(pattern, working, re.IGNORECASE)
        if match:
            result['remix_artist'] = match.group(1).strip()
            result['remix_type'] = match.group(2).strip().capitalize()
            working = working[:match.start()] + working[match.end():]
            break
    
    result['clean_title'] = re.sub(r'\s+', ' ', working).strip()
    return result


# ── Tag fixing ───────────────────────────────────────────────────────────────

def fix_id3_tags(file_path: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Write/fix ID3 tags on the audio file using mutagen.
    metadata can include: title, artist, album, genre, year, bpm, key
    Returns the tags that were successfully written.
    """
    try:
        from mutagen import File as MutagenFile
        from mutagen.id3 import ID3, TIT2, TPE1, TALB, TCON, TDRC, TBPM, TKEY, ID3NoHeaderError
        from mutagen.flac import FLAC
        from mutagen.mp4 import MP4
        from mutagen.oggvorbis import OggVorbis
    except ImportError:
        logger.error("mutagen not installed")
        return {'error': 'mutagen not available'}
    
    ext = os.path.splitext(file_path)[1].lower()
    written = {}
    
    try:
        if ext == '.mp3':
            try:
                tags = ID3(file_path)
            except ID3NoHeaderError:
                tags = ID3()
            
            tag_map = {
                'title': lambda v: TIT2(encoding=3, text=[v]),
                'artist': lambda v: TPE1(encoding=3, text=[v]),
                'album': lambda v: TALB(encoding=3, text=[v]),
                'genre': lambda v: TCON(encoding=3, text=[v]),
                'year': lambda v: TDRC(encoding=3, text=[str(v)]),
                'bpm': lambda v: TBPM(encoding=3, text=[str(int(float(v)))]),
                'key': lambda v: TKEY(encoding=3, text=[v]),
            }
            
            for field, factory in tag_map.items():
                if field in metadata and metadata[field] is not None:
                    tags.add(factory(metadata[field]))
                    written[field] = metadata[field]
            
            tags.save(file_path)
            
        elif ext == '.flac':
            audio = FLAC(file_path)
            flac_map = {
                'title': 'title', 'artist': 'artist', 'album': 'album',
                'genre': 'genre', 'year': 'date', 'bpm': 'bpm',
                'key': 'initialkey',
            }
            for field, tag_name in flac_map.items():
                if field in metadata and metadata[field] is not None:
                    audio[tag_name] = [str(metadata[field])]
                    written[field] = metadata[field]
            audio.save()
            
        elif ext in ('.m4a', '.mp4'):
            audio = MP4(file_path)
            mp4_map = {
                'title': '\xa9nam', 'artist': '\xa9ART', 'album': '\xa9alb',
                'genre': '\xa9gen', 'year': '\xa9day',
            }
            for field, tag_name in mp4_map.items():
                if field in metadata and metadata[field] is not None:
                    audio[tag_name] = [str(metadata[field])]
                    written[field] = metadata[field]
            audio.save()
            
        else:
            # Try generic mutagen approach
            audio = MutagenFile(file_path, easy=True)
            if audio is not None:
                easy_map = {
                    'title': 'title', 'artist': 'artist', 'album': 'album',
                    'genre': 'genre', 'date': 'year', 'bpm': 'bpm',
                }
                for field, tag_name in easy_map.items():
                    if field in metadata and metadata[field] is not None:
                        audio[tag_name] = [str(metadata[field])]
                        written[field] = metadata[field]
                audio.save()
    except Exception as e:
        logger.error(f"Error writing tags to {file_path}: {e}")
        return {'error': str(e), 'written': written}
    
    return {'written': written, 'file_path': file_path}


# ── Genre detection ──────────────────────────────────────────────────────────

# BPM-based genre estimation (fallback when no Spotify data)
GENRE_BPM_RANGES = [
    (60, 90, 'Hip-Hop'),
    (90, 110, 'Reggaeton'),
    (110, 120, 'House / Deep House'),
    (120, 130, 'Tech House'),
    (128, 140, 'EDM / Progressive House'),
    (135, 145, 'Trance'),
    (140, 155, 'Dubstep'),
    (150, 160, 'Drum & Bass / Jungle'),
    (160, 180, 'Drum & Bass'),
    (170, 200, 'Hardstyle / Hardcore'),
    (95, 115, 'Afrobeats'),
    (115, 130, 'Dancehall'),
]

def detect_genre_from_analysis(bpm: float, energy: float = None, key: str = None) -> Dict[str, Any]:
    """
    Estimate genre from BPM and energy level.
    Returns dict with possible genres ranked by confidence.
    """
    candidates = []
    
    for low, high, genre in GENRE_BPM_RANGES:
        if low <= bpm <= high:
            # Calculate confidence based on how centered the BPM is in range
            mid = (low + high) / 2
            span = (high - low) / 2
            distance = abs(bpm - mid) / span
            confidence = max(0.3, 1.0 - distance * 0.5)
            
            # Boost confidence with energy if available
            if energy is not None:
                if genre in ('Hardstyle / Hardcore', 'Drum & Bass', 'Dubstep') and energy > 0.7:
                    confidence = min(1.0, confidence + 0.15)
                elif genre in ('House / Deep House', 'Tech House') and 0.4 <= energy <= 0.7:
                    confidence = min(1.0, confidence + 0.1)
                elif genre == 'Hip-Hop' and energy < 0.6:
                    confidence = min(1.0, confidence + 0.1)
            
            candidates.append({'genre': genre, 'confidence': round(confidence, 2)})
    
    # Sort by confidence
    candidates.sort(key=lambda x: x['confidence'], reverse=True)
    
    # Deduplicate
    seen = set()
    unique = []
    for c in candidates:
        if c['genre'] not in seen:
            seen.add(c['genre'])
            unique.append(c)
    
    return {
        'genres': unique[:5],
        'best_guess': unique[0]['genre'] if unique else 'Unknown',
        'method': 'bpm_analysis'
    }


# ── Spotify lookup ───────────────────────────────────────────────────────────

def spotify_search(query: str, artist: str = None) -> Optional[Dict[str, Any]]:
    """
    Search Spotify for a track. Returns metadata if found.
    """
    try:
        import spotipy
        from spotipy.oauth2 import SpotifyClientCredentials
        
        client_id = os.getenv('SPOTIFY_CLIENT_ID')
        client_secret = os.getenv('SPOTIFY_CLIENT_SECRET')
        
        if not client_id or not client_secret:
            logger.warning("Spotify credentials not configured")
            return None
        
        sp = spotipy.Spotify(auth_manager=SpotifyClientCredentials(
            client_id=client_id,
            client_secret=client_secret
        ))
        
        # Build search query
        search_q = query
        if artist:
            search_q = f"track:{query} artist:{artist}"
        
        results = sp.search(q=search_q, type='track', limit=5)
        
        if not results or not results.get('tracks', {}).get('items'):
            return None
        
        tracks = results['tracks']['items']
        matches = []
        
        for t in tracks:
            match = {
                'spotify_id': t['id'],
                'spotify_url': t['external_urls'].get('spotify'),
                'title': t['name'],
                'artist': ', '.join(a['name'] for a in t['artists']),
                'album': t['album']['name'],
                'year': int(t['album']['release_date'][:4]) if t['album'].get('release_date') else None,
                'artwork_url': t['album']['images'][0]['url'] if t['album'].get('images') else None,
                'preview_url': t.get('preview_url'),
                'popularity': t.get('popularity'),
                'duration_ms': t.get('duration_ms'),
                'isrc': t.get('external_ids', {}).get('isrc'),
            }
            
            # Try to get audio features for genre hint
            try:
                features = sp.audio_features([t['id']])[0]
                if features:
                    match['spotify_bpm'] = round(features.get('tempo', 0), 1)
                    match['spotify_energy'] = round(features.get('energy', 0), 2)
                    match['spotify_key'] = features.get('key')
                    match['spotify_mode'] = features.get('mode')
                    match['spotify_danceability'] = round(features.get('danceability', 0), 2)
            except Exception:
                pass
            
            # Try to get artist genres
            try:
                artist_info = sp.artist(t['artists'][0]['id'])
                if artist_info and artist_info.get('genres'):
                    match['genres'] = artist_info['genres'][:5]
            except Exception:
                pass
            
            matches.append(match)
        
        return {
            'results': matches,
            'total': len(matches),
            'query': search_q,
        }
        
    except ImportError:
        logger.error("spotipy not installed")
        return {'error': 'spotipy not available'}
    except Exception as e:
        logger.error(f"Spotify search error: {e}")
        return {'error': str(e)}

