"""
Rate limiting middleware — protege les endpoints sensibles contre le brute-force.

Utilise un stockage en memoire (suffisant pour une instance unique Railway).
Pour le multi-instance, remplacer par Redis via slowapi ou un middleware custom.
"""
import time
from collections import defaultdict
from typing import Dict, Tuple

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


class _RateBucket:
    """Sliding window rate limiter par cle (IP + path)."""

    def __init__(self):
        # cle -> liste de timestamps
        self._hits: Dict[str, list] = defaultdict(list)

    def is_allowed(self, key: str, max_hits: int, window_seconds: int) -> bool:
        now = time.monotonic()
        cutoff = now - window_seconds
        # Nettoyer les anciennes entrees
        self._hits[key] = [t for t in self._hits[key] if t > cutoff]
        if len(self._hits[key]) >= max_hits:
            return False
        self._hits[key].append(now)
        return True

    def cleanup(self, max_age: int = 3600):
        """Supprimer les cles inactives pour eviter les fuites memoire."""
        now = time.monotonic()
        cutoff = now - max_age
        stale_keys = [k for k, v in self._hits.items() if not v or v[-1] < cutoff]
        for k in stale_keys:
            del self._hits[k]


_bucket = _RateBucket()

# Regles par path prefix -> (max_hits, window_seconds)
RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    "/auth/login": (5, 60),           # 5 tentatives / minute
    "/auth/register": (3, 300),       # 3 inscriptions / 5 min
    "/auth/forgot-password": (3, 300),  # 3 resets / 5 min
    "/auth/resend-verify": (3, 300),  # 3 renvois / 5 min
    "/auth/setup-admin": (3, 3600),   # 3 tentatives / heure
    "/auth/oauth/": (10, 60),         # 10 OAuth / minute
    "/auth/refresh": (20, 60),        # 20 refresh / minute
}


def _get_client_ip(request: Request) -> str:
    """Extraire l'IP reelle derriere un proxy (Railway, nginx, etc.)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware FastAPI qui applique les limites par IP + endpoint."""

    _cleanup_counter = 0

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Ne rate-limiter que les POST (pas les GET)
        if request.method != "POST":
            return await call_next(request)

        path = request.url.path
        client_ip = _get_client_ip(request)

        # Trouver la regle applicable
        for prefix, (max_hits, window) in RATE_LIMITS.items():
            if prefix in path:
                key = f"{client_ip}:{prefix}"
                if not _bucket.is_allowed(key, max_hits, window):
                    raise HTTPException(
                        status_code=429,
                        detail=f"Trop de requetes. Reessayez dans {window // 60} minute(s).",
                    )
                break

        # Nettoyage periodique (toutes les 1000 requetes)
        RateLimitMiddleware._cleanup_counter += 1
        if RateLimitMiddleware._cleanup_counter % 1000 == 0:
            _bucket.cleanup()

        return await call_next(request)
