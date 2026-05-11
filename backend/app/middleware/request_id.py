"""
Request-ID middleware (pure ASGI).

Génère ou propage X-Request-ID. Stocke dans scope['state']['request_id']
pour que les routes puissent y accéder via request.state.request_id.
"""
import uuid


class RequestIDMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Récupère l'ID client ou en génère un (12 chars suffisent pour tracing)
        req_id = None
        for k, v in scope.get("headers", []):
            if k == b"x-request-id":
                req_id = v.decode("latin-1")[:64]
                break
        if not req_id:
            req_id = uuid.uuid4().hex[:12]
        req_id_bytes = req_id.encode("latin-1")

        # Expose dans scope.state pour les routes
        state = scope.setdefault("state", {})
        state["request_id"] = req_id

        async def send_with_id(message):
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                headers.append((b"x-request-id", req_id_bytes))
            await send(message)

        await self.app(scope, receive, send_with_id)
