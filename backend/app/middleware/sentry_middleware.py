"""
Middleware Sentry pour capturer le contexte utilisateur sur chaque requête.
"""
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger(__name__)


class SentryMiddleware(BaseHTTPMiddleware):
    """Capture le contexte utilisateur pour Sentry."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        try:
            from app.services.sentry_service import set_user_context
            from jose import jwt
            from app.config import get_settings

            # Essayer d'extraire l'utilisateur du token JWT
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                try:
                    token = auth_header[7:]
                    settings = get_settings()
                    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
                    user_id = payload.get("sub")
                    email = payload.get("email")
                    plan = payload.get("subscription_plan")
                    if user_id:
                        set_user_context(user_id, email or "", plan)
                except Exception:
                    pass
        except Exception:
            pass

        return await call_next(request)
