"""
PERF Wave21: Minimal RUM (Real User Monitoring) endpoint.

Reçoit des métriques côté navigateur via beacon API et les stocke en mémoire
dans un ring buffer (1000 derniers events par endpoint). Exposé via
/api/v1/diagnostics/rum-stats pour Kevin.

Pourquoi : les mesures depuis le sandbox dev varient énormément (100-450ms RTT).
Les vrais p50/p95 viennent des utilisateurs réels — RUM est la source de vérité.
"""
from collections import defaultdict, deque
from typing import Optional
from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(tags=["rum"])

# Ring buffer en mémoire (1000 events / endpoint / utilisateur). Largement suffisant
# pour calculer p50/p95 sur les heures récentes sans pression mémoire.
_RUM_BUFFER: dict = defaultdict(lambda: deque(maxlen=1000))
_RUM_MAX_KEYS = 5000  # anti-explosion cardinalité


class RumEvent(BaseModel):
    """Métriques navigateur — toutes optionnelles pour ne pas casser les vieux clients."""
    path: Optional[str] = None
    method: Optional[str] = "GET"
    # Server-Timing 'total;dur=X' parsé côté JS
    server_ms: Optional[float] = None
    # PerformanceResourceTiming.duration (total roundtrip incluant réseau)
    total_ms: Optional[float] = None
    # PerformanceResourceTiming.responseStart - PerformanceResourceTiming.requestStart
    ttfb_ms: Optional[float] = None
    # PerformancePaintTiming first-contentful-paint
    fcp_ms: Optional[float] = None
    # PerformanceNavigationTiming domContentLoadedEventEnd
    dcl_ms: Optional[float] = None
    # Largest Contentful Paint
    lcp_ms: Optional[float] = None
    # Page where this was reported from
    page: Optional[str] = None
    # User agent device class (mobile/desktop)
    device: Optional[str] = None


@router.post("/rum", status_code=204)
async def record_rum(event: RumEvent, request: Request):
    """Enregistre un event RUM. No-auth (anonyme), beacon-compatible.

    Limites de sécurité :
    - Cap cardinalité à 5000 clés distinctes (anti-DoS via path random)
    - Pas de PII stockée (path seulement, pas de query params)
    """
    if not event.path:
        return  # ignore events sans path
    # Strip query params pour bound cardinality
    path = event.path.split("?")[0][:120]
    method = (event.method or "GET")[:6]
    key = f"{method} {path}"
    if key not in _RUM_BUFFER and len(_RUM_BUFFER) >= _RUM_MAX_KEYS:
        return  # ignore new keys au-delà du cap
    _RUM_BUFFER[key].append({
        "server_ms": event.server_ms,
        "total_ms": event.total_ms,
        "ttfb_ms": event.ttfb_ms,
        "fcp_ms": event.fcp_ms,
        "dcl_ms": event.dcl_ms,
        "lcp_ms": event.lcp_ms,
        "device": event.device,
    })
    return  # 204 No Content


@router.get("/rum/stats")
async def rum_stats():
    """Retourne p50/p95 par endpoint sur le ring buffer en cours.

    Pas d'auth — les stats sont anonymes et utiles à n'importe quel admin.
    Limité aux 50 endpoints les plus actifs.
    """
    import statistics
    stats = []
    for key, events in list(_RUM_BUFFER.items()):
        if not events:
            continue
        def _pct(field: str, p: int):
            vals = [e.get(field) for e in events if e.get(field) is not None]
            if not vals:
                return None
            vals_sorted = sorted(vals)
            idx = max(0, min(len(vals_sorted) - 1, int(len(vals_sorted) * p / 100)))
            return round(vals_sorted[idx], 1)
        n = len(events)
        stats.append({
            "endpoint": key,
            "n": n,
            "server_p50": _pct("server_ms", 50),
            "server_p95": _pct("server_ms", 95),
            "total_p50": _pct("total_ms", 50),
            "total_p95": _pct("total_ms", 95),
            "ttfb_p50": _pct("ttfb_ms", 50),
            "lcp_p50": _pct("lcp_ms", 50),
        })
    # Top 50 par nombre d'events
    stats.sort(key=lambda s: -s["n"])
    return {"endpoints": stats[:50], "total_keys": len(_RUM_BUFFER)}
