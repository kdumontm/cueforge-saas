"""
Security headers middleware (pure ASGI — pas de BaseHTTPMiddleware).

Pure ASGI = pas de coroutine wrap par anyio.task → 5-20ms gagnés par requête.
Header set au moment du send 'http.response.start'.
"""
from typing import Callable, Iterable, Tuple

_SECURITY_HEADERS: Tuple[Tuple[bytes, bytes], ...] = (
    (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
    (b"x-content-type-options",    b"nosniff"),
    (b"x-frame-options",           b"DENY"),
    (b"referrer-policy",           b"strict-origin-when-cross-origin"),
    (b"permissions-policy",        b"camera=(), microphone=(), geolocation=(), payment=()"),
    (b"content-security-policy",   (
        b"default-src 'self'; "
        b"script-src 'self' 'unsafe-eval'; "
        b"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        b"font-src 'self' https://fonts.gstatic.com; "
        b"img-src 'self' data: https:; "
        b"connect-src 'self' https://trackcue-saas-production.up.railway.app https://exquisite-art-production-f4c6.up.railway.app; "
        b"frame-ancestors 'none';"
    )),
)


class SecurityHeadersMiddleware:
    """Pure ASGI middleware — ajoute les headers de sécurité sans wrapper coroutine."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                # Convertit headers en liste mutable (starlette utilise list of tuples)
                existing_keys = {h[0].lower() for h in headers}
                for k, v in _SECURITY_HEADERS:
                    if k not in existing_keys:
                        headers.append((k, v))
            await send(message)

        await self.app(scope, receive, send_with_headers)
