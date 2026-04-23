"""
Middleware de logging des requêtes HTTP avec timing.
PERF #4.1: ajoute un header Server-Timing visible dans l'onglet Network de Chrome.
"""
import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("access")


class AccessLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = round((time.monotonic() - start) * 1000, 1)
        logger.info(
            "method=%s path=%s status=%d duration_ms=%.1f",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        # PERF #4.1: Server-Timing header — visible dans Chrome DevTools / Network.
        # Format: "total;dur=123.4" — duration en millisecondes.
        try:
            response.headers["Server-Timing"] = f"total;dur={duration_ms}"
        except Exception:
            pass
        return response
