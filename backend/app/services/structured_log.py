"""
Logs structurés pour le pipeline d'analyse.
Format JSON-line (1 ligne = 1 événement) → grep facile dans Railway logs.

Exemple d'événement:
{"ts":"2026-04-27T18:42:11Z","track_id":42,"user_id":7,"phase":"init","event":"start","attempt":1,"duration_ms":null}
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger("cueforge.analysis")


class AnalysisLogger:
    """
    Helper pour logger structuré sur le cycle de vie d'une analyse.
    Usage:
        log = AnalysisLogger(track_id=42, user_id=7, attempt=1)
        log.event("init", "start")
        log.event("init", "db_connected", duration_ms=12)
        log.event("init", "completed", duration_ms=145, status="ok")
    """
    def __init__(self, track_id: int, user_id: Optional[int] = None, attempt: int = 1):
        self.track_id = track_id
        self.user_id = user_id
        self.attempt = attempt
        self._phase_start_ts: Dict[str, float] = {}

    def event(
        self,
        phase: str,
        event: str,
        duration_ms: Optional[int] = None,
        status: Optional[str] = None,
        **extra: Any,
    ):
        record = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "track_id": self.track_id,
            "user_id": self.user_id,
            "attempt": self.attempt,
            "phase": phase,
            "event": event,
        }
        if duration_ms is not None:
            record["duration_ms"] = duration_ms
        if status is not None:
            record["status"] = status
        if extra:
            record.update(extra)
        try:
            logger.info(json.dumps(record, ensure_ascii=False, default=str))
        except Exception:
            # Fallback en cas d'objet non-sérialisable
            logger.info(f"[STRUCT-LOG] track={self.track_id} phase={phase} event={event}")

    def phase_start(self, phase: str):
        self._phase_start_ts[phase] = time.time()
        self.event(phase, "start")

    def phase_end(self, phase: str, status: str = "ok", **extra):
        start = self._phase_start_ts.pop(phase, None)
        duration_ms = int((time.time() - start) * 1000) if start else None
        self.event(phase, "end", duration_ms=duration_ms, status=status, **extra)
