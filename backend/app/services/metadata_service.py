"""
Metadata service: fingerprint audio and look up track info from
AcoustID, MusicBrainz, Discogs, Spotify, iTunes, and Last.fm.

Pipeline order (optimisé pour musique électronique):
  AcoustID → MusicBrainz → Discogs → Spotify → iTunes → Last.fm

All lookups are optional — if a service fails or isn't configured,
the pipeline continues silently.
"""
import subprocess
import json
import os
import logging
import time
from typing import Optional, Dict, Any, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache

logger = logging.getLogger(__name__)

# AcoustID test key — replace with your own from https://acoustid.org/login
ACOUSTID_API_KEY = os.getenv("ACOUSTID_API_KEY", "8XaBELgH")


# ── Cache MusicBrainz (2 min) ──────────────────────────────────────────────────
_mb_cache = {}
_MB_CACHE_TTL = 300  # 5 min

def _mb_cache_get(key: str) -> Optional[Dict[str, Any]]:
    """Get cached MusicBrainz result if still valid."""
    entry = _mb_cache.get(key)
    if entry and time.time() - entry[1] < _MB_CACHE_TTL:
        logger.debug(f"MB cache HIT for '{key}'")
        return entry[0]
    return None

def _mb_cache_set(key: str, value: Dict[str, Any]) -> None:
    """Cache MusicBrainz result with timestamp."""
    _mb_cache[key] = (value, time.time())
    logger.debug(f"MB cache SET for '{key}'")


# ── Cache Spotify (24h) ────────────────────────────────────────────────────────
_spotify_cache = {}
_SPOTIFY_CACHE_TTL = 86400  # 24h

def _spotify_cache_get(spotify_id: str) -> Optional[Dict[str, Any]]:
    """Get cached Spotify result if still valid."""
    entry = _spotify_cache.get(spotify_id)
    if entry and time.time() - entry[1] < _SPOTIFY_CACHE_TTL:
        logger.debug(f"Spotify cache HIT for '{spotify_id}'")
        return entry[0]
    return None

def _spotify_cache_set(spotify_id: str, value: Dict[str, Any]) -> None:
    """Cache Spotify result with timestamp."""
    _spotify_cache[spotify_id] = (value, time.time())
    logger.debug(f"Spotify cache SET for '{spotify_id}'")


# ── Cache AcoustID (7 days) ────────────────────────────────────────────────────
_acoustid_cache = {}
_ACOUSTID_CACHE_TTL = 604800  # 7 days

def _acoustid_cache_get(fingerprint_hash: str) -> Optional[Dict[str, Any]]:
    """Get cached AcoustID result if still valid."""
    entry = _acoustid_cache.get(fingerprint_hash)
    if entry and time.time() - entry[1] < _ACOUSTID_CACHE_TTL:
        logger.debug(f"AcoustID cache HIT for fingerprint '{fingerprint_hash}'")
        return entry[0]
    return None

def _acoustid_cache_set(fingerprint_hash: str, value: Dict[str, Any]) -> None:
    """Cache AcoustID result with timestamp."""
    _acoustid_cache[fingerprint_hash] = (value, time.time())
    logger.debug(f"AcoustID cache SET for fingerprint '{fingerprint_hash}'")


# ── Circuit Breaker ────────────────────────────────────────────────────────────
_circuit_breakers = {}  # service_name -> (fail_count, last_fail_time)
_CB_THRESHOLD = 3
_CB_TIMEOUT = 300  # 5 min

def _is_circuit_open(service: str) -> bool:
    """Check if circuit breaker is open for a service."""
    cb = _circuit_breakers.get(service)
    if not cb:
        return False
    fails, last_fail = cb
    if fails >= _CB_THRESHOLD and time.time() - last_fail < _CB_TIMEOUT:
        logger.warning(f"Circuit breaker OPEN for {service} (fails={fails})")
        return True
    if time.time() - last_fail >= _CB_TIMEOUT:
        _circuit_breakers.pop(service, None)
        logger.info(f"Circuit breaker RESET for {service}")
    return False

def _record_failure(service: str) -> None:
    """Record a failure for circuit breaker."""
    cb = _circuit_breakers.get(service, (0, 0))
    _circuit_breakers[service] = (cb[0] + 1, time.time())
    logger.debug(f"Circuit breaker FAILURE recorded for {service} (count={cb[0] + 1})")

