"""
Metadata service: fingerprint audio and look up track info from
AcoustID, MusicBrainz, Spotify, and Last.fm.

All lookups are optional — if a service fails or isn't configured,
the pipeline continues silently.
"""
import subprocess
import json
import os
import logging
from typing import Optional, Dict, Any, Tuple

logger = logging.getLogger(__name__)

# AcoustID test key — replace with your own from https://acoustid.org/login
ACOUSTID_API_KEY = os.getenv("ACOUSTID_API_KEY", "8XaBELgH")


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
            return best
        logger.info(f"AcoustID: no confident match (best score={best_score:.2f})")
    except ImportError:
        logger.warning("acoustid package not installed — pip install acoustid")
    except Exception as e:
        logger.warning(f"AcoustID lookup failed: {e}")
    return None


# ── MusicBrainz ────────────────────────────────────────────────────────────────

def lookup_musicbrainz(recording_id: str) -> Optional[Dict[str, Any]]:
    """Fetch full metadata from MusicBrainz by recording ID."""
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

        # Tags as genre
        tags = sorted(
            rec.get("tag-list", []),
            key=lambda t: -int(t.get("count", 0))
        )
        genre = ", ".join(t["name"].capitalize() for t in tags[:3]) if tags else ""

        logger.info(f"MusicBrainz: {artist} — {title} / {album} ({year})")
        return {
            "artist": artist,
            "title": title,
            "album": album,
            "year": year,
            "genre": genre,
            "musicbrainz_id": recording_id,
        }
    except ImportError:
        logger.warning("musicbrainzngs not installed — pip install musicbrainzngs")
    except Exception as e:
        logger.warning(f"MusicBrainz lookup failed: {e}")
    return None


# ── MusicBrainz text search (fallback when no fingerprint) ────────────────────

def search_musicbrainz_by_text(query: str, limit: int = 5) -> Optional[Dict[str, Any]]:
    """
    Search MusicBrainz by free-text query (title, artist, or both).
    Falls back to HTTP API to avoid the musicbrainzngs rate limit complexity.
    Returns best match dict or None.
    """
    try:
        import urllib.request
        import urllib.parse
        import time

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

        # Tags/genres
        tags = sorted(best.get("tags", []), key=lambda t: -int(t.get("count", 0)))
        genre = ", ".join(t["name"].capitalize() for t in tags[:3]) if tags else ""

        recording_id = best.get("id")
        logger.info(f"MusicBrainz text: {artist} — {title} (score={score}, id={recording_id})")
        return {
            "artist": artist,
            "title": title,
            "album": album,
            "year": year,
            "genre": genre,
            "musicbrainz_id": recording_id,
            "score": score / 100.0,
            "source": "musicbrainz_text",
        }

    except Exception as e:
        logger.warning(f"MusicBrainz text search failed: {e}")
    return None


# ── Spotify ────────────────────────────────────────────────────────────────────

def search_spotify(artist: str, title: str) -> Optional[Dict[str, Any]]:
    """Search Spotify for the track. Returns artwork, genre, and IDs."""
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
            return None

        track = items[0]
        track_id = track["id"]

        # Artwork
        artwork_url = ""
        if track["album"]["images"]:
            artwork_url = track["album"]["images"][0]["url"]

        # Artist genres
        artist_id = track["artists"][0]["id"]
        artist_data = sp.artist(artist_id)
        genres = artist_data.get("genres", [])
        genre = ", ".join(g.title() for g in genres[:3])

        logger.info(f"Spotify: found {track['name']} by {track['artists'][0]['name']}, genres={genres[:3]}")
        return {
            "spotify_id": track_id,
            "spotify_url": track["external_urls"].get("spotify", ""),
            "artwork_url": artwork_url,
            "genre": genre,
        }
    except ImportError:
        logger.warning("spotipy not installed — pip install spotipy")
    except Exception as e:
        logger.warning(f"Spotify lookup failed: {e}")
    return None


