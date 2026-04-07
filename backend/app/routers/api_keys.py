"""
Router pour la gestion des API Keys.

Endpoints:
- POST /api/v1/api-keys — créer une clé (retourne le secret UNE seule fois)
- GET /api/v1/api-keys — lister les clés de l'utilisateur (masquées, juste prefix + name + last_used)
- DELETE /api/v1/api-keys/{id} — révoquer une clé
- PATCH /api/v1/api-keys/{id} — activer/désactiver
"""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, ApiKey
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/api-keys", tags=["API Keys"])


# ── Schemas ──
class CreateApiKeyRequest(BaseModel):
    name: str
    permissions: list[str] = []
    expires_in_days: Optional[int] = None


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    prefix: str  # 8 premiers chars du secret (pour identification)
    permissions: list[str]
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]

    class Config:
        from_attributes = True


class CreateApiKeyResponse(BaseModel):
    """Réponse à la création — retourne le secret UNE seule fois."""
    id: int
    secret: str  # Le secret en clair (jamais stocké en clair)
    name: str
    prefix: str
    permissions: list[str]
    created_at: datetime


# ── Endpoints ──
@router.post("", response_model=CreateApiKeyResponse)
def create_api_key(
    req: CreateApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Crée une nouvelle API Key pour l'utilisateur actuel.

    Génère un secret avec secrets.token_urlsafe(48),
    stocke le hash SHA256, retourne le secret en clair UNE seule fois.

    Body:
    {
        "name": "Mon app",
        "permissions": ["tracks:read", "tracks:write"],
        "expires_in_days": 365  (optional)
    }
    """
    # Génère le secret
    secret = secrets.token_urlsafe(48)
    key_hash = hashlib.sha256(secret.encode()).hexdigest()
    prefix = secret[:8]

    # Calcule la date d'expiration si fournie
    expires_at = None
    if req.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=req.expires_in_days)

    # Crée la clé
    api_key = ApiKey(
        user_id=current_user.id,
        name=req.name,
        key_hash=key_hash,
        prefix=prefix,
        permissions=req.permissions,
        is_active=True,
        expires_at=expires_at,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return CreateApiKeyResponse(
        id=api_key.id,
        secret=secret,  # Retourné UNIQUEMENT à la création
        name=api_key.name,
        prefix=api_key.prefix,
        permissions=api_key.permissions,
        created_at=api_key.created_at,
    )


@router.get("", response_model=list[ApiKeyResponse])
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste les API Keys de l'utilisateur actuel (masquées, juste prefix + name)."""
    api_keys = db.query(ApiKey).filter(ApiKey.user_id == current_user.id).all()
    return api_keys


@router.delete("/{api_key_id}")
def delete_api_key(
    api_key_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Supprime (révoque) une API Key."""
    api_key = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key non trouvée")

    if api_key.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    db.delete(api_key)
    db.commit()
    return {"message": "API Key supprimée"}


@router.patch("/{api_key_id}")
def update_api_key(
    api_key_id: int,
    req: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Activer/désactiver une API Key. Body: {"is_active": true/false}"""
    api_key = db.query(ApiKey).filter(ApiKey.id == api_key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API Key non trouvée")

    if api_key.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    if "is_active" in req:
        api_key.is_active = req["is_active"]

    db.commit()
    db.refresh(api_key)
    return api_key
