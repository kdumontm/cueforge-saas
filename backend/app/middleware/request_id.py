"""
X-Request-ID middleware — attribue un ID unique à chaque requête pour le tracing.

Permet de corréler les logs backend avec les requêtes frontend en production.
L'ID est retourné dans le header de réponse X-Request-ID.
"""
import uuid
import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Utiliser l'ID fourni par le client ou en générer un
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())[:12]

        # Stocker dans request.state pour accès dans les routes
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        return response
