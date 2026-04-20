"""
Diagnostic endpoint — /api/v1/diagnostics

Donne une vue complète de l'état du système en un seul appel.
Protégé par DIAGNOSTICS_KEY (env var).  Si non défini → 403.

Usage :
  curl -H "X-Diagnostics-Key: <clé>" https://<app>.railway.app/api/v1/diagnostics | python3 -m json.tool
"""

import os
import sys
import time
import shutil
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user as _get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Auth ─────────────────────────────────────────────────────────────────────

def _require_key(x_diagnostics_key: str = Header(default="")):
    expected = os.getenv("DIAGNOSTICS_KEY", "")
    if not expected:
        raise HTTPException(status_code=403, detail="DIAGNOSTICS_KEY non configuré sur le serveur")
    if x_diagnostics_key != expected:
        raise HTTPException(status_code=403, detail="Clé invalide")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _check(name: str, fn) -> Dict[str, Any]:
    """Run fn(), return {name, ok, detail, duration_ms}."""
    t0 = time.perf_counter()
    try:
        detail = fn()
        return {"name": name, "ok": True, "detail": detail, "ms": round((time.perf_counter() - t0) * 1000)}
    except Exception as e:
        return {"name": name, "ok": False, "detail": str(e), "ms": round((time.perf_counter() - t0) * 1000)}


# ── Individual checks ─────────────────────────────────────────────────────────

def check_database(db: Session) -> Dict[str, Any]:
    from app.models.track import Track
    from app.models.user import User
    tracks = db.query(Track).count()
    users  = db.query(User).count()
    return {"tracks": tracks, "users": users}


def check_env_vars() -> Dict[str, Any]:
    vars_to_check = {
        "DATABASE_URL":        bool(os.getenv("DATABASE_URL")),
        "SECRET_KEY":          bool(os.getenv("SECRET_KEY")),
        "ACOUSTID_API_KEY":    bool(os.getenv("ACOUSTID_API_KEY")),
        "SPOTIFY_CLIENT_ID":   bool(os.getenv("SPOTIFY_CLIENT_ID")),
        "SPOTIFY_CLIENT_SECRET": bool(os.getenv("SPOTIFY_CLIENT_SECRET")),
        "LASTFM_API_KEY":      bool(os.getenv("LASTFM_API_KEY")),
        "ADMIN_PASSWORD":      bool(os.getenv("ADMIN_PASSWORD")),
        "DIAGNOSTICS_KEY":     bool(os.getenv("DIAGNOSTICS_KEY")),
        "UPLOAD_DIR":          os.getenv("UPLOAD_DIR", "(non défini → défaut)"),
        "MAX_FILE_SIZE_MB":    os.getenv("MAX_FILE_SIZE_MB", "200"),
    }
    missing = [k for k, v in vars_to_check.items() if v is False]
    return {"vars": vars_to_check, "missing_required": missing}


def check_fpcalc() -> Dict[str, Any]:
    path = shutil.which("fpcalc")
    if not path:
        raise RuntimeError("fpcalc introuvable dans le PATH — fingerprinting désactivé")
    import subprocess
    r = subprocess.run(["fpcalc", "-version"], capture_output=True, text=True, timeout=5)
    return {"path": path, "version": (r.stdout or r.stderr).strip()}


def check_musicbrainz() -> Dict[str, Any]:
    from app.services.metadata_service import search_musicbrainz_by_text
    result = search_musicbrainz_by_text("Les Demons de Minuit Images", limit=1)
    if not result:
        raise RuntimeError("Aucun résultat retourné")
    return {"artist": result.get("artist"), "title": result.get("title"), "score": result.get("score")}


def check_itunes() -> Dict[str, Any]:
    from app.services.metadata_service import search_itunes
    result = search_itunes("Images", "Les Demons de Minuit")
    if not result:
        raise RuntimeError("Aucun résultat retourné")
    return {"genre": result.get("genre"), "artwork": bool(result.get("artwork_url"))}


def check_spotify() -> Dict[str, Any]:
    if not os.getenv("SPOTIFY_CLIENT_ID"):
        raise RuntimeError("SPOTIFY_CLIENT_ID non défini — désactivé")
    from app.services.metadata_service import search_spotify
    result = search_spotify("Images", "Les Demons de Minuit")
    if not result:
        raise RuntimeError("Aucun résultat retourné")
    return {"spotify_id": result.get("spotify_id"), "artwork": bool(result.get("artwork_url"))}


