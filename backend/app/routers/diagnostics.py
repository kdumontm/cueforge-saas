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
from typing import Any, Dict, Optional

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
        # Cloudflare R2
        "R2_ACCOUNT_ID":       bool(os.getenv("R2_ACCOUNT_ID")),
        "R2_ACCESS_KEY_ID":    bool(os.getenv("R2_ACCESS_KEY_ID")),
        "R2_SECRET_ACCESS_KEY": bool(os.getenv("R2_SECRET_ACCESS_KEY")),
        "R2_BUCKET":           bool(os.getenv("R2_BUCKET")),
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


@router.get("/diagnostics/deploy-marker")
async def deploy_marker(_: None = Depends(_require_key)):
    """Petit marker pour vérifier que le dernier deploy est en prod."""
    return {"marker": "v3-seed-traceback", "ok": True}


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
    import traceback
    # MARKER v3 — pour vérifier que le nouveau code est bien déployé
    try:
        from app.models.track import Track, TrackStatus, TrackAnalysis
    except Exception as e:
        return {"error": "import failed", "detail": str(e), "traceback": traceback.format_exc()}
    # Tout le body de cette fonction est désormais emballé dans un try global
    # pour capturer n'importe quelle erreur en response JSON plutôt qu'en 500.

    try:
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
    except Exception as e:
        db.rollback()
        return {"error": "query existing failed", "detail": str(e), "traceback": traceback.format_exc()}

    # bpm + key vivent sur TrackAnalysis ; camelot_code + energy_level sont
    # dénormalisés sur Track (matche le pattern existant du code mashup).
    fixtures = [
        {"title": "QA-Mashup-A", "artist": "QA Bot",  "bpm": 124.0, "key": "Am", "camelot_code": "8A", "energy_level": 7},
        {"title": "QA-Mashup-B", "artist": "QA Bot",  "bpm": 126.0, "key": "Em", "camelot_code": "9A", "energy_level": 8},
        {"title": "QA-Mashup-C", "artist": "QA Bot",  "bpm": 124.5, "key": "C",  "camelot_code": "8B", "energy_level": 7},
    ]

    try:
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
    except Exception as e:
        db.rollback()
        return {"error": "insert failed", "detail": str(e), "traceback": traceback.format_exc()}

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
    import traceback
    try:
        from app.models.track import Track
        # Load puis delete via session pour honorer les cascade ORM
        # (TrackAnalysis, CuePoint, etc.).
        tracks = (
            db.query(Track)
            .filter(Track.user_id == current_user.id)
            .filter(Track.title.like("QA-Mashup-%"))
            .all()
        )
        count = len(tracks)
        for t in tracks:
            db.delete(t)
        db.commit()
        return {"deleted": count}
    except Exception as e:
        db.rollback()
        return {"error": "cleanup failed", "detail": str(e), "traceback": traceback.format_exc()}


# ── Audit storage : qui occupe l'espace disque ? ─────────────────────────────

