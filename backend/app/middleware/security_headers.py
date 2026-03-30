"""
Security headers middleware — ajoute les headers HTTP de sécurité à chaque réponse.

Headers ajoutés :
- Strict-Transport-Security (HSTS) : force HTTPS
- X-Content-Type-Options : interdit le MIME sniffing
- X-Frame-Options : interdit l'intégration en iframe (anti-clickjacking)
- Referrer-Policy : limite les infos envoyées dans le Referer
- Permissions-Policy : désactive les APIs sensibles inutiles
- Content-Security-Policy : whitelist des sources de contenu
"""
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        # Force HTTPS — 1 an, incluant les sous-domaines
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Bloque le MIME sniffing (évite que le navigateur interprète un .mp3 comme du JS)
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Anti-clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Limite les infos de navigation dans le Referer
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Désactive les APIs navigateur inutiles
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )

        # CSP : autorise uniquement les ressources du domaine CueForge
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "  # unsafe-inline requis par Next.js
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://cueforge-saas-production.up.railway.app https://exquisite-art-production-f4c6.up.railway.app; "
            "frame-ancestors 'none';"
        )

        return response