def check_storage() -> Dict[str, Any]:
    upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
    exists     = os.path.isdir(upload_dir)
    writable   = os.access(upload_dir, os.W_OK) if exists else False
    files      = len(os.listdir(upload_dir)) if exists else 0
    # disk usage
    usage = shutil.disk_usage(upload_dir) if exists else None
    free_gb = round(usage.free / 1e9, 2) if usage else None
    return {
        "upload_dir": upload_dir,
        "exists":     exists,
        "writable":   writable,
        "file_count": files,
        "free_gb":    free_gb,
    }


def check_python() -> Dict[str, Any]:
    import platform
    return {
        "version":  sys.version,
        "platform": platform.platform(),
        "packages": {
            "fastapi":       _pkg_version("fastapi"),
            "sqlalchemy":    _pkg_version("sqlalchemy"),
            "musicbrainzngs": _pkg_version("musicbrainzngs"),
            "pyacoustid":    _pkg_version("acoustid"),
        }
    }


def _pkg_version(name: str) -> str:
    try:
        import importlib.metadata
        return importlib.metadata.version(name)
    except Exception:
        return "non installé"


# ── Main endpoint ─────────────────────────────────────────────────────────────

@router.get("/diagnostics")
def run_diagnostics(
    db:  Session = Depends(get_db),
    _:   None    = Depends(_require_key),
):
    """
    Diagnostic complet du système TrackCue.
    Nécessite l'en-tête : X-Diagnostics-Key: <DIAGNOSTICS_KEY>
    """
    t0 = time.perf_counter()

    checks = [
        _check("database",      lambda: check_database(db)),
        _check("env_vars",      check_env_vars),
        _check("fpcalc",        check_fpcalc),
        _check("musicbrainz",   check_musicbrainz),
        _check("itunes",        check_itunes),
        _check("spotify",       check_spotify),
        _check("storage",       check_storage),
        _check("python",        check_python),
    ]

    all_ok  = all(c["ok"] for c in checks)
    failing = [c["name"] for c in checks if not c["ok"]]

    return JSONResponse({
        "status":       "ok" if all_ok else "degraded",
        "total_ms":     round((time.perf_counter() - t0) * 1000),
        "failing":      failing,
        "checks":       {c["name"]: {"ok": c["ok"], "detail": c["detail"], "ms": c["ms"]} for c in checks},
    })