@router.get("/diagnostics/storage-audit")
async def storage_audit(
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Croise les fichiers présents sur disque avec les Track.file_path en DB.

    Retourne :
    - file_count / db_count : totaux
    - orphan_files : fichiers sur disque sans aucune ligne DB qui les référence
    - missing_files : tracks avec file_path qui n'existent plus sur disque
    - tracks_without_path : tracks avec file_path NULL ou vide
    - top_files : 10 plus gros fichiers du dossier uploads
    - total_disk_bytes : somme des tailles sur disque
    """
    import traceback
    try:
        from app.models.track import Track

        upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
        if not os.path.isdir(upload_dir):
            return {"error": "upload_dir introuvable", "upload_dir": upload_dir}

        # 1) Inventaire disque (fichier → taille)
        disk_files: Dict[str, int] = {}
        for name in os.listdir(upload_dir):
            full = os.path.join(upload_dir, name)
            if os.path.isfile(full):
                try:
                    disk_files[name] = os.path.getsize(full)
                except OSError:
                    disk_files[name] = 0

        # 2) Inventaire DB (track_id, user_id, title, file_path)
        db_rows = db.query(
            Track.id, Track.user_id, Track.title, Track.file_path, Track.file_size
        ).all()

        # Indexer les paths référencés en DB par basename ET full path
        db_basenames = set()
        db_paths = set()
        tracks_without_path = []
        for tid, uid, title, fpath, fsize in db_rows:
            if not fpath:
                tracks_without_path.append({
                    "id": tid, "user_id": uid, "title": title, "file_size": fsize,
                })
                continue
            db_paths.add(fpath)
            db_basenames.add(os.path.basename(fpath))

        # 3) Orphelins : fichiers présents sur disque mais pas référencés
        orphans = []
        for name, size in disk_files.items():
            if name not in db_basenames:
                orphans.append({"filename": name, "size_bytes": size})
        orphans.sort(key=lambda x: x["size_bytes"], reverse=True)

        # 4) Manquants : tracks dont le fichier n'est plus sur disque
        missing = []
        for tid, uid, title, fpath, fsize in db_rows:
            if not fpath:
                continue
            base = os.path.basename(fpath)
            if base not in disk_files:
                # Vérifie aussi le path absolu au cas où il pointerait ailleurs
                if not os.path.exists(fpath):
                    missing.append({
                        "id": tid, "user_id": uid, "title": title,
                        "file_path": fpath, "expected_size": fsize,
                    })

        # 5) Top fichiers par taille
        top_files = sorted(
            [{"filename": n, "size_bytes": s} for n, s in disk_files.items()],
            key=lambda x: x["size_bytes"], reverse=True,
        )[:10]

        total_bytes = sum(disk_files.values())
        orphan_bytes = sum(o["size_bytes"] for o in orphans)

        return {
            "upload_dir": upload_dir,
            "file_count": len(disk_files),
            "db_track_count": len(db_rows),
            "tracks_without_path": {
                "count": len(tracks_without_path),
                "items": tracks_without_path[:20],
            },
            "orphan_files": {
                "count": len(orphans),
                "total_bytes": orphan_bytes,
                "total_mb": round(orphan_bytes / 1e6, 2),
                "items": orphans[:50],
            },
            "missing_files": {
                "count": len(missing),
                "items": missing[:20],
            },
            "top_files": top_files,
            "total_disk_bytes": total_bytes,
            "total_disk_mb": round(total_bytes / 1e6, 2),
        }
    except Exception as e:
        return {"error": "storage_audit failed", "detail": str(e), "traceback": traceback.format_exc()}


# ── Cloudflare R2 : healthcheck, migration, purge locale ────────────────────

@router.get("/diagnostics/storage-coverage")
async def storage_coverage(
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Audite TOUS les tracks : combien ont leur audio accessible (local ou R2), combien sont 404.
    """
    import traceback
    try:
        from app.models.track import Track
        from app.services import r2_service, storage as storage_svc

        r2_keys_live = set()
        if r2_service.enabled():
            for obj in r2_service.list_objects():
                r2_keys_live.add(obj.get("Key"))

        tracks = db.query(Track).all()
        ok_local = 0
        ok_r2 = 0
        broken = []
        for t in tracks:
            local = False
            if t.file_path:
                safe = storage_svc.safe_path(t.file_path)
                if safe and os.path.exists(safe):
                    local = True
            r2_hit = bool(getattr(t, "r2_key", None) and t.r2_key in r2_keys_live)
            if local:
                ok_local += 1
            elif r2_hit:
                ok_r2 += 1
            else:
                broken.append({
                    "id": t.id,
                    "user_id": t.user_id,
                    "title": t.title,
                    "original_filename": getattr(t, "original_filename", None),
                    "file_path": t.file_path,
                    "r2_key": getattr(t, "r2_key", None),
                    "status": str(t.status) if t.status else None,
                })

        return {
            "total": len(tracks),
            "ok_local_only": ok_local,
            "ok_r2": ok_r2,
            "broken_count": len(broken),
            "broken": broken[:100],
            "r2_objects_total": len(r2_keys_live),
        }
    except Exception as e:
        return {"error": "storage_coverage failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.get("/diagnostics/track-storage/{track_id}")
async def track_storage_inspect(
    track_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Inspecte l'état brut de stockage d'une track : file_path, r2_key, existence locale/R2.
    Utile pour diagnostiquer les 404 sur /tracks/{id}/audio.
    """
    import traceback
    try:
        from app.models.track import Track
        from app.services import r2_service, storage as storage_svc

        t = db.query(Track).filter(Track.id == track_id).first()
        if not t:
            return {"error": f"track {track_id} not found"}

        out = {
            "id": t.id,
            "user_id": t.user_id,
            "title": t.title,
            "original_filename": getattr(t, "original_filename", None),
            "status": str(t.status) if t.status is not None else None,
            "file_path": t.file_path,
            "r2_key": getattr(t, "r2_key", None),
            "file_size_db": getattr(t, "file_size", None),
        }

        # Local file check
        local_exists = False
        local_size = None
        if t.file_path:
            safe = storage_svc.safe_path(t.file_path) if t.file_path else None
            out["safe_path"] = safe
            if safe and os.path.exists(safe):
                local_exists = True
                try:
                    local_size = os.path.getsize(safe)
                except OSError:
                    local_size = None
        out["local_exists"] = local_exists
        out["local_size_bytes"] = local_size

        # Cache path (où R2 download atterrit)
        upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
        if getattr(t, "r2_key", None):
            cache_path = os.path.join(upload_dir, t.r2_key)
            out["r2_cache_path"] = cache_path
            out["r2_cache_exists"] = os.path.exists(cache_path)

        # R2 object existence
        r2_found = None
        r2_size = None
        if r2_service.enabled() and getattr(t, "r2_key", None):
            try:
                r2_found = r2_service.object_exists(t.r2_key)
                if r2_found:
                    for obj in r2_service.list_objects():
                        if obj.get("Key") == t.r2_key:
                            r2_size = obj.get("Size")
                            break
            except Exception as e:
                out["r2_lookup_error"] = str(e)
        out["r2_exists"] = r2_found
        out["r2_size_bytes"] = r2_size

        # Candidats R2 par basename
        if not r2_found and t.file_path:
            basename = os.path.basename(t.file_path)
            out["basename"] = basename
            if r2_service.enabled():
                matches = []
                for obj in r2_service.list_objects():
                    k = obj.get("Key", "")
                    if basename and basename in k:
                        matches.append({"key": k, "size": obj.get("Size")})
                out["r2_basename_matches"] = matches[:5]

        return out
    except Exception as e:
        return {"error": "track_storage_inspect failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.post("/diagnostics/heal-track-storage")
async def heal_track_storage(
    track_id: Optional[int] = None,
    confirm: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Répare les tracks dont r2_key est null mais dont le basename du file_path existe
    dans R2 (cas classique post-migration ou post-bug d'upload).

    - track_id=None → scan toutes les tracks cassées
    - track_id=N → fix seulement cette track
    - confirm=false → dry run
    """
    import traceback
    try:
        from app.models.track import Track
        from app.services import r2_service

        if not r2_service.enabled():
            return {"error": "R2 non configuré"}

        # Liste les objets R2 pour matching
        r2_objects = {obj.get("Key"): obj.get("Size") for obj in r2_service.list_objects()}

        q = db.query(Track).filter(Track.r2_key.is_(None))
        if track_id is not None:
            q = q.filter(Track.id == track_id)
        broken = q.all()

        plan = []
        fixed = 0
        for t in broken:
            if not t.file_path:
                plan.append({"id": t.id, "skip": "file_path null", "title": t.title})
                continue
            basename = os.path.basename(t.file_path)
            # Essayer direct basename, puis avec préfixes
            candidate_keys = [basename]
            # Aussi chercher si un objet R2 contient le basename
            for k in r2_objects.keys():
                if basename in k and k not in candidate_keys:
                    candidate_keys.append(k)

            matched_key = None
            for ck in candidate_keys:
                if ck in r2_objects:
                    matched_key = ck
                    break

            if not matched_key:
                plan.append({"id": t.id, "skip": "no R2 match", "basename": basename, "title": t.title})
                continue

            if confirm:
                t.r2_key = matched_key
                db.commit()
                fixed += 1
                plan.append({"id": t.id, "fixed": True, "r2_key": matched_key})
            else:
                plan.append({"id": t.id, "would_set_r2_key": matched_key, "title": t.title})

        return {
            "dry_run": not confirm,
            "scanned": len(broken),
            "fixed": fixed if confirm else 0,
            "plan": plan[:50],
        }
    except Exception as e:
        db.rollback()
        return {"error": "heal_track_storage failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.get("/diagnostics/r2-status")
async def r2_status(_: None = Depends(_require_key)):
    """Vérifie l'état de la connexion R2 + stats du bucket."""
    import traceback
    try:
        from app.services import r2_service
        info = r2_service.healthcheck()
        if not info.get("enabled"):
            return info

        # Compte les objets et leur taille totale
        count = 0
        total_bytes = 0
        for obj in r2_service.list_objects():
            count += 1
            total_bytes += obj.get("Size", 0)
        info["object_count"] = count
        info["total_mb"] = round(total_bytes / 1e6, 2)
        return info
    except Exception as e:
        return {"error": "r2_status failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.post("/diagnostics/r2-migrate")
async def r2_migrate(
    dry_run: bool = True,
    purge_local: bool = False,
    limit: int = 500,
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Upload tous les tracks locaux manquants sur R2.

    Itère sur les Track qui ont un file_path valide sur disque mais pas
    de r2_key. Upload vers R2, set r2_key, et si purge_local=true supprime
    le fichier local après upload réussi.

    dry_run=True par défaut → retourne ce qui serait fait sans toucher.
    """
    import traceback
    try:
        from app.services import r2_service
        from app.models.track import Track

        if not r2_service.enabled():
            return {"error": "R2 non configuré — env vars R2_* manquantes"}

        # Tracks candidats : file_path set, r2_key null
        candidates = (
            db.query(Track)
            .filter(Track.file_path.isnot(None))
            .filter(Track.r2_key.is_(None))
            .limit(limit)
            .all()
        )

        plan = []
        uploaded = 0
        purged = 0
        freed_bytes = 0
        errors = []

        for t in candidates:
            local = t.file_path
            if not local or not os.path.exists(local):
                plan.append({"id": t.id, "skip": "fichier local manquant", "file_path": local})
                continue

            key = os.path.basename(local)
            size = os.path.getsize(local)

            if dry_run:
                plan.append({"id": t.id, "would_upload_key": key, "size_bytes": size})
                continue

            # Upload réel
            try:
                r2_service.upload_file(local, key)
                t.r2_key = key
                db.commit()
                uploaded += 1

                if purge_local:
                    try:
                        os.remove(local)
                        purged += 1
                        freed_bytes += size
                    except OSError as e:
                        errors.append({"id": t.id, "step": "purge", "error": str(e)})
            except Exception as e:
                db.rollback()
                errors.append({"id": t.id, "step": "upload", "error": str(e)})

        result = {
            "dry_run": dry_run,
            "purge_local": purge_local,
            "candidates": len(candidates),
            "uploaded": uploaded,
            "purged": purged,
            "freed_mb": round(freed_bytes / 1e6, 2),
            "errors": errors[:20],
        }
        if dry_run:
            result["plan_preview"] = plan[:20]
        return result
    except Exception as e:
        return {"error": "r2_migrate failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.delete("/diagnostics/r2-purge-local")
async def r2_purge_local(
    confirm: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Supprime les fichiers locaux des tracks qui ont un r2_key set
    (donc le fichier est déjà safely sur R2). Libère /app/uploads.

    Dry-run par défaut. Passer ?confirm=true pour exécuter.
    """
    import traceback
    try:
        from app.services import r2_service
        from app.models.track import Track

        if not r2_service.enabled():
            return {"error": "R2 non configuré"}

        # Tracks avec r2_key + file_path local qui existe sur disque
        tracks = (
            db.query(Track)
            .filter(Track.r2_key.isnot(None))
            .filter(Track.file_path.isnot(None))
            .all()
        )

        to_purge = []
        for t in tracks:
            if t.file_path and os.path.exists(t.file_path):
                try:
                    size = os.path.getsize(t.file_path)
                except OSError:
                    size = 0
                to_purge.append({"id": t.id, "path": t.file_path, "size_bytes": size})

        total_bytes = sum(x["size_bytes"] for x in to_purge)

        if not confirm:
            return {
                "dry_run": True,
                "would_purge": len(to_purge),
                "would_free_mb": round(total_bytes / 1e6, 2),
                "items": to_purge[:20],
                "next_step": "Ajouter ?confirm=true pour exécuter",
            }

        purged = 0
        freed = 0
        errors = []
        for item in to_purge:
            try:
                os.remove(item["path"])
                purged += 1
                freed += item["size_bytes"]
            except OSError as e:
                errors.append({"id": item["id"], "error": str(e)})

        return {
            "dry_run": False,
            "purged": purged,
            "freed_mb": round(freed / 1e6, 2),
            "errors": errors,
        }
    except Exception as e:
        return {"error": "r2_purge_local failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.post("/diagnostics/r2-add-column")
async def r2_add_column(_: None = Depends(_require_key), db: Session = Depends(get_db)):
    """
    One-shot : ajoute la colonne tracks.r2_key si elle n'existe pas encore.
    Utile parce qu'on n'a pas Alembic — Base.metadata.create_all ne modifie
    pas les tables existantes.
    """
    from sqlalchemy import text
    try:
        db.execute(text("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS r2_key VARCHAR(512)"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_tracks_r2_key ON tracks (r2_key)"))
        db.commit()
        return {"ok": True, "applied": "ALTER TABLE + CREATE INDEX"}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": str(e)}


@router.delete("/diagnostics/storage-orphans")
async def cleanup_storage_orphans(
    confirm: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    Supprime les fichiers orphelins (présents sur disque mais sans ligne DB).
    Dry-run par défaut. Passer ?confirm=true pour exécuter réellement.
    """
    import traceback
    try:
        from app.models.track import Track

        upload_dir = os.getenv("UPLOAD_DIR", "/app/uploads")
        if not os.path.isdir(upload_dir):
            return {"error": "upload_dir introuvable", "upload_dir": upload_dir}

        # Liste basenames référencés par la DB
        db_basenames = set()
        for (fpath,) in db.query(Track.file_path).all():
            if fpath:
                db_basenames.add(os.path.basename(fpath))

        # Trouve les orphelins
        orphans = []
        for name in os.listdir(upload_dir):
            full = os.path.join(upload_dir, name)
            if os.path.isfile(full) and name not in db_basenames:
                try:
                    orphans.append({"filename": name, "size_bytes": os.path.getsize(full), "path": full})
                except OSError:
                    pass

        if not confirm:
            return {
                "dry_run": True,
                "would_delete": len(orphans),
                "would_free_mb": round(sum(o["size_bytes"] for o in orphans) / 1e6, 2),
                "items": orphans[:50],
                "next_step": "Pour confirmer, ajouter ?confirm=true",
            }

        deleted = 0
        freed_bytes = 0
        errors = []
        for o in orphans:
            try:
                os.remove(o["path"])
                deleted += 1
                freed_bytes += o["size_bytes"]
            except OSError as e:
                errors.append({"path": o["path"], "error": str(e)})

        return {
            "dry_run": False,
            "deleted": deleted,
            "freed_mb": round(freed_bytes / 1e6, 2),
            "errors": errors,
        }
    except Exception as e:
        return {"error": "cleanup failed", "detail": str(e), "traceback": traceback.format_exc()}


@router.post("/diagnostics/repair-track-status")
async def repair_track_status(
    confirm: bool = False,
    db: Session = Depends(get_db),
    _: None = Depends(_require_key),
):
    """
    🔴 Fix #117 : répare les tracks où status=failed/pending mais analysis est complète.

    Scanne tous les tracks avec status in ('failed', 'pending', 'processing') mais qui
    ont une TrackAnalysis liée avec bpm + key_ non-null. Met status='ready'.

    Dry-run par défaut, passer ?confirm=true pour exécuter.
    """
    try:
        from app.models.track import Track, TrackAnalysis

        # Tracks avec status non-completed + analyse complète.
        # Enum valide : pending / uploading / analyzing / generating_cues / completed / failed.
        rows = (
            db.query(Track, TrackAnalysis)
            .join(TrackAnalysis, TrackAnalysis.track_id == Track.id)
            .filter(
                Track.status.in_(['failed', 'pending', 'uploading', 'analyzing', 'generating_cues']),
                TrackAnalysis.bpm.isnot(None),
                TrackAnalysis.key.isnot(None),
            )
            .all()
        )

        candidates = []
        for t, a in rows:
            try:
                cue_count = len(t.cue_points) if t.cue_points is not None else 0
            except Exception:
                cue_count = -1
            candidates.append({
                "track_id": t.id,
                "user_id": t.user_id,
                "title": t.title or t.original_filename,
                "current_status": str(t.status) if t.status is not None else None,
                "bpm": a.bpm,
                "key": a.key,
                "cue_points_count": cue_count,
            })

        if not confirm:
            return {
                "dry_run": True,
                "candidates_count": len(candidates),
                "candidates_preview": candidates[:10],
                "message": "Pass ?confirm=true to repair",
            }

        # Execute repair — status 'completed' (pas 'ready' qui n'existe pas dans l'enum).
        fixed = 0
        ids = []
        for t, _a in rows:
            t.status = 'completed'
            ids.append(t.id)
            fixed += 1
        db.commit()

        return {
            "dry_run": False,
            "fixed": fixed,
            "ids": ids,
        }
    except Exception as exc:
        logger.exception("repair-track-status failed")
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {str(exc)[:300]}",
        )
