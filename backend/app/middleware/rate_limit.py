"""
Rate limiting middleware — protège les endpoints sensibles contre le brute-force.

Fixes:
- Login réduit à 5/min (était 60 — permettait le brute-force)
- X-Forwarded-For : utilise le dernier IP de confiance (pas le premier, spoofable)
- Sliding window par IP réelle
- Support du rate limiting par plan utilisateur (free, pro, unlimited)
"""
import time
import logging
from collections import defaultdict
from typing import Dict, Tuple, Optional

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response, JSONResponse

logger = logging.getLogger(__name__)


class _RateBucket:
    """Sliding window rate limiter par clé (IP + path)."""

    def __init__(self):
        self._hits: Dict[str, list] = defaultdict(list)

    def is_allowed(self, key: str, max_hits: int, window_seconds: int) -> bool:
        now = time.monotonic()
        cutoff = now - window_seconds
        self._hits[key] = [t for t in self._hits[key] if t > cutoff]
        if len(self._hits[key]) >= max_hits:
            return False
        self._hits[key].append(now)
        return True

    def cleanup(self, max_age: int = 3600):
        """Supprime les clés inactives pour éviter les fuites mémoire."""
        now = time.monotonic()
        cutoff = now - max_age
        stale_keys = [k for k, v in self._hits.items() if not v or v[-1] < cutoff]
        for k in stale_keys:
            del self._hits[k]


_bucket = _RateBucket()

# Règles par path prefix -> (max_hits, window_seconds)
RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    "/auth/login":           (5, 60),     # 5/min (protège contre brute-force)
    "/auth/register":        (3, 300),    # 3 inscriptions / 5 min
    "/auth/forgot-password": (3, 300),   # 3 resets / 5 min
    "/auth/resend-verify":   (3, 300),   # 3 renvois / 5 min
    "/auth/setup-admin":     (3, 3600),  # 3 tentatives / heure
    "/auth/oauth/":          (10, 60),   # 10 OAuth / minute
    "/auth/refresh":         (20, 60),   # 20 refresh / minute
}

# Limites par plan — pour les endpoints non-auth
PLAN_RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    "free":      (30, 60),       # 30 requêtes/min
    "pro":       (120, 60),      # 120 requêtes/min
    "unlimited": (600, 60),      # 600 requêtes/min
}


def _get_client_ip(request: Request) -> str:
    """
    Extrait l'IP réelle derrière Railway (proxy de confiance).

    🔴 FIX : on prend le DERNIER IP de X-Forwarded-For, pas le premier.
    Le premier peut être forgé par l'attaquant. Railway ajoute son propre IP
    à la fin — c'est la seule entrée qu'on ne peut pas falsifier.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Dernier IP = ajouté par Railway = fiable
        ips = [ip.strip() for ip in forwarded.split(",")]
        return ips[-1]
    return request.client.host if request.client else "unknown"


def _get_user_plan_from_token(request: Request) -> Optional[str]:
    """
    Extrait le plan utilisateur du JWT token dans le header Authorization.
    Retourne 'free' par défaut si le token n'est pas présent ou invalide.
    """
    try:
        from jose import jwt
        from app.config import get_settings

        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return "free"

        token = auth_header[7:]  # Enlever "Bearer "
        settings = get_settings()
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        plan = payload.get("subscription_plan", "free")
        return plan if plan in PLAN_RATE_LIMITS else "free"
    except Exception:
        # Invalide, expiré, etc. — utiliser le plan par défaut
        return "free"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware FastAPI qui applique les limites par IP + endpoint + plan utilisateur."""

    _cleanup_counter = 0

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Ne rate-limiter que les POST (pas les GET)
        if request.method != "POST":
            return await call_next(request)

        path = request.url.path
        client_ip = _get_client_ip(request)

        # 1. Vérifier les limites d'authentification strictes (5/min)
        for prefix, (max_hits, window) in RATE_LIMITS.items():
            if prefix in path:
                key = f"{client_ip}:{prefix}"
                if not _bucket.is_allowed(key, max_hits, window):
                    return JSONResponse(
                        status_code=429,
                        content={"detail": f"Trop de requêtes. Réessayez dans {window // 60} minute(s)."},
                        headers={"Retry-After": str(window)},
                    )
                break
        else:
            # 2. Pour les autres endpoints, appliquer le rate limit par plan
            user_plan = _get_user_plan_from_token(request)
            if user_plan in PLAN_RATE_LIMITS:
                max_hits, window = PLAN_RATE_LIMITS[user_plan]
                # Clé = IP + plan (pas de path, global par plan)
                key = f"{client_ip}:plan:{user_plan}"
                if not _bucket.is_allowed(key, max_hits, window):
                    return JSONResponse(
                        status_code=429,
                        content={
                            "detail": f"Limite {user_plan} dépassée ({max_hits} req/min). Réessayez dans {window // 60} minute(s)."
                        },
                        headers={"Retry-After": str(window)},
                    )

        # Nettoyage périodique (toutes les 1000 requêtes)
        RateLimitMiddleware._cleanup_counter += 1
        if RateLimitMiddleware._cleanup_counter % 1000 == 0:
            _bucket.cleanup()

        return await call_next(request)
