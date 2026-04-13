"""
Data optimization and maintenance endpoints.

GET /api/admin/maintenance/status — Maintenance status
POST /api/admin/maintenance/vacuum — Run database vacuum
POST /api/admin/maintenance/archive — Archive old analyses
POST /api/admin/maintenance/cleanup-orphans — Clean up orphan stems
POST /api/admin/backup/verify — Verify backup integrity
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any, Optional
import logging

from app.services.data_optimization import get_optimization_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/maintenance", tags=["maintenance"])
backup_router = APIRouter(prefix="/api/admin/backup", tags=["backup"])


@router.get("/status")
async def get_maintenance_status() -> Dict[str, Any]:
    """
    Get status of data maintenance operations.

    Returns:
    - last_vacuum: ISO timestamp of last VACUUM ANALYZE
    - last_archival: ISO timestamp of last archival run
    - vacuum_due: boolean (due if >7 days since last or never run)
    - archival_due: boolean (due if >30 days since last or never run)
    """
    service = get_optimization_service()
    return service.get_maintenance_status()


@router.post("/vacuum")
async def run_database_vacuum() -> Dict[str, Any]:
    """
    Run database VACUUM ANALYZE (PostgreSQL).

    Reclaims disk space and updates statistics for query planner.

    Returns:
    - task: operation summary
    - bytes_freed: estimated space reclaimed
    - duration_seconds: execution time
    """
    service = get_optimization_service()
    task = service.plan_database_vacuum()

    return {
        "success": task.error is None,
        "task": task.to_dict(),
        "recommendation": (
            "Vacuum successful. Schedule monthly for optimal performance."
            if not task.error
            else f"Vacuum failed: {task.error}"
        ),
    }


@router.post("/archive")
async def archive_old_analyses(
    older_than_days: int = Query(365, description="Archive analyses older than N days"),
) -> Dict[str, Any]:
    """
    Archive old analyses to cold storage.

    Analyses >1 year old are moved to reduced-cost storage.
    Queries are slower but API usage is freed.

    Returns:
    - task: operation summary
    - items_archived: number of analyses archived
    - bytes_freed: estimated space freed from hot storage
    """
    if older_than_days < 1:
        raise HTTPException(status_code=400, detail="older_than_days must be >= 1")

    service = get_optimization_service()
    task = service.plan_archive_old_analyses(older_than_days)

    return {
        "success": task.error is None,
        "task": task.to_dict(),
        "parameters": {
            "older_than_days": older_than_days,
        },
        "recommendation": (
            f"Archived {task.items_deleted} analyses, freed {task.bytes_freed / (1024**3):.2f}GB"
            if not task.error
            else f"Archival failed: {task.error}"
        ),
    }


@router.post("/cleanup-orphans")
async def cleanup_orphan_stems() -> Dict[str, Any]:
    """
    Clean up orphan stems (stems with no parent analysis).

    Orphans consume storage but cannot be used. Keeps orphans >7 days old.

    Returns:
    - task: operation summary
    - items_deleted: number of orphan stems deleted
    - bytes_freed: space reclaimed
    """
    service = get_optimization_service()
    task = service.plan_cleanup_orphan_stems()

    return {
        "success": task.error is None,
        "task": task.to_dict(),
        "recommendation": (
            f"Cleaned up {task.items_deleted} orphan stems, freed {task.bytes_freed / (1024**3):.2f}GB"
            if not task.error
            else f"Cleanup failed: {task.error}"
        ),
    }


@backup_router.post("/verify")
async def verify_backup(
    backup_path: str = Query(..., description="Path to backup file (local path on server)"),
) -> Dict[str, Any]:
    """
    Verify backup file integrity.

    Checks:
    - File exists and is readable
    - GZIP header is valid
    - Decompression works (sample test)

    Returns:
    - valid: boolean (true if all checks passed)
    - checks: dict of individual check results
    - error: error message if any
    """
    service = get_optimization_service()
    report = service.verify_backup(backup_path)

    return report


# Utility endpoint for compression testing
@router.get("/compression/ratio")
async def get_compression_info() -> Dict[str, Any]:
    """
    Get information about analysis result compression.

    Returns expected compression ratios and benefits.
    """
    return {
        "compression": {
            "method": "GZIP + delta-encoding",
            "typical_ratio_percent": 65,
            "typical_original_mb": 50,
            "typical_compressed_mb": 17.5,
            "benefit": "Typical analysis result goes from 50MB to 17.5MB (65% compression)",
        },
        "beat_encoding": {
            "method": "delta-encoding with run-length",
            "typical_positions": 4000,
            "bytes_original": 32000,
            "bytes_delta_encoded": 8000,
            "benefit": "Beat positions array reduced from 32KB to 8KB per analysis",
        },
    }
