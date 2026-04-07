"""
Sentry integration pour la capture des erreurs et monitoring.
Initialise le SDK Sentry si SENTRY_DSN est défini en variable d'environnement.
"""
import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def init_sentry() -> Optional[str]:
    """
    Initialise Sentry SDK si SENTRY_DSN est défini.

    Returns:
        Le DSN Sentry utilisé, ou None si non configuré.
    """
    sentry_dsn = os.getenv("SENTRY_DSN")
    if not sentry_dsn:
        logger.debug("SENTRY_DSN non défini — Sentry non initialisé")
        return None

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
            ],
            traces_sample_rate=0.1,  # Capture 10% des transactions
            debug=False,
        )
        logger.info(f"✅ Sentry initialisé avec DSN: {sentry_dsn[:20]}...")
        return sentry_dsn
    except ImportError:
        logger.warning("sentry-sdk non installé — Sentry non initialisé")
        return None
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation de Sentry: {e}")
        return None


def set_user_context(user_id: str, email: str, subscription_plan: str = None) -> None:
    """
    Configure le contexte utilisateur pour Sentry.

    Args:
        user_id: ID de l'utilisateur
        email: Email de l'utilisateur
        subscription_plan: Plan de souscription (optionnel)
    """
    try:
        import sentry_sdk

        sentry_sdk.set_user({
            "id": user_id,
            "email": email,
        })

        if subscription_plan:
            sentry_sdk.set_context("subscription", {"plan": subscription_plan})
    except Exception:
        pass  # Sentry non initialisé, c'est OK


def capture_exception(exception: Exception, context: dict = None) -> None:
    """
    Capture une exception vers Sentry.

    Args:
        exception: Exception à capturer
        context: Contexte additionnel (optionnel)
    """
    try:
        import sentry_sdk

        if context:
            sentry_sdk.set_context("additional", context)

        sentry_sdk.capture_exception(exception)
    except Exception:
        pass  # Sentry non initialisé, c'est OK


def capture_message(message: str, level: str = "info") -> None:
    """
    Capture un message vers Sentry.

    Args:
        message: Message à capturer
        level: Niveau de sévérité (info, warning, error)
    """
    try:
        import sentry_sdk
        sentry_sdk.capture_message(message, level=level)
    except Exception:
        pass  # Sentry non initialisé, c'est OK
