"""
Access log + Server-Timing (pure ASGI).

Mesure la durée pure du handler (depuis le premier byte côté serveur jusqu'au
http.response.start) et l'expose en Server-Timing header. C'est ce qui donne
la latence "vraie" du backend (visible dans Chrome DevTools / Network).
"""
import logging
import time

logger = logging.getLogger("access")


class AccessLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        start = time.perf_counter()
        status_code = {"v": 200}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code["v"] = message.get("status", 200)
                duration_ms = round((time.perf_counter() - start) * 1000, 1)
                headers = message.setdefault("headers", [])
                headers.append((b"server-timing", f"total;dur={duration_ms}".encode("latin-1")))
                # Logging au moment du response.start (pas après le body pour éviter
                # d'overhead supplémentaire sur les gros payloads).
                method = scope.get("method", "?")
                path   = scope.get("path", "?")
                logger.info(
                    "method=%s path=%s status=%d duration_ms=%.1f",
                    method, path, status_code["v"], duration_ms,
                )
            await send(message)

        await self.app(scope, receive, send_wrapper)
