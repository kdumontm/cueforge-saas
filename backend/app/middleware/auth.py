from typing import Optional, Tuple
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError

from app.services.auth_service import decode_access_token
from app.models import User
from app.database import get_db

security = HTTPBearer()


# ─────────────────────────────────────────────────────────────
# PERF Wave1 — micro-cache user (30s TTL, 10k entries)
#
# /auth/me est hammeré par les pages v4 (au load + au focus + au routing).
# Sans cache : decode JWT (1ms) + db.query(User).filter(id=X).first() (10-40ms)
# + serialization. Multi-utilisateur, ~100 RPS pic, ~10k tokens distincts.
# Avec cache : 0.01ms (dict lookup), invalidé après 30s (et purgé sur logout).
# ─────────────────────────────────────────────────────────────
_USER_CACHE: dict = {}              # token_sig → (expires_at, user_payload)
_USER_CACHE_TTL = 30.0               # 30 secondes
_USER_CACHE_MAX = 10_000             # cap mémoire
_USER_CACHE_HITS = {"hit": 0, "miss": 0}


def _token_sig(token: str) -> str:
    """Signature courte du token pour clé cache (3 derniers segments JWT)."""
    return token[-32:]  # 32 dernières chars du JWT = signature uniques


def invalidate_user_cache(user_id: int | None = None) -> None:
    """Invalide le cache (appelé sur logout / update_me / password change)."""
    if user_id is None:
        _USER_CACHE.clear()
        return
    # On ne connaît pas le token, on purge tout pour user_id donné
    to_del = [k for k, v in _USER_CACHE.items() if v[1] and getattr(v[1], "id", None) == user_id]
    for k in to_del:
        _USER_CACHE.pop(k, None)


def get_user_cache_stats() -> dict:
    return {
        "size": len(_USER_CACHE),
        "max": _USER_CACHE_MAX,
        "ttl_s": _USER_CACHE_TTL,
        "hits": _USER_CACHE_HITS["hit"],
        "misses": _USER_CACHE_HITS["miss"],
    }


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Valide le JWT et retourne le User. Micro-cache 30s pour /auth/me hot path."""
    token = credentials.credentials
    sig = _token_sig(token)
    now = time.monotonic()

    # Cache hit (très chaud — /auth/me appelé par toutes les pages v4 au load)
    cached = _USER_CACHE.get(sig)
    if cached and cached[0] > now:
        _USER_CACHE_HITS["hit"] += 1
        return cached[1]

    # Cache miss → decode + DB query
    _USER_CACHE_HITS["miss"] += 1
    try:
        payload = decode_access_token(token)
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    # Met en cache (avec cap simple : si plein, purge un tiers au hasard)
    if len(_USER_CACHE) >= _USER_CACHE_MAX:
        # Évict les plus vieux : keep les 2/3 plus récents
        items = sorted(_USER_CACHE.items(), key=lambda kv: kv[1][0], reverse=True)
        _USER_CACHE.clear()
        _USER_CACHE.update(dict(items[:int(_USER_CACHE_MAX * 0.66)]))

    _USER_CACHE[sig] = (now + _USER_CACHE_TTL, user)

    return user