# ── iTunes Search API (Apple Music) — gratuit, sans clé, excellent pour la musique FR ──

def search_itunes(artist: str, title: str) -> Optional[Dict[str, Any]]:
    """
    Search Apple iTunes/Music catalogue. Free, no API key required.
    Returns artwork (600x600), album, year, genre.
    Great coverage of French music.
    """
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
        return {
            "artwork_url": artwork or None,
            "genre": genre or None,
            "album": album or None,
            "year": year,
            "itunes_artist": found_artist,
            "itunes_title": found_title,
        }
    except Exception as e:
        logger.warning(f"iTunes lookup failed: {e}")
    return None


# ── Last.fm ────────────────────────────────────────────────────────────────────

def get_lastfm_genre(artist: str, title: str) -> Optional[str]:
    """Get genre tags from Last.fm (great for electronic music)."""
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
        return genre or None
    except ImportError:
        logger.warning("pylast not installed — pip install pylast")
    except Exception as e:
        logger.warning(f"Last.fm lookup failed: {e}")
    return None


# ── Main pipeline ──────────────────────────────────────────────────────────────

def get_track_metadata(file_path: str) -> Dict[str, Any]:
    """
    Full metadata pipeline:
    1. fpcalc fingerprint
    2. AcoustID identification
    3. MusicBrainz enrichment
    4. Spotify artwork + genre
    5. Last.fm genre fallback

    Returns a dict with any fields found. Never raises.
    """
    metadata: Dict[str, Any] = {}

    try:
        # Step 1 — Fingerprint
        fingerprint, duration = fingerprint_file(file_path)
        if not fingerprint or not duration:
            return metadata

        # Step 2 — AcoustID
        acoustid_result = lookup_acoustid(fingerprint, duration)
        if not acoustid_result:
            return metadata

        artist: str = acoustid_result.get("artist") or ""
        title: str = acoustid_result.get("title") or ""
        metadata["artist"] = artist
        metadata["title"] = title

        # Step 3 — MusicBrainz
        recording_id: Optional[str] = acoustid_result.get("recording_id")
        if recording_id:
            mb = lookup_musicbrainz(recording_id)
            if mb:
                metadata.update({k: v for k, v in mb.items() if v})
                artist = mb.get("artist") or artist
                title = mb.get("title") or title

        # Step 4 — Spotify
        if artist and title:
            sp = search_spotify(artist, title)
            if sp:
                if sp.get("artwork_url"):
                    metadata["artwork_url"] = sp["artwork_url"]
                if sp.get("spotify_id"):
                    metadata["spotify_id"] = sp["spotify_id"]
                if sp.get("spotify_url"):
                    metadata["spotify_url"] = sp["spotify_url"]
                if not metadata.get("genre") and sp.get("genre"):
                    metadata["genre"] = sp["genre"]

        # Step 5 — iTunes fallback (artwork + genre, gratuit, sans clé, excellent pour FR)
        if artist and title and (not metadata.get("artwork_url") or not metadata.get("genre")):
            it = search_itunes(artist, title)
            if it:
                if not metadata.get("artwork_url") and it.get("artwork_url"):
                    metadata["artwork_url"] = it["artwork_url"]
                if not metadata.get("genre") and it.get("genre"):
                    metadata["genre"] = it["genre"]
                if not metadata.get("album") and it.get("album"):
                    metadata["album"] = it["album"]
                if not metadata.get("year") and it.get("year"):
                    metadata["year"] = it["year"]

        # Step 6 — Last.fm genre fallback
        if artist and title and not metadata.get("genre"):
            lastfm_genre = get_lastfm_genre(artist, title)
            if lastfm_genre:
                metadata["genre"] = lastfm_genre

    except Exception as e:
        logger.error(f"Unexpected error in metadata pipeline: {e}")

    return metadata

