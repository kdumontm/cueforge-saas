"""
Service pour déclencher les webhooks.

Fonction trigger_webhooks(user_id, event_type, payload):
- Cherche tous les webhooks actifs de l'utilisateur pour cet event
- Envoie un POST HTTP avec le payload JSON
- Header X-CueForge-Signature : HMAC-SHA256 du body avec le secret
- Header X-CueForge-Event : le type d'événement
- Timeout 10s, retry with exponential backoff (3 attempts, delays 1s/5s/30s)
- Incrémente failure_count si erreur, désactive après 10 échecs
"""
import hashlib
import hmac
import json
import logging
import asyncio
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.models import Webhook

logger = logging.getLogger(__name__)

# Retry configuration
WEBHOOK_MAX_RETRIES = 3
WEBHOOK_RETRY_DELAYS = [1, 5, 30]  # seconds (exponential backoff)


async def trigger_webhooks(
    user_id: int,
    event_type: str,
    payload: dict,
    db: Session,
):
    """
    Déclenche tous les webhooks actifs de l'utilisateur pour cet événement.

    Args:
        user_id: ID de l'utilisateur
        event_type: Type d'événement (ex: "track.analyzed", "track.uploaded")
        payload: Données à envoyer dans le webhook
        db: Session SQLAlchemy

    Les webhooks avec une URL invalide ou 10+ échecs sont auto-désactivés.
    """
    webhooks = db.query(Webhook).filter(
        Webhook.user_id == user_id,
        Webhook.is_active == True,
    ).all()

    for webhook in webhooks:
        # Vérifie si cet événement est abonné
        if event_type not in webhook.events:
            continue

        # Lance l'envoi en arrière-plan (fire and forget)
        try:
            await _send_webhook(webhook, event_type, payload, db)
        except Exception as e:
            logger.error(f"Erreur lors de l'envoi du webhook {webhook.id}: {e}")


async def _send_webhook(
    webhook: Webhook,
    event_type: str,
    payload: dict,
    db: Session,
):
    """Envoie le webhook avec HMAC signature, retry avec exponential backoff et gestion d'erreurs."""
    # Crée le body JSON
    body = json.dumps({
        "event": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        "data": payload,
    })

    # Crée la signature HMAC-SHA256
    signature = hmac.new(
        webhook.secret.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()

    headers = {
        "X-CueForge-Signature": signature,
        "X-CueForge-Event": event_type,
        "Content-Type": "application/json",
    }

    # Retry logic with exponential backoff
    for attempt in range(WEBHOOK_MAX_RETRIES):
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.post(webhook.url, content=body, headers=headers)
                response.raise_for_status()  # Lève HTTPError si status >= 400

                # Succès
                webhook.last_triggered_at = datetime.utcnow()
                webhook.failure_count = 0
                db.commit()

                logger.info(f"Webhook {webhook.id} envoyé avec succès (status {response.status_code}, attempt {attempt+1}/{WEBHOOK_MAX_RETRIES})")
                return

            except httpx.HTTPStatusError as e:
                if attempt < WEBHOOK_MAX_RETRIES - 1:
                    delay = WEBHOOK_RETRY_DELAYS[attempt]
                    logger.warning(f"Webhook {webhook.id} attempt {attempt+1} failed (status {e.response.status_code}), retry in {delay}s")
                    await asyncio.sleep(delay)
                else:
                    logger.warning(f"Webhook {webhook.id} failed after {WEBHOOK_MAX_RETRIES} attempts (status {e.response.status_code})")
                    _handle_webhook_failure(webhook, db)

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                if attempt < WEBHOOK_MAX_RETRIES - 1:
                    delay = WEBHOOK_RETRY_DELAYS[attempt]
                    logger.warning(f"Webhook {webhook.id} attempt {attempt+1} timeout/network error, retry in {delay}s")
                    await asyncio.sleep(delay)
                else:
                    logger.warning(f"Webhook {webhook.id} failed after {WEBHOOK_MAX_RETRIES} attempts (timeout/network)")
                    _handle_webhook_failure(webhook, db)

            except Exception as e:
                if attempt < WEBHOOK_MAX_RETRIES - 1:
                    delay = WEBHOOK_RETRY_DELAYS[attempt]
                    logger.error(f"Webhook {webhook.id} attempt {attempt+1} unexpected error, retry in {delay}s: {e}")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"Webhook {webhook.id} failed after {WEBHOOK_MAX_RETRIES} attempts: {e}")
                    _handle_webhook_failure(webhook, db)


def _handle_webhook_failure(webhook: Webhook, db: Session):
    """Gère un échec de webhook — désactive après 10 tentatives."""
    webhook.failure_count += 1
    if webhook.failure_count >= 10:
        webhook.is_active = False
        logger.warning(f"Webhook {webhook.id} désactivé après 10 échecs")
    db.commit()
