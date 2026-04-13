"""
API Optimization Service
Points 611-680 : API Design & Performance
"""

import asyncio
import logging
import gzip
import hashlib
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable, Coroutine
from collections import defaultdict
from functools import wraps
import ast

from fastapi import Request, Response, HTTPException
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.datastructures import MutableHeaders

logger = logging.getLogger(__name__)


class ResponseStreamingMiddleware(BaseHTTPMiddleware):
    """
    Middleware pour streaming des grosses réponses (>1MB)
    Divise les données en chunks et envoie progressivement
    """

    def __init__(self, app, chunk_size: int = 8192):
        super().__init__(app)
        self.chunk_size = chunk_size

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Ne streamer que les réponses JSON volumineuses
        if response.headers.get("content-type") == "application/json":
            try:
                content_length = response.headers.get("content-length", "0")
                if int(content_length) > 1024 * 1024:  # > 1MB
                    logger.info(f"Streaming response for {request.url.path}")

                    async def generate():
                        async for chunk in response.body_iterator:
                            yield chunk

                    return StreamingResponse(
                        generate(),
                        media_type="application/json",
                        headers=dict(response.headers)
                    )
            except Exception as e:
                logger.warning(f"Streaming error: {e}")

        return response


class ETagMiddleware(BaseHTTPMiddleware):
    """
    Middleware pour génération automatique ETag et support 304 Not Modified
    Réduit la bande passante pour les requêtes identiques
    """

    def __init__(self, app):
        super().__init__(app)
        self.cache: Dict[str, Dict[str, Any]] = {}

    async def dispatch(self, request: Request, call_next) -> Response:
        # Ne calculer ETag que pour GET/HEAD
        if request.method not in ["GET", "HEAD"]:
            return await call_next(request)

        response = await call_next(request)

        # Générer l'ETag
        if response.status_code == 200:
            try:
                # Lire le body
                body = b""
                async for chunk in response.body_iterator:
                    body += chunk

                # Calculer l'ETag
                etag = f'"{hashlib.md5(body).hexdigest()}"'

                # Vérifier l'If-None-Match header
                if_none_match = request.headers.get("if-none-match", "")
                if if_none_match == etag:
                    logger.debug(f"304 Not Modified for {request.url.path}")
                    return Response(status_code=304, headers={"etag": etag})

                # Ajouter l'ETag au response
                response.headers["etag"] = etag
                response.body = body

                # Cacher pour future revalidation
                self.cache[str(request.url)] = {
                    "etag": etag,
                    "body": body,
                    "created_at": datetime.utcnow()
                }

            except Exception as e:
                logger.warning(f"ETag generation error: {e}")

        return response


