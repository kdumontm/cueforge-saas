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
    Diagnostic complet du système CueForge.
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
