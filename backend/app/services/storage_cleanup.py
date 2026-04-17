"""
Storage Cleanup Service — purge des fichiers uploadés orphelins / obsolètes.

Règles de purge :
  1. Fichiers **orphelins** : présents sur disque mais référencés par aucun Track en DB → supprimés
  2. Fichiers **anciens** : Track existe mais fichier > N jours (default 30) et analyse terminée
     → fichier supprimé du disque, file_path mis à None en DB (la track reste, l'analyse aussi)
  3. Fichiers **de tracks supprimées** : Track.deleted=True → fichier supprimé

Aussi :
  - Purge du cache de features (/tmp/trackcue_feature_cache)
  - Purge des stems Demucs (/tmp/trackcue_stems) > N jours
  - Retourne un rapport détaillé (nb fichiers supprimés, octets libérés)

⚠️ Non destructif pour la DB : on met file_path=None mais on ne supprime JAMAIS de Track.
"""
from __future__ import annotations

import logging
import os
import shutil
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.services.storage import UPLOAD_DIR

logger = logging.getLogger(__name__)

# ── Config via env vars ──────────────────────────────────────────────────
DEFAULT_MAX_AGE_DAYS = int(os.getenv("STORAGE_CLEANUP_MAX_AGE_DAYS", "30"))
STEMS_MAX_AGE_DAYS = int(os.getenv("STEMS_CLEANUP_MAX_AGE_DAYS", "7"))
FEATURE_CACHE_MAX_AGE_DAYS = int(os.getenv("FEATURE_CACHE_MAX_AGE_DAYS", "14"))

STEMS_DIR = os.getenv("STEMS_DIR", "/tmp/trackcue_stems")
FEATURE_CACHE_DIR = os.getenv("FEATURE_CACHE_DIR", "/tmp/trackcue_feature_cache")


@dataclass
class CleanupReport:
    """Rapport retourné après un cleanup run."""
    orphan_files_removed: int = 0
    orphan_bytes_freed: int = 0
    aged_files_removed: int = 0
    aged_bytes_freed: int = 0
    stems_removed: int = 0
    stems_bytes_freed: int = 0
    feature_cache_removed: int = 0
    feature_cache_bytes_freed: int = 0
    errors: List[str] = field(default_factory=list)
    duration_sec: float = 0.0
    dry_run: bool = False

    @property
    def total_bytes_freed(self) -> int:
        return (
            self.orphan_bytes_freed
            + self.aged_bytes_freed
            + self.stems_bytes_freed
            + self.feature_cache_bytes_freed
        )

    @property
    def total_files_removed(self) -> int:
        return (
            self.orphan_files_removed
            + self.aged_files_removed
            + self.stems_removed
            + self.feature_cache_removed
        )

    def to_dict(self) -> Dict:
        d = asdict(self)
        d["total_bytes_freed"] = self.total_bytes_freed
        d["total_mb_freed"] = round(self.total_bytes_freed / (1024 * 1024), 2)
        d["total_files_removed"] = self.total_files_removed
        return d


# ══════════════════════════════════════════════════════════════════════════
#   USAGE REPORTING (lecture seule)
# ══════════════════════════════════════════════════════════════════════════

def _dir_usage(path: str) -> Dict:
    """Retourne {file_count, total_bytes, total_mb} pour un dossier."""
    if not os.path.exists(path):
        return {"file_count": 0, "total_bytes": 0, "total_mb": 0.0, "exists": False}

    file_count = 0
    total_bytes = 0
    try:
        for root, _dirs, files in os.walk(path):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    total_bytes += os.path.getsize(fp)
                    file_count += 1
                except OSError:
                    continue
    except Exception as e:
        logger.warning(f"[CLEANUP] _dir_usage({path}) failed: {e}")

    return {
        "file_count": file_count,
        "total_bytes": total_bytes,
        "total_mb": round(total_bytes / (1024 * 1024), 2),
        "exists": True,
        "path": path,
    }


def get_storage_usage() -> Dict:
    """
    Rapport complet de l'utilisation disque.
    Endpoint read-only — ne supprime rien.
    """
    return {
        "uploads": _dir_usage(UPLOAD_DIR),
        "stems": _dir_usage(STEMS_DIR),
        "feature_cache": _dir_usage(FEATURE_CACHE_DIR),
        "config": {
            "max_age_days": DEFAULT_MAX_AGE_DAYS,
            "stems_max_age_days": STEMS_MAX_AGE_DAYS,
            "feature_cache_max_age_days": FEATURE_CACHE_MAX_AGE_DAYS,
        },
    }


# ══════════════════════════════════════════════════════════════════════════
#   CLEANUP OPERATIONS
# ══════════════════════════════════════════════════════════════════════════