def _record_success(service: str) -> None:
    """Record a success and reset failures for a service."""
    if service in _circuit_breakers:
        _circuit_breakers.pop(service, None)
        logger.debug(f"Circuit breaker RESET on success for {service}")


# ── Fingerprinting ─────────────────────────────────────────────────────────────

def fingerprint_file(file_path: str) -> Tuple[Optional[str], Optional[float]]:
    """Run fpcalc to generate an audio fingerprint. Returns (fingerprint, duration)."""
    try:
        result = subprocess.run(
            ["fpcalc", "-json", file_path],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return data.get("fingerprint"), data.get("duration")
        else:
            logger.warning(f"fpcalc returned {result.returncode}: {result.stderr}")
    except FileNotFoundError:
        logger.warning("fpcalc not found — install chromaprint-tools for audio fingerprinting")
    except subprocess.TimeoutExpired:
        logger.warning("fpcalc timed out")
    except Exception as e:
        logger.warning(f"Fingerprinting failed: {e}")
    return None, None


# ── AcoustID ───────────────────────────────────────────────────────────────────

def lookup_acoustid(fingerprint: str, duration: float) -> Optional[Dict[str, Any]]:
    """Identify the track via AcoustID. Returns best match dict or None."""
    # Check circuit breaker
    if _is_circuit_open("acoustid"):
        logger.debug("AcoustID circuit breaker OPEN — skipping")
        return None

    # Check cache by fingerprint hash
    import hashlib
    fp_hash = hashlib.md5(fingerprint.encode()).hexdigest()
    cached = _acoustid_cache_get(fp_hash)
    if cached is not None:
        return cached

    try:
        import acoustid  # type: ignore
        results = acoustid.lookup(
            ACOUSTID_API_KEY,
            fingerprint,
            int(duration),
            meta="recordings+releases+compress"
        )
        best_score = 0.0
        best: Optional[Dict[str, Any]] = None
        for score, recording_id, title, artist in acoustid.parse_lookup_result(results):
            if score > best_score:
                best_score = float(score)
                best = {
                    "recording_id": recording_id,
                    "title": title or "",
                    "artist": artist or "",
                    "score": best_score,
                }
        if best and best_score >= 0.3:   # seuil abaissé de 0.4 → 0.3
            logger.info(f"AcoustID match: {best['artist']} — {best['title']} (score={best_score:.2f})")
            _acoustid_cache_set(fp_hash, best)
            _record_success("acoustid")
            return best
        logger.info(f"AcoustID: no confident match (best score={best_score:.2f})")
        _record_success("acoustid")
    except ImportError:
        logger.warning("acoustid package not installed — pip install acoustid")
    except Exception as e:
        logger.warning(f"AcoustID lookup failed: {e}")
        _record_failure("acoustid")
    return None


# ── MusicBrainz ────────────────────────────────────────────────────────────────

def lookup_musicbrainz(recording_id: str) -> Optional[Dict[str, Any]]:
    """Fetch full metadata from MusicBrainz by recording ID."""
    # Check circuit breaker
    if _is_circuit_open("musicbrainz"):
        logger.debug("MusicBrainz circuit breaker OPEN — skipping")
        return None

    # Check cache by recording_id
    cached = _mb_cache_get(recording_id)
    if cached is not None:
        return cached

    try:
        import musicbrainzngs  # type: ignore
        musicbrainzngs.set_useragent("CueForge", "0.1", "https://github.com/kdumontm/cueforge-saas")
        result = musicbrainzngs.get_recording_by_id(
            recording_id,
            includes=["artists", "releases", "tags"]
        )
        rec = result.get("recording", {})

        # Artist name
        artist_credits = rec.get("artist-credit", [])
        artist_parts = []
        for a in artist_credits:
            if isinstance(a, dict) and "artist" in a:
                artist_parts.append(a["artist"].get("name", ""))
            elif isinstance(a, str):
                artist_parts.append(a)
        artist = "".join(artist_parts).strip()

        title = rec.get("title", "")

        # Release info
        releases = rec.get("release-list", [])
        album = releases[0].get("title", "") if releases else ""
        year_str = releases[0].get("date", "")[:4] if releases else ""
        year = int(year_str) if year_str and year_str.isdigit() else None

        # Label (from first release label-info-list)
        label = None
        if releases:
            label_info_list = releases[0].get("label-info-list", [])
            if label_info_list and isinstance(label_info_list[0], dict):
                label = label_info_list[0].get("label", {}).get("name")

        # Tags as genre
        tags = sorted(
            rec.get("tag-list", []),
            key=lambda t: -int(t.get("count", 0))
        )
        genre = ", ".join(t["name"].capitalize() for t in tags[:3]) if tags else ""

        logger.info(f"MusicBrainz: {artist} — {title} / {album} ({year}) [{label}]")
        result = {
            "artist": artist,
            "title": title,
            "album": album,
            "year": year,
            "genre": genre,
            "label": label,
            "musicbrainz_id": recording_id,
        }
        _mb_cache_set(recording_id, result)
        _record_success("musicbrainz")
        return result
    except ImportError:
        logger.warning("musicbrainzngs not installed — pip install musicbrainzngs")
    except Exception as e:
        logger.warning(f"MusicBrainz lookup failed: {e}")
        _record_failure("musicbrainz")
    return None


# ── MusicBrainz text search (fallback when no fingerprint) ────────────────────

def search_musicbrainz_by_text(query: str, limit: int = 5) -> Optional[Dict[str, Any]]:
    """
    Search MusicBrainz by free-text query (title, artist, or both).
    Falls back to HTTP API to avoid the musicbrainzngs rate limit complexity.
    Returns best match dict or None. Cached for 5 min.
    """
    # Check circuit breaker
    if _is_circuit_open("musicbrainz"):
        logger.debug("MusicBrainz circuit breaker OPEN — skipping text search")
        return None

    # Check cache by query string
    cache_key = f"mb_text:{query}:{limit}"
    cached = _mb_cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        import urllib.request
        import urllib.parse

        url = (
            "https://musicbrainz.org/ws/2/recording"
            f"?query={urllib.parse.quote(query)}&limit={limit}&fmt=json"
        )
        req = urllib.request.Request(url, headers={
            "User-Agent": "CueForge/0.1 (https://github.com/kdumontm/cueforge-saas)",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        recordings = data.get("recordings", [])
        if not recordings:
            logger.info(f"MusicBrainz text search: no results for '{query}'")
            return None

        best = recordings[0]
        score = int(best.get("score", 0))
        if score < 60:
            logger.info(f"MusicBrainz text search: best score {score} too low for '{query}'")
            return None

        # Extract artist
        artist_credits = best.get("artist-credit", [])
        artist_parts = []
        for a in artist_credits:
            if isinstance(a, dict) and "artist" in a:
                artist_parts.append(a["artist"].get("name", ""))
            elif isinstance(a, str):
                artist_parts.append(a)
        artist = "".join(artist_parts).strip()

        title = best.get("title", "")

        # Release info
        releases = best.get("releases", [])
        album = releases[0].get("title", "") if releases else ""
        year_str = (releases[0].get("date", "") or "")[:4] if releases else ""
        year = int(year_str) if year_str and year_str.isdigit() else None

        # Label (from first release label-info)
        label = None
        if releases:
            label_info = releases[0].get("label-info", [])
            if label_info and isinstance(label_info[0], dict):
                label = label_info[0].get("label", {}).get("name")

        # Tags/genres
        tags = sorted(best.get("tags", []), key=lambda t: -int(t.get("count", 0)))
        genre = ", ".join(t["name"].capitalize() for t in tags[:3]) if tags else ""

        recording_id = best.get("id")
        logger.info(f"MusicBrainz text: {artist} — {title} (score={score}, label={label})")
        result = {
            "artist": artist,
            "title": title,
            "album": album,
            "year": year,
            "genre": genre,
            "label": label,
            "musicbrainz_id": recording_id,
            "score": score / 100.0,
            "source": "musicbrainz_text",
        }
        _mb_cache_set(cache_key, result)
        _record_success("musicbrainz")
        return result

    except Exception as e:
        logger.warning(f"MusicBrainz text search failed: {e}")
        _record_failure("musicbrainz")
    return None


# ── Spotify ────────────────────────────────────────────────────────────────────

def search_spotify(artist: str, title: str) -> Optional[Dict[str, Any]]:
    """Search Spotify for the track. Returns artwork, genre, and IDs."""
    # Check circuit breaker
    if _is_circuit_open("spotify"):
        logger.debug("Spotify circuit breaker OPEN — skipping")
        return None

    client_id = os.getenv("SPOTIFY_CLIENT_ID", "")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        logger.debug("Spotify not configured — skipping")
        return None
    try:
        import spotipy  # type: ignore
        from spotipy.oauth2 import SpotifyClientCredentials
        sp = spotipy.Spotify(
            auth_manager=SpotifyClientCredentials(
                client_id=client_id,
                client_secret=client_secret,
            ),
            requests_timeout=10,
        )

        # Search for track
        query = f"track:{title} artist:{artist}"
        results = sp.search(q=query, type="track", limit=1)
        items = results.get("tracks", {}).get("items", [])
        if not items:
            logger.info(f"Spotify: no result for '{artist} — {title}'")
            _record_success("spotify")
            return None

        track = items[0]
        track_id = track["id"]

        # Check cache by spotify_id
        cached = _spotify_cache_get(track_id)
        if cached is not None:
            return cached

        # Artwork
        artwork_url = ""
        if track["album"]["images"]:
            artwork_url = track["album"]["images"][0]["url"]

        # ⚡ Parallelize: artist_data, audio_features, audio_analysis
        artist_id = track["artists"][0]["id"]
        spotify_bpm = None
        spotify_sections = None

        def _get_artist_data():
            try:
                return sp.artist(artist_id)
            except Exception as e:
                logger.debug(f"Spotify artist() failed: {e}")
                return {}

        def _get_audio_features():
            try:
                features = sp.audio_features([track_id])
                if features and features[0]:
                    bpm = round(features[0].get("tempo", 0), 1)
                    if bpm and bpm > 0:
                        logger.info(f"Spotify: BPM={bpm} for '{title}'")
                        return bpm
            except Exception as e:
                logger.debug(f"Spotify audio_features failed: {e}")
            return None

        def _get_audio_analysis():
            try:
                audio_analysis = sp.audio_analysis(track_id)
                if audio_analysis and audio_analysis.get("sections"):
                    sections = []
                    for s in audio_analysis["sections"]:
                        sections.append({
                            "start_ms": int(s.get("start", 0) * 1000),
                            "duration_ms": int(s.get("duration", 0) * 1000),
                            "confidence": round(s.get("confidence", 0), 2),
                            "loudness": round(s.get("loudness", 0), 1),
                            "tempo": round(s.get("tempo", 0), 1),
                        })
                    if sections:
                        logger.info(f"Spotify: {len(sections)} sections found")
                        return sections
            except Exception as e:
                logger.debug(f"Spotify audio_analysis failed: {e}")
            return None

        # Run in parallel with timeout
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_artist = executor.submit(_get_artist_data)
            future_features = executor.submit(_get_audio_features)
            future_analysis = executor.submit(_get_audio_analysis)

            try:
                artist_data = future_artist.result(timeout=10)
            except Exception as e:
                logger.debug(f"Spotify artist timeout: {e}")
                artist_data = {}

            try:
                spotify_bpm = future_features.result(timeout=10)
            except Exception as e:
                logger.debug(f"Spotify features timeout: {e}")
                spotify_bpm = None

            try:
                spotify_sections = future_analysis.result(timeout=10)
            except Exception as e:
                logger.debug(f"Spotify analysis timeout: {e}")
                spotify_sections = None

        genres = artist_data.get("genres", [])
        genre = ", ".join(g.title() for g in genres[:3])

        logger.info(f"Spotify: found {track['name']} by {track['artists'][0]['name']}, genres={genres[:3]}")
        result = {
            "spotify_id": track_id,
            "spotify_url": track["external_urls"].get("spotify", ""),
            "artwork_url": artwork_url,
            "genre": genre,
        }
        if spotify_bpm and spotify_bpm > 0:
            result["spotify_bpm"] = spotify_bpm
        if spotify_sections:
            result["spotify_sections"] = spotify_sections

        _spotify_cache_set(track_id, result)
        _record_success("spotify")
        return result
    except ImportError:
        logger.warning("spotipy not installed — pip install spotipy")
    except Exception as e:
        logger.warning(f"Spotify lookup failed: {e}")
        _record_failure("spotify")
    return None


# ── Discogs — excellent pour la musique électronique (labels, sous-genres) ────

DISCOGS_TOKEN = os.getenv("DISCOGS_TOKEN", "")


def search_discogs(artist: str, title: str) -> Optional[Dict[str, Any]]:
    """
    Search Discogs for a track. Free API (60 req/min with token).
    Excellent coverage for electronic music: labels indé, sous-genres précis,
    catalogue vinyl, etc.
    Returns dict with genre, style (sub-genre), label, year, artwork or None.
    """
    # Check circuit breaker
    if _is_circuit_open("discogs"):
        logger.debug("Discogs circuit breaker OPEN — skipping")
        return None

    if not DISCOGS_TOKEN:
        logger.debug("Discogs not configured — skipping (set DISCOGS_TOKEN)")
        return None
    try:
        import urllib.request
        import urllib.parse

        query = f"{artist} {title}".strip()
        if not query:
            return None

        url = (
            "https://api.discogs.com/database/search"
            f"?q={urllib.parse.quote(query)}&type=release&per_page=5"
            f"&token={DISCOGS_TOKEN}"
        )
        req = urllib.request.Request(url, headers={
            "User-Agent": "CueForge/0.1 +https://github.com/kdumontm/cueforge-saas",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        results = data.get("results", [])
        if not results:
            logger.info(f"Discogs: no result for '{query}'")
            return None

        # Pick the best result (first one, Discogs ranks by relevance)
        release = results[0]

        # Genre — Discogs distingue "genre" (large) et "style" (sous-genre précis)
        genres = release.get("genre", [])
        styles = release.get("style", [])
        # Prefer styles (more specific) for electronic music
        genre_str = ", ".join(styles[:3]) if styles else ", ".join(genres[:3])

        # Label
        labels = release.get("label", [])
        label = labels[0] if labels else None

        # Year
        year_str = str(release.get("year", ""))
        year = int(year_str) if year_str and year_str.isdigit() else None

        # Artwork (cover_image is high-res, thumb is small)
        artwork = release.get("cover_image", "") or release.get("thumb", "")

        # Title parsing — Discogs format is "Artist - Title"
        discogs_title = release.get("title", "")

        logger.info(
            f"Discogs: '{discogs_title}' — genre={genre_str}, "
            f"label={label}, year={year}"
        )
        result = {
            "genre": genre_str or None,
            "label": label,
            "year": year,
            "artwork_url": artwork or None,
            "discogs_id": str(release.get("id", "")),
            "discogs_url": f"https://www.discogs.com{release.get('resource_url', '').replace('https://api.discogs.com', '')}",
            "source": "discogs",
        }
        _record_success("discogs")
        return result
    except Exception as e:
        logger.warning(f"Discogs lookup failed: {e}")
        _record_failure("discogs")
    return None


# ── iTunes Search API (Apple Music) — gratuit, sans clé, excellent pour la musique FR ──

def search_itunes(artist: str, title: str) -> Optional[Dict[str, Any]]:
    """
    Search Apple iTunes/Music catalogue. Free, no API key required.
    Returns artwork (600x600), album, year, genre.
    Great coverage of French music.
    Skipped if artist + title are already known.
    """
    # Check circuit breaker
    if _is_circuit_open("itunes"):
        logger.debug("iTunes circuit breaker OPEN — skipping")
        return None

    try:
        import urllib.request
        import urllib.parse

        query = f"{artist} {title}".strip()
        url = (
            "https://itunes.apple.com/search"
            f"?term={urllib.parse.quote(query)}&media=music&entity=song&limit=5&lang=fr_FR"
        )
        req = urllib.request.Request(url, headers={
            "User-Agent": "CueForge/0.1 (https://github.com/kdumontm/cueforge-saas)",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        results = data.get("results", [])
        if not results:
            # Retry without artist if combined search failed
            url2 = (
                "https://itunes.apple.com/search"
                f"?term={urllib.parse.quote(title)}&media=music&entity=song&limit=5&lang=fr_FR"
            )
            req2 = urllib.request.Request(url2, headers={"User-Agent": "CueForge/0.1"})
            with urllib.request.urlopen(req2, timeout=10) as resp2:
                data2 = json.loads(resp2.read().decode("utf-8"))
            results = data2.get("results", [])

        if not results:
            logger.info(f"iTunes: no result for '{query}'")
            return None

        track = results[0]

        # Artwork — replace 100x100 with 600x600
        artwork = track.get("artworkUrl100", "")
        if artwork:
            artwork = artwork.replace("100x100bb", "600x600bb")

        genre = track.get("primaryGenreName", "")
        album = track.get("collectionName", "")
        year_str = (track.get("releaseDate") or "")[:4]
        year = int(year_str) if year_str and year_str.isdigit() else None
        found_artist = track.get("artistName", "")
        found_title = track.get("trackName", "")

        logger.info(f"iTunes: {found_artist} — {found_title} / {album} ({year}), genre={genre}")
        result = {
            "artwork_url": artwork or None,
            "genre": genre or None,
            "album": album or None,
            "year": year,
            "itunes_artist": found_artist,
            "itunes_title": found_title,
        }
        _record_success("itunes")
        return result
    except Exception as e:
        logger.warning(f"iTunes lookup failed: {e}")
        _record_failure("itunes")
    return None


# ── Last.fm ────────────────────────────────────────────────────────────────────

def get_lastfm_genre(artist: str, title: str) -> Optional[str]:
    """Get genre tags from Last.fm (great for electronic music)."""
    # Check circuit breaker
    if _is_circuit_open("lastfm"):
        logger.debug("Last.fm circuit breaker OPEN — skipping")
        return None

    api_key = os.getenv("LASTFM_API_KEY", "")
    if not api_key:
        logger.debug("Last.fm not configured — skipping")
        return None
    try:
        import pylast  # type: ignore
        network = pylast.LastFMNetwork(api_key=api_key)
        track_obj = network.get_track(artist, title)
        top_tags = track_obj.get_top_tags(limit=5)
        tags = [t.item.get_name() for t in top_tags if t.item]
        genre = ", ".join(t.capitalize() for t in tags[:3] if t)
        logger.info(f"Last.fm tags: {genre}")
        _record_success("lastfm")
        return genre or None
    except ImportError:
        logger.warning("pylast not installed — pip install pylast")
    except Exception as e:
        logger.warning(f"Last.fm lookup failed: {e}")
        _record_failure("lastfm")
    return None


# ── Main pipeline ──────────────────────────────────────────────────────────────

def _parse_artist_title_from_filename(file_path: str) -> tuple:
    """
    Extract artist and title from filename patterns like:
    - "Artist - Title.flac"
    - "01 Artist - Title.mp3"
    - "15 Typically Her - Kaytranada Edition.flac"
    Returns (artist_or_title, title_or_empty)
    """
    import re
    basename = os.path.splitext(os.path.basename(file_path))[0]
    # Remove leading track number
    basename = re.sub(r'^\d+[\s._-]+', '', basename).strip()
    # Try "Artist - Title" pattern
    if ' - ' in basename:
        parts = basename.split(' - ', 1)
        return parts[0].strip(), parts[1].strip()
    return basename.strip(), ""


def get_track_metadata(file_path: str) -> Dict[str, Any]:
    """
    Full metadata pipeline:
    1. fpcalc fingerprint → AcoustID → MusicBrainz
    2. Fallback: parse filename for artist/title
    3. Spotify artwork + genre + BPM
    4. iTunes / Last.fm genre fallback

    Returns a dict with any fields found. Never raises.
    """
    metadata: Dict[str, Any] = {}

    try:
        artist: str = ""
        title: str = ""

        # Step 1 — Fingerprint + AcoustID
        fingerprint, duration = fingerprint_file(file_path)
        acoustid_result = None
        if fingerprint and duration:
            acoustid_result = lookup_acoustid(fingerprint, duration)

        if acoustid_result:
            artist = acoustid_result.get("artist") or ""
            title = acoustid_result.get("title") or ""
            metadata["artist"] = artist
            metadata["title"] = title

            # Step 2b — MusicBrainz enrichment
            recording_id: Optional[str] = acoustid_result.get("recording_id")
            if recording_id:
                mb = lookup_musicbrainz(recording_id)
                if mb:
                    metadata.update({k: v for k, v in mb.items() if v})
                    artist = mb.get("artist") or artist
                    title = mb.get("title") or title

        # Step 2c — Fallback: parse filename if AcoustID didn't identify
        if not artist and not title:
            fn_artist, fn_title = _parse_artist_title_from_filename(file_path)
            if fn_title:
                artist = fn_artist
                title = fn_title
            else:
                # Single name — use as search query
                title = fn_artist
            logger.info(f"[META] Using filename fallback: artist='{artist}', title='{title}'")

        # ⚡ Steps 3-6 — Discogs/Spotify/iTunes/Last.fm EN PARALLÈLE
        #    Avant: ~30-50s séquentiel. Après: ~10-15s parallèle.
        if artist or title:
            futures = {}
            with ThreadPoolExecutor(max_workers=4) as executor:
                futures["discogs"] = executor.submit(search_discogs, artist, title)
                futures["spotify"] = executor.submit(search_spotify, artist, title)

                # Optimization 6: skip iTunes if metadata already complete (artist + title known)
                if artist and title:
                    futures["itunes"] = executor.submit(search_itunes, artist, title)
                else:
                    futures["itunes"] = None

                # Optimization 5: will skip Last.fm below if genre already known
                if artist and title:
                    futures["lastfm"] = executor.submit(get_lastfm_genre, artist, title)
                else:
                    futures["lastfm"] = None

            # Merge results with timeout (Optimization 7)
            try:
                discogs = futures["discogs"].result(timeout=10) if futures.get("discogs") else None
            except Exception as e:
                logger.debug(f"Discogs timeout/error: {e}")
                discogs = None

            try:
                sp = futures["spotify"].result(timeout=10) if futures.get("spotify") else None
            except Exception as e:
                logger.debug(f"Spotify timeout/error: {e}")
                sp = None

            try:
                it = futures["itunes"].result(timeout=10) if futures.get("itunes") else None
            except Exception as e:
                logger.debug(f"iTunes timeout/error: {e}")
                it = None

            # Optimization 5: skip Last.fm if genre already known
            lastfm_genre = None
            if not metadata.get("genre") and futures.get("lastfm"):
                try:
                    lastfm_genre = futures["lastfm"].result(timeout=10)
                except Exception as e:
                    logger.debug(f"Last.fm timeout/error: {e}")
                    lastfm_genre = None

            # Discogs (prioritaire pour l'électro: labels, sous-genres précis)
            if discogs:
                if not metadata.get("genre") and discogs.get("genre"):
                    metadata["genre"] = discogs["genre"]
                if not metadata.get("label") and discogs.get("label"):
                    metadata["label"] = discogs["label"]
                if not metadata.get("year") and discogs.get("year"):
                    metadata["year"] = discogs["year"]
                if not metadata.get("artwork_url") and discogs.get("artwork_url"):
                    metadata["artwork_url"] = discogs["artwork_url"]

            # Spotify
            if sp:
                if sp.get("artwork_url"):
                    metadata["artwork_url"] = sp["artwork_url"]
                if sp.get("spotify_id"):
                    metadata["spotify_id"] = sp["spotify_id"]
                if sp.get("spotify_url"):
                    metadata["spotify_url"] = sp["spotify_url"]
                if not metadata.get("genre") and sp.get("genre"):
                    metadata["genre"] = sp["genre"]
                if sp.get("spotify_bpm"):
                    metadata["spotify_bpm"] = sp["spotify_bpm"]
                if sp.get("spotify_sections"):
                    metadata["spotify_sections"] = sp["spotify_sections"]

            # iTunes fallback
            if it:
                if not metadata.get("artwork_url") and it.get("artwork_url"):
                    metadata["artwork_url"] = it["artwork_url"]
                if not metadata.get("genre") and it.get("genre"):
                    metadata["genre"] = it["genre"]
                if not metadata.get("album") and it.get("album"):
                    metadata["album"] = it["album"]
                if not metadata.get("year") and it.get("year"):
                    metadata["year"] = it["year"]

            # Last.fm genre fallback
            if lastfm_genre and not metadata.get("genre"):
                metadata["genre"] = lastfm_genre

    except Exception as e:
        logger.error(f"Unexpected error in metadata pipeline: {e}")

    return metadata

