"""
Router pour la gestion des webhooks.

Endpoints:
- POST /api/v1/webhooks — créer un webhook
- GET /api/v1/webhooks — lister les webhooks
- DELETE /api/v1/webhooks/{id} — supprimer
- POST /api/v1/webhooks/{id}/test — envoyer un événement test
"""
import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Webhook
from app.routers.auth import get_current_user
from app.services.webhook_service import trigger_webhooks

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])


# ── Schemas ──
class CreateWebhookRequest(BaseModel):
    url: str
    events: list[str]  # ["track.analyzed", "track.uploaded", "export.completed"]


class WebhookResponse(BaseModel):
    id: int
    url: str
    events: list[str]
    is_active: bool
    created_at: datetime
    last_triggered_at: datetime | None
    failure_count: int

    class Config:
        from_attributes = True


class CreateWebhookResponse(BaseModel):
    """Réponse à la création — retourne le secret UNE seule fois."""
    id: int
    secret: str
    url: str
    events: list[str]
    created_at: datetime


# ── Endpoints ──
@router.post("", response_model=CreateWebhookResponse)
def create_webhook(
    req: CreateWebhookRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Crée un nouveau webhook pour l'utilisateur actuel.

    Génère un secret HMAC automatiquement, retourné une seule fois.

    Body:
    {
        "url": "https://example.com/webhook",
        "events": ["track.analyzed", "track.uploaded"]
    }
    """
    secret = secrets.token_urlsafe(32)

    webhook = Webhook(
        user_id=current_user.id,
        url=req.url,
        events=req.events,
        secret=secret,
        is_active=True,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)

    return CreateWebhookResponse(
        id=webhook.id,
        secret=secret,
        url=webhook.url,
        events=webhook.events,
        created_at=webhook.created_at,
    )


@router.get("", response_model=list[WebhookResponse])
def list_webhooks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste les webhooks de l'utilisateur actuel."""
    webhooks = db.query(Webhook).filter(Webhook.user_id == current_user.id).all()
    return webhooks


@router.delete("/{webhook_id}")
def delete_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Supprime un webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook non trouvé")

    if webhook.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    db.delete(webhook)
    db.commit()
    return {"message": "Webhook supprimé"}


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Envoie un événement test au webhook."""
    webhook = db.query(Webhook).filter(Webhook.id == webhook_id).first()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook non trouvé")

    if webhook.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Non autorisé")

    # Envoie un événement test
    await trigger_webhooks(
        current_user.id,
        "webhook.test",
        {
            "message": "Test webhook",
            "webhook_id": webhook.id,
        },
        db,
    )

    return {"message": "Événement test envoyé"}