def _list_uploaded_files() -> List[str]:
    """Liste tous les fichiers présents dans UPLOAD_DIR (récursif)."""
    if not os.path.exists(UPLOAD_DIR):
        return []
    result = []
    for root, _dirs, files in os.walk(UPLOAD_DIR):
        for f in files:
            result.append(os.path.join(root, f))
    return result


def _get_db_file_paths(db: Session) -> set:
    """
    Récupère tous les file_path référencés dans la table tracks.
    Retourne un set de chemins absolus (realpath).
    """
    from app.models.track import Track
    paths = set()
    try:
        rows = db.query(Track.file_path).filter(Track.file_path.isnot(None)).all()
        for (fp,) in rows:
            if fp:
                try:
                    paths.add(os.path.realpath(fp))
                except Exception:
                    paths.add(fp)
    except Exception as e:
        logger.error(f"[CLEANUP] Failed to query Track.file_path: {e}")
    return paths


def _remove_orphans(db: Session, dry_run: bool = False) -> tuple[int, int, List[str]]:
    """
    Supprime les fichiers présents sur disque mais non référencés en DB.
    Returns: (files_removed, bytes_freed, errors)
    """
    errors: List[str] = []
    files_removed = 0
    bytes_freed = 0

    db_paths = _get_db_file_paths(db)
    disk_files = _list_uploaded_files()

    logger.info(f"[CLEANUP] Orphan scan: {len(disk_files)} files on disk, {len(db_paths)} in DB")

    for fp in disk_files:
        try:
            real_fp = os.path.realpath(fp)
        except Exception:
            real_fp = fp

        if real_fp in db_paths:
            continue  # pas orphelin

        try:
            size = os.path.getsize(fp)
            if not dry_run:
                os.remove(fp)
            files_removed += 1
            bytes_freed += size
            logger.info(f"[CLEANUP] {'Would remove' if dry_run else 'Removed'} orphan: {fp} ({size} bytes)")
        except Exception as e:
            errors.append(f"orphan remove failed for {fp}: {e}")

    return files_removed, bytes_freed, errors


def _remove_aged_tracks(
    db: Session,
    max_age_days: int,
    dry_run: bool = False,
) -> tuple[int, int, List[str]]:
    """
    Supprime les fichiers audio des Tracks analysées ET plus vieilles que max_age_days.
    - La Track et son TrackAnalysis restent en DB.
    - Seul le fichier binaire sur disque est supprimé.
    - file_path est mis à None.

    Ne touche PAS aux tracks en cours d'analyse (status != "analyzed" / "completed").
    """
    from app.models.track import Track, TrackStatus

    errors: List[str] = []
    files_removed = 0
    bytes_freed = 0

    cutoff = datetime.utcnow() - timedelta(days=max_age_days)

    # On cible uniquement les tracks analysées avec succès
    candidates = (
        db.query(Track)
        .filter(Track.file_path.isnot(None))
        .filter(Track.created_at < cutoff)
        .filter(Track.status.in_([TrackStatus.analyzed, TrackStatus.completed])
                if hasattr(TrackStatus, "completed")
                else Track.status == TrackStatus.analyzed)
        .all()
    )

    logger.info(
        f"[CLEANUP] Aged scan: {len(candidates)} tracks older than {max_age_days}d eligible"
    )

    for track in candidates:
        fp = track.file_path
        if not fp or not os.path.exists(fp):
            # Nettoie la DB même si le fichier est déjà parti
            if fp and not dry_run:
                track.file_path = None
            continue

        try:
            size = os.path.getsize(fp)
            if not dry_run:
                os.remove(fp)
                track.file_path = None
            files_removed += 1
            bytes_freed += size
            logger.info(
                f"[CLEANUP] {'Would remove' if dry_run else 'Removed'} aged file: "
                f"track_id={track.id}, {fp} ({size} bytes)"
            )
        except Exception as e:
            errors.append(f"aged remove failed for track {track.id} ({fp}): {e}")

    if not dry_run:
        try:
            db.commit()
        except Exception as e:
            errors.append(f"DB commit failed: {e}")
            db.rollback()

    return files_removed, bytes_freed, errors


def _remove_old_stems(max_age_days: int, dry_run: bool = False) -> tuple[int, int, List[str]]:
    """Supprime les dossiers de stems Demucs > max_age_days jours."""
    errors: List[str] = []
    files_removed = 0
    bytes_freed = 0

    if not os.path.exists(STEMS_DIR):
        return 0, 0, errors

    cutoff_ts = time.time() - (max_age_days * 86400)

    try:
        for entry in os.listdir(STEMS_DIR):
            subdir = os.path.join(STEMS_DIR, entry)
            if not os.path.isdir(subdir):
                continue

            try:
                mtime = os.path.getmtime(subdir)
            except OSError:
                continue

            if mtime >= cutoff_ts:
                continue

            # Sum size avant suppression
            dir_size = 0
            dir_files = 0
            for root, _dirs, files in os.walk(subdir):
                for f in files:
                    try:
                        dir_size += os.path.getsize(os.path.join(root, f))
                        dir_files += 1
                    except OSError:
                        continue

            try:
                if not dry_run:
                    shutil.rmtree(subdir)
                files_removed += dir_files
                bytes_freed += dir_size
                logger.info(
                    f"[CLEANUP] {'Would remove' if dry_run else 'Removed'} stems dir: "
                    f"{subdir} ({dir_files} files, {dir_size} bytes)"
                )
            except Exception as e:
                errors.append(f"stems remove failed for {subdir}: {e}")
    except Exception as e:
        errors.append(f"stems listdir failed: {e}")

    return files_removed, bytes_freed, errors