@router.get("/diagnostics/perf/recent")
def recent_perf_breakdowns(
    limit: int = 20,
    _: None = Depends(_require_key),
):
    """
    Retourne les N dernières analyses avec leur breakdown PERF.
    Protégé par X-Diagnostics-Key. Lit la liste Redis capped maintenue
    par _PerfTracker.log_summary.

    Query: /api/v1/diagnostics/perf/recent?limit=20
    """
    import json
    try:
        from app.services.cache_service import get_redis_client
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"cache unavailable: {e}")

    r = get_redis_client()
    if not r:
        return JSONResponse({
            "backend": "memory",
            "items": [],
            "note": "Redis non connecté — perf n'est pas persistée en mémoire ici",
        })

    limit = max(1, min(100, limit))
    try:
        raw = r.lrange("trackcue:analysis_perf_recent", 0, limit - 1)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"redis read failed: {e}")

    items = []
    for s in raw:
        try:
            items.append(json.loads(s))
        except Exception:
            continue

    # Agrégat : moyenne par phase sur les items collectés
    agg = {}
    for it in items:
        for k, v in (it.get("breakdown") or {}).items():
            agg.setdefault(k, []).append(v)
    summary = {
        k: {
            "avg_ms": round(sum(vs) / len(vs)),
            "min_ms": min(vs),
            "max_ms": max(vs),
            "p50_ms": sorted(vs)[len(vs) // 2],
            "count": len(vs),
        }
        for k, vs in agg.items()
    }
    total_values = [it.get("total_ms", 0) for it in items]
    return JSONResponse({
        "backend": "redis",
        "n_items": len(items),
        "total_ms_stats": {
            "avg": round(sum(total_values) / max(1, len(total_values))),
            "min": min(total_values) if total_values else 0,
            "max": max(total_values) if total_values else 0,
            "p50": sorted(total_values)[len(total_values) // 2] if total_values else 0,
        },
        "phase_stats": summary,
        "items": items,
    })


@router.get("/diagnostics/perf/{track_id}")
def perf_for_track(
    track_id: int,
    _: None = Depends(_require_key),
):
    """Retourne le breakdown PERF d'un track donné (lu depuis Redis)."""
    try:
        from app.services.cache_service import cache_get
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"cache unavailable: {e}")
    data = cache_get("analysis_perf", str(track_id))
    if not data:
        raise HTTPException(status_code=404, detail="No perf data for this track")
    return data


@router.put("/self-upgrade")
async def self_upgrade(
    plan: str = "pro",
    stems: bool = False,
    db: Session = Depends(get_db),
    current_user: "User" = Depends(_get_current_user),
):
    """
    Endpoint diagnostic : un user authentifié peut upgrader son propre plan.
    Protégé par JWT — temporaire, pour les tests stems uniquement.
    """
    current_user.subscription_plan = plan
    current_user.use_stem_separation = stems
    db.commit()
    db.refresh(current_user)
    return {
        "id": current_user.id,
        "name": current_user.name,
        "plan": current_user.subscription_plan,
        "use_stem_separation": current_user.use_stem_separation,
    }


    # Note: endpoints stem-check et test-stems supprimés après validation des stems (16 avril 2026)


@router.post("/diagnostics/seed-mashup-tracks")
async def seed_mashup_tracks(
    db: Session = Depends(get_db),
    current_user: "User" = Depends(_get_current_user),
    _: None = Depends(_require_key),
):
    """
    Seed 3 fake tracks (sans fichier audio) pour le user authentifié,
    avec BPM/Camelot compatibles pour exercer le flow Mashup Studio.

    Idempotent : si des tracks portant le préfixe "QA-Mashup-" existent
    déjà pour ce user, retourne ceux-là sans en recréer.

    Protégé par X-Diagnostics-Key + JWT.
    """
    from app.models.track import Track, TrackStatus, TrackAnalysis

    existing = (
        db.query(Track)
        .filter(Track.user_id == current_user.id)
        .filter(Track.title.like("QA-Mashup-%"))
        .all()
    )
    if existing:
        return {
            "created": False,
            "tracks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "bpm": t.analysis.bpm if t.analysis else None,
                    "camelot_code": t.camelot_code,
                    "energy_level": t.energy_level,
                }
                for t in existing
            ],
        }

    # bpm + key vivent sur TrackAnalysis ; camelot_code + energy_level sont
    # dénormalisés sur Track (matche le pattern existant du code mashup).
    fixtures = [
        {"title": "QA-Mashup-A", "artist": "QA Bot",  "bpm": 124.0, "key": "Am", "camelot_code": "8A", "energy_level": 7},
        {"title": "QA-Mashup-B", "artist": "QA Bot",  "bpm": 126.0, "key": "Em", "camelot_code": "9A", "energy_level": 8},
        {"title": "QA-Mashup-C", "artist": "QA Bot",  "bpm": 124.5, "key": "C",  "camelot_code": "8B", "energy_level": 7},
    ]

    created = []
    for f in fixtures:
        t = Track(
            user_id=current_user.id,
            filename=f"qa_seed_{f['title'].lower()}.mp3",
            original_filename=f["title"] + ".mp3",
            file_path=None,
            file_size=0,
            status=TrackStatus.completed,
            title=f["title"],
            artist=f["artist"],
            camelot_code=f["camelot_code"],
            energy_level=f["energy_level"],
        )
        db.add(t)
        db.flush()  # obtenir t.id pour la FK de TrackAnalysis
        analysis = TrackAnalysis(
            track_id=t.id,
            bpm=f["bpm"],
            key=f["key"],
        )
        db.add(analysis)
        created.append((t, analysis))

    db.commit()
    for t, a in created:
        db.refresh(t)
        db.refresh(a)

    return {
        "created": True,
        "tracks": [
            {
                "id": t.id,
                "title": t.title,
                "bpm": a.bpm,
                "key": a.key,
                "camelot_code": t.camelot_code,
                "energy_level": t.energy_level,
            }
            for t, a in created
        ],
    }


@router.delete("/diagnostics/seed-mashup-tracks")
async def cleanup_mashup_tracks(
    db: Session = Depends(get_db),
    current_user: "User" = Depends(_get_current_user),
    _: None = Depends(_require_key),
):
    """Supprime les tracks de seed QA-Mashup-* du user authentifié."""
    from app.models.track import Track

    q = (
        db.query(Track)
        .filter(Track.user_id == current_user.id)
        .filter(Track.title.like("QA-Mashup-%"))
    )
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}
