"""
Middleware et dependency pour l'authentification par API Key.

Vérifie le header X-API-Key, retrouve le hash dans la DB,
et retourne l'utilisateur associé.
"""
import hashlib
from datetime import datetime
from fastapi import Depends, HTTPException, status, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiKey, User


def get_api_key_user(
    x_api_key: str = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependency qui authentifie via X-API-Key.

    Cherche le hash SHA256 dans la DB, vérifie is_active et expires_at,
    puis met à jour last_used_at.

    Raises:
        HTTPException 401 si API key invalide, expirée, ou inactive.
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key manquante (header X-API-Key requis)",
        )

    # Hash la clé fournie
    key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()

    # Cherche dans la DB
    api_key = db.query(ApiKey).filter(ApiKey.key_hash == key_hash).first()

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key invalide",
        )

    # Vérifie si la clé est active
    if not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key désactivée",
        )

    # Vérifie l'expiration
    if api_key.expires_at and datetime.utcnow() > api_key.expires_at:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key expirée",
        )

    # Met à jour last_used_at
    api_key.last_used_at = datetime.utcnow()
    db.commit()

    # Retourne l'utilisateur
    user = db.query(User).filter(User.id == api_key.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur non trouvé",
        )

    return user