def _remove_old_feature_cache(max_age_days: int, dry_run: bool = False) -> tuple[int, int, List[str]]:
    """Supprime les fichiers de cache features > max_age_days jours."""
    errors: List[str] = []
    files_removed = 0
    bytes_freed = 0

    if not os.path.exists(FEATURE_CACHE_DIR):
        return 0, 0, errors

    cutoff_ts = time.time() - (max_age_days * 86400)

    for root, _dirs, files in os.walk(FEATURE_CACHE_DIR):
        for f in files:
            fp = os.path.join(root, f)
            try:
                mtime = os.path.getmtime(fp)
            except OSError:
                continue

            if mtime >= cutoff_ts:
                continue

            try:
                size = os.path.getsize(fp)
                if not dry_run:
                    os.remove(fp)
                files_removed += 1
                bytes_freed += size
            except Exception as e:
                errors.append(f"feature cache remove failed for {fp}: {e}")

    return files_removed, bytes_freed, errors


# ══════════════════════════════════════════════════════════════════════════
#   PUBLIC API
# ══════════════════════════════════════════════════════════════════════════

def run_cleanup(
    db: Session,
    max_age_days: Optional[int] = None,
    include_orphans: bool = True,
    include_aged: bool = True,
    include_stems: bool = True,
    include_feature_cache: bool = True,
    dry_run: bool = False,
) -> CleanupReport:
    """
    Exécute une passe complète de cleanup.

    Args:
        db: session SQLAlchemy
        max_age_days: jours avant purge (default: STORAGE_CLEANUP_MAX_AGE_DAYS = 30)
        include_*: toggles par type de cleanup
        dry_run: si True, log mais ne supprime rien

    Returns:
        CleanupReport avec détails (files, bytes, errors, duration)
    """
    t0 = time.time()
    report = CleanupReport(dry_run=dry_run)
    age = max_age_days if max_age_days is not None else DEFAULT_MAX_AGE_DAYS

    logger.info(
        f"[CLEANUP] Starting cleanup run (dry_run={dry_run}, max_age_days={age}, "
        f"orphans={include_orphans}, aged={include_aged}, stems={include_stems}, "
        f"feature_cache={include_feature_cache})"
    )

    if include_orphans:
        try:
            n, b, errs = _remove_orphans(db, dry_run=dry_run)
            report.orphan_files_removed = n
            report.orphan_bytes_freed = b
            report.errors.extend(errs)
        except Exception as e:
            report.errors.append(f"orphan cleanup crashed: {e}")
            logger.exception("[CLEANUP] orphan phase crashed")

    if include_aged:
        try:
            n, b, errs = _remove_aged_tracks(db, max_age_days=age, dry_run=dry_run)
            report.aged_files_removed = n
            report.aged_bytes_freed = b
            report.errors.extend(errs)
        except Exception as e:
            report.errors.append(f"aged cleanup crashed: {e}")
            logger.exception("[CLEANUP] aged phase crashed")

    if include_stems:
        try:
            n, b, errs = _remove_old_stems(STEMS_MAX_AGE_DAYS, dry_run=dry_run)
            report.stems_removed = n
            report.stems_bytes_freed = b
            report.errors.extend(errs)
        except Exception as e:
            report.errors.append(f"stems cleanup crashed: {e}")
            logger.exception("[CLEANUP] stems phase crashed")

    if include_feature_cache:
        try:
            n, b, errs = _remove_old_feature_cache(FEATURE_CACHE_MAX_AGE_DAYS, dry_run=dry_run)
            report.feature_cache_removed = n
            report.feature_cache_bytes_freed = b
            report.errors.extend(errs)
        except Exception as e:
            report.errors.append(f"feature cache cleanup crashed: {e}")
            logger.exception("[CLEANUP] feature cache phase crashed")

    report.duration_sec = round(time.time() - t0, 2)

    logger.info(
        f"[CLEANUP] Done in {report.duration_sec}s — "
        f"{report.total_files_removed} files, "
        f"{report.total_bytes_freed / (1024*1024):.1f} MB freed, "
        f"{len(report.errors)} errors (dry_run={dry_run})"
    )

    return report
