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


@router.get("/stem-check/{track_id}")
async def check_stem_readiness(
    track_id: int,
    db: Session = Depends(get_db),
    current_user: "User" = Depends(_get_current_user),
):
    """
    Test endpoint: vérifie si les stems seraient activés pour une analyse
    en simulant exactement le même flux que _run_analysis Phase 1.
    """
    from app.models.track import Track
    from app.models.user import User as UserModel

    checks = {}

    # 1. Track exists?
    track = db.query(Track).filter(Track.id == track_id).first()
    checks["track_found"] = bool(track)
    checks["track_user_id"] = track.user_id if track else None

    # 2. User check (same code as _run_analysis)
    user_id = track.user_id if track else None
    checks["user_id"] = user_id

    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    checks["user_found"] = bool(user)
    checks["user_plan"] = getattr(user, 'subscription_plan', None) if user else None
    checks["use_stem_separation_raw"] = getattr(user, 'use_stem_separation', 'MISSING_ATTR') if user else None
    checks["use_stem_separation_bool"] = bool(getattr(user, 'use_stem_separation', False)) if user else False

    # 3. Would use_stems be True?
    use_stems = bool(user and getattr(user, 'use_stem_separation', False))
    checks["would_use_stems"] = use_stems

    # 4. Modal check
    try:
        from app.services.modal_stems import is_modal_available, MODAL_ENABLED, MODAL_STEMS_URL
        checks["modal_enabled"] = MODAL_ENABLED
        checks["modal_url_set"] = bool(MODAL_STEMS_URL)
        checks["modal_available"] = is_modal_available()
    except Exception as e:
        checks["modal_error"] = str(e)

    # 5. Demucs check
    try:
        import demucs
        checks["demucs_installed"] = True
        checks["demucs_version"] = getattr(demucs, '__version__', '?')
    except ImportError:
        checks["demucs_installed"] = False

    # 6. RAM check
    try:
        from app.services.stem_analysis import _check_available_memory_mb, MIN_FREE_RAM_MB
        free_mb = _check_available_memory_mb()
        checks["ram_free_mb"] = round(free_mb)
        checks["ram_min_required_mb"] = MIN_FREE_RAM_MB
        checks["ram_sufficient"] = free_mb >= MIN_FREE_RAM_MB
    except Exception as e:
        checks["ram_check_error"] = str(e)

    return checks