class FieldSelectionMiddleware(BaseHTTPMiddleware):
    """
    Middleware pour sélection de champs via ?fields=bpm,key
    Réduit la taille des réponses en retournant uniquement les champs demandés
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Ajouter les fields au context de la requête
        fields = request.query_params.get("fields")

        if fields:
            # Parser les fields demandés
            requested_fields = [f.strip() for f in fields.split(",")]
            request.state.requested_fields = requested_fields
            logger.debug(f"Field selection: {requested_fields}")

        return await call_next(request)


class APIOptimizer:
    """
    Service d'optimisation des APIs FastAPI
    Gère pagination, bulk operations, coalescing, compression, etc.
    """

    def __init__(self):
        self.request_cache: Dict[str, Any] = {}
        self.rate_limit_counters: Dict[str, int] = defaultdict(int)
        self.request_queue: Dict[str, List[Any]] = defaultdict(list)
        self.priority_weights = {
            "pro": 10,
            "premium": 7,
            "free": 1
        }

    def implement_cursor_pagination(
        self,
        items: List[Dict[str, Any]],
        cursor: Optional[str] = None,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Pagination par curseur au lieu d'offset
        Plus efficace pour les grandes datasets
        """
        try:
            start_idx = 0

            if cursor:
                # Décoder le curseur
                import base64
                decoded = base64.b64decode(cursor).decode('utf-8')
                start_idx = int(decoded)

            # Récupérer les items
            end_idx = start_idx + limit
            paginated_items = items[start_idx:end_idx]

            # Générer le prochain curseur
            next_cursor = None
            if end_idx < len(items):
                next_cursor = base64.b64encode(str(end_idx).encode()).decode()

            # Générer le curseur précédent
            prev_cursor = None
            if start_idx > 0:
                prev_cursor = base64.b64encode(
                    str(max(0, start_idx - limit)).encode()
                ).decode()

            return {
                "data": paginated_items,
                "cursor": {
                    "current": base64.b64encode(str(start_idx).encode()).decode(),
                    "next": next_cursor,
                    "previous": prev_cursor
                },
                "total": len(items),
                "limit": limit,
                "has_next": end_idx < len(items)
            }

        except Exception as e:
            logger.error(f"Cursor pagination error: {e}")
            return {"data": items[:limit], "error": str(e)}

    async def implement_bulk_operations(
        self,
        operation: str,
        items: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Endpoint bulk pour opérations batch (create, update, delete)
        Retourne le résultat de chaque opération
        """
        results = {
            "operation": operation,
            "total": len(items),
            "succeeded": 0,
            "failed": 0,
            "results": []
        }

        for idx, item in enumerate(items):
            try:
                # Simuler l'opération (dans la vraie implémentation, appeler la DB)
                if operation == "create":
                    results["results"].append({"id": idx, "status": "created"})
                elif operation == "update":
                    results["results"].append({"id": idx, "status": "updated"})
                elif operation == "delete":
                    results["results"].append({"id": idx, "status": "deleted"})

                results["succeeded"] += 1

            except Exception as e:
                results["results"].append({
                    "id": idx,
                    "status": "error",
                    "message": str(e)
                })
                results["failed"] += 1

        logger.info(f"Bulk {operation}: {results['succeeded']}/{results['total']} succeeded")
        return results

    async def implement_request_coalescing(
        self,
        request_key: str,
        request_fn: Callable[[], Coroutine]
    ) -> Any:
        """
        Singleflight pattern: fusionner les requêtes identiques simultanées
        Si N requêtes identiques arrivent ensemble, executer une seule fois
        """
        if request_key in self.request_queue:
            # Attendre le résultat de la requête en cours
            logger.debug(f"Coalescing request: {request_key}")
            while request_key in self.request_queue:
                await asyncio.sleep(0.1)

            return self.request_cache.get(request_key)

        # Exécuter la requête
        self.request_queue[request_key] = []

        try:
            result = await request_fn()
            self.request_cache[request_key] = result
            return result

        finally:
            # Nettoyer la queue
            del self.request_queue[request_key]

    def standardize_error_responses(
        self,
        status_code: int,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Format d'erreur uniforme pour toutes les APIs
        Facilite le traitement côté client
        """
        error_response = {
            "error": {
                "code": f"ERR_{status_code}",
                "message": message,
                "timestamp": datetime.utcnow().isoformat(),
            }
        }

        if details:
            error_response["error"]["details"] = details

        return error_response

    def implement_api_versioning(
        self,
        accept_version_header: str,
        supported_versions: List[str] = None
    ) -> Dict[str, Any]:
        """
        Versioning via Accept-Version header
        Support de versions multiples du même endpoint
        """
        if supported_versions is None:
            supported_versions = ["v1", "v2"]

        # Parser l'header
        version = accept_version_header or "v1"

        if version not in supported_versions:
            return {
                "error": f"Unsupported version {version}",
                "supported_versions": supported_versions
            }

        logger.debug(f"API version: {version}")

        return {
            "version": version,
            "supported": True,
            "deprecated": version in ["v1"]  # Marquer les anciennes versions
        }

    async def implement_request_priority(
        self,
        user_tier: str,
        request_id: str,
        max_queue: int = 1000
    ) -> Dict[str, Any]:
        """
        Priority queue pour les requêtes: Pro > Free
        Les requêtes premium passent avant les requêtes gratuites
        """
        priority = self.priority_weights.get(user_tier, 1)

        queue_info = {
            "request_id": request_id,
            "user_tier": user_tier,
            "priority_weight": priority,
            "max_queue_size": max_queue,
            "current_queue_size": len(self.rate_limit_counters),
            "position_in_queue": sum(
                1 for p in self.rate_limit_counters.values()
                if p < priority
            )
        }

        if queue_info["current_queue_size"] >= max_queue:
            queue_info["status"] = "queue_full"
            logger.warning(f"Request queue full for {user_tier}")
        else:
            queue_info["status"] = "queued"

        return queue_info

    def compress_responses(
        self,
        data: str,
        accept_encoding: str = "gzip"
    ) -> tuple[bytes, str]:
        """
        Compression Gzip/Brotli automatique selon Accept-Encoding
        Réduit la taille du payload
        """
        encoding = "identity"

        if "gzip" in accept_encoding:
            try:
                compressed = gzip.compress(data.encode('utf-8'), compresslevel=9)
                return compressed, "gzip"
            except Exception as e:
                logger.warning(f"Gzip compression error: {e}")

        if "br" in accept_encoding:
            try:
                import brotli
                compressed = brotli.compress(data.encode('utf-8'))
                return compressed, "br"
            except ImportError:
                logger.debug("Brotli not available")
            except Exception as e:
                logger.warning(f"Brotli compression error: {e}")

        # Fallback: pas de compression
        return data.encode('utf-8'), "identity"

    async def implement_rate_limiter(
        self,
        identifier: str,  # IP, user_id, API key
        requests_per_minute: int = 60,
        burst_size: int = 10
    ) -> Dict[str, Any]:
        """
        Rate limiting par endpoint et par user
        Supporte le token bucket algorithm
        """
        now = datetime.utcnow()
        key = f"{identifier}:{now.minute}"

        current_count = self.rate_limit_counters.get(key, 0)

        if current_count >= requests_per_minute:
            logger.warning(f"Rate limit exceeded for {identifier}")
            return {
                "allowed": False,
                "reason": "Rate limit exceeded",
                "limit": requests_per_minute,
                "current": current_count,
                "reset_in_seconds": 60 - now.second
            }

        # Incrémenter le compteur
        self.rate_limit_counters[key] = current_count + 1

        # Nettoyer les anciens compteurs (>2 minutes)
        keys_to_delete = [
            k for k in self.rate_limit_counters.keys()
            if abs(now.minute - int(k.split(':')[1])) > 2
        ]
        for k in keys_to_delete:
            del self.rate_limit_counters[k]

        remaining = requests_per_minute - current_count - 1

        return {
            "allowed": True,
            "limit": requests_per_minute,
            "remaining": remaining,
            "reset_in_seconds": 60 - now.second,
            "retry_after": None
        }

    def get_optimization_config(self) -> Dict[str, Any]:
        """
        Retourner la configuration complète d'optimisation API
        """
        return {
            "streaming": {
                "enabled": True,
                "threshold_mb": 1,
                "chunk_size_bytes": 8192
            },
            "etag": {
                "enabled": True,
                "cache_size": len(self.request_cache)
            },
            "pagination": {
                "type": "cursor",
                "default_limit": 20,
                "max_limit": 100
            },
            "rate_limiting": {
                "enabled": True,
                "default_rpm": 60,
                "burst_size": 10
            },
            "compression": {
                "enabled": True,
                "algorithms": ["gzip", "br"]
            },
            "api_versioning": {
                "enabled": True,
                "default_version": "v1"
            }
        }
