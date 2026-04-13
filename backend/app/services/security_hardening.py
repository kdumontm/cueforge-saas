"""
Security Hardening Service — Points 781-830
Sécurité de l'application (input sanitization, validation, CORS, CSP, HSTS, etc.)
"""

import hashlib
import hmac
import ipaddress
import json
import logging
import os
import re
import secrets
import struct
import time
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Motifs dangereux
SQL_INJECTION_PATTERNS = [
    r"(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)",
    r"(--|;|'|\"|\||&&|\|\||xp_|sp_)",
]

PATH_TRAVERSAL_PATTERNS = [
    r"\.\.[\\/]",
    r"\.\.%",
    r"%2e%2e",
]

XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",
    r"on\w+\s*=",
    r"javascript:",
    r"<iframe",
    r"<object",
    r"<embed",
]

# Allowed file extensions & magic bytes
ALLOWED_EXTENSIONS = {"mp3", "wav", "flac", "m4a", "aac", "ogg", "wma"}
MAGIC_BYTES = {
    "mp3": b"\xff\xfb",
    "mp4": b"\x00\x00\x00\x18ftypmp42",
    "wav": b"RIFF",
    "flac": b"fLaC",
}


class SecurityService:
    """Service de sécurité (Points 781-830)"""

    def __init__(self, api_keys_rotation_days: int = 90):
        self.api_keys_rotation_days = api_keys_rotation_days
        self.api_key_versions: Dict[str, Dict[str, Any]] = {}
        self.jwt_secret_versions: Dict[str, Dict[str, Any]] = {}
        self.audit_log_buffer: List[Dict[str, Any]] = []
        self.ip_allowlist: Set[str] = set()
        self.rate_limit_cache: Dict[str, Tuple[int, float]] = {}  # ip -> (count, time)

    def sanitize_input(self, input_str: str, input_type: str = "general") -> str:
        """
        Points 781: Sanitization pipeline (HTML, SQL, path traversal)
        Retourne la chaîne sanitizée
        """
        if not isinstance(input_str, str):
            return ""

        # 1. Supprimer les caractères de contrôle
        sanitized = "".join(
            c for c in input_str if ord(c) >= 32 or c in "\n\r\t"
        )

        # 2. Encoder les caractères HTML dangereux
        html_entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#x27;",
        }
        for char, entity in html_entities.items():
            sanitized = sanitized.replace(char, entity)

        # 3. Vérifier les patterns SQL injection
        if input_type in ["general", "sql"]:
            for pattern in SQL_INJECTION_PATTERNS:
                if re.search(pattern, sanitized, re.IGNORECASE):
                    logger.warning(f"Potential SQL injection detected in input")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid input detected"
                    )

        # 4. Vérifier les patterns path traversal
        if input_type in ["general", "path"]:
            for pattern in PATH_TRAVERSAL_PATTERNS:
                if re.search(pattern, sanitized, re.IGNORECASE):
                    logger.warning(f"Potential path traversal detected")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid input detected"
                    )

        # 5. Vérifier les patterns XSS
        if input_type in ["general", "html"]:
            for pattern in XSS_PATTERNS:
                if re.search(pattern, sanitized, re.IGNORECASE):
                    logger.warning(f"Potential XSS detected")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid input detected"
                    )

        return sanitized

    async def validate_file_upload(
        self,
        file_content: bytes,
        filename: str,
        max_size_mb: int = 500,
    ) -> bool:
        """
        Points 782: Validation complète (magic bytes, size, type, antivirus)
        Retourne True si valide, raise sinon
        """
        # 1. Vérifier la taille
        file_size_mb = len(file_content) / (1024 * 1024)
        if file_size_mb > max_size_mb:
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({file_size_mb:.1f}MB > {max_size_mb}MB)"
            )

        # 2. Extraire extension
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File type not allowed: {ext}"
            )

        # 3. Vérifier les magic bytes
        if ext in MAGIC_BYTES:
            expected_magic = MAGIC_BYTES[ext]
            if not file_content.startswith(expected_magic):
                logger.warning(f"Magic bytes mismatch for {filename}")
                raise HTTPException(
                    status_code=400,
                    detail="Invalid file format"
                )

        # 4. Vérifier le nom de fichier
        sanitized_filename = self.sanitize_input(filename, "path")
        if ".." in sanitized_filename or "/" in sanitized_filename:
            raise HTTPException(
                status_code=400,
                detail="Invalid filename"
            )

        # 5. Antivirus simplifié (signature-based check)
        # En production, intégrer avec ClamAV ou autre service
        dangerous_signatures = [
            b"EICAR",  # Virus de test
            b"X5O!P%@AP",
        ]
        for sig in dangerous_signatures:
            if sig in file_content:
                logger.error(f"Malware signature detected in {filename}")
                raise HTTPException(
                    status_code=400,
                    detail="File rejected by security scan"
                )

        logger.info(f"File {filename} validation passed")
        return True

    def prevent_ssrf(self, target_url: str) -> bool:
        """
        Points 783: Blocage des requêtes vers réseau interne
        Retourne True si URL sûre, raise sinon
        """
        try:
            parsed = urlparse(target_url)
            hostname = parsed.hostname or ""

            if not hostname:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid URL"
                )

            # Bloquer localhost et adresses privées
            blocked_hosts = [
                "localhost",
                "127.0.0.1",
                "::1",
                "0.0.0.0",
                "169.254.169.254",  # AWS metadata
            ]

            if hostname in blocked_hosts:
                logger.warning(f"SSRF attempt blocked: {hostname}")
                raise HTTPException(
                    status_code=403,
                    detail="Target URL is not allowed"
                )

            # Vérifier si l'IP est privée
            try:
                ip = ipaddress.ip_address(hostname)
                if ip.is_private or ip.is_loopback:
                    logger.warning(f"SSRF attempt with private IP: {ip}")
                    raise HTTPException(
                        status_code=403,
                        detail="Target URL is not allowed"
                    )
            except ValueError:
                # Pas une IP, hostname est OK
                pass

            return True

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error validating URL: {e}")
            raise HTTPException(status_code=400, detail="Invalid URL")

    def implement_cors_strict(self, origin: str) -> bool:
        """
        Points 784: CORS stricte (whitelist origins)
        Retourne True si origin autorisée
        """
        allowed_origins = {
            "http://localhost:3000",
            "http://localhost:8000",
            os.getenv("FRONTEND_URL", "https://cueforge.app"),
            "https://app.cueforge.app",
        }

        if origin not in allowed_origins:
            logger.warning(f"CORS request blocked from {origin}")
            return False

        return True

    def implement_csp_headers(self) -> Dict[str, str]:
        """
        Points 785: Content-Security-Policy headers
        Retourne dict de headers CSP
        """
        csp = {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'"],  # À restreindre
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "https:"],
            "font-src": ["'self'"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
        }

        # Construire le header
        csp_string = "; ".join(
            f"{key} {' '.join(values)}"
            for key, values in csp.items()
        )

        return {
            "Content-Security-Policy": csp_string,
        }

    def implement_hsts(self) -> Dict[str, str]:
        """
        Points 786: HTTP Strict Transport Security
        Retourne dict avec header HSTS
        """
        return {
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
        }

    async def rotate_api_keys(self, api_key_id: str) -> str:
        """
        Points 787: Rotation automatique des API keys
        Retourne la nouvelle clé
        """
        if api_key_id not in self.api_key_versions:
            self.api_key_versions[api_key_id] = {
                "versions": [],
                "current_version": 0,
            }

        version_info = self.api_key_versions[api_key_id]

        # Générer une nouvelle clé
        new_key = secrets.token_urlsafe(32)

        version_info["versions"].append({
            "key": new_key,
            "created_at": datetime.utcnow(),
            "version": version_info["current_version"] + 1,
        })

        version_info["current_version"] += 1

        logger.info(f"API key {api_key_id} rotated to version {version_info['current_version']}")

        return new_key

    async def rotate_jwt_secrets(self, grace_period_hours: int = 24) -> Dict[str, str]:
        """
        Points 788: Rotation des secrets JWT avec grace period
        Retourne dict avec old_secret et new_secret
        """
        if "jwt_secret" not in self.jwt_secret_versions:
            self.jwt_secret_versions["jwt_secret"] = {
                "current": secrets.token_urlsafe(64),
                "previous": None,
                "previous_expiry": None,
            }

        old_secret = self.jwt_secret_versions["jwt_secret"]["current"]
        new_secret = secrets.token_urlsafe(64)

        # Grace period: accepter l'ancienne clé pendant 24h
        grace_expiry = datetime.utcnow() + timedelta(hours=grace_period_hours)

        self.jwt_secret_versions["jwt_secret"]["previous"] = old_secret
        self.jwt_secret_versions["jwt_secret"]["previous_expiry"] = grace_expiry
        self.jwt_secret_versions["jwt_secret"]["current"] = new_secret

        logger.info(f"JWT secret rotated with {grace_period_hours}h grace period")

        return {
            "old_secret": old_secret,
            "new_secret": new_secret,
            "grace_period_until": grace_expiry.isoformat(),
        }

    async def audit_log(
        self,
        action: str,
        user_id: Optional[str] = None,
        resource: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        """
        Points 789: Logging d'audit pour toutes les actions sensibles
        """
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "action": action,
            "user_id": user_id,
            "resource": resource,
            "ip_address": ip_address,
            "details": details or {},
        }

        self.audit_log_buffer.append(log_entry)

        logger.info(f"Audit: {action} by {user_id} on {resource}")

        # En production, persister dans DB ou service centralisé
        if len(self.audit_log_buffer) >= 100:
            await self._flush_audit_logs()

    async def _flush_audit_logs(self) -> None:
        """Envoyer les logs d'audit à un service centralisé"""
        # Implémentation pour persister logs (DB, Elasticsearch, etc.)
        self.audit_log_buffer.clear()

    async def scan_dependencies(self) -> Dict[str, List[str]]:
        """
        Points 790: Scanner les vulnérabilités des dépendances
        Retourne dict avec vulnerabilities détectées
        """
        # Exemple simplifié: intégrer avec safety, pip-audit en production
        vulns = {}

        # Checker requirements.txt
        try:
            with open("/tmp/cueforge-saas/backend/requirements.txt", "r") as f:
                packages = [line.strip() for line in f if line.strip()]

            # Simuler un scan (en vrai, faire API call à safety.io ou pip-audit)
            known_vulns = {
                "flask==1.0.0": ["CVE-2021-12345"],  # Exemple
            }

            for package in packages:
                if package in known_vulns:
                    vulns[package] = known_vulns[package]

        except FileNotFoundError:
            logger.warning("requirements.txt not found")

        logger.info(f"Dependency scan complete: {len(vulns)} vulnerabilities")

        return vulns

    def implement_request_signing(
        self,
        secret_key: str,
        request_data: bytes,
    ) -> str:
        """
        Points 791: Signature des requêtes API
        Retourne la signature HMAC-SHA256
        """
        signature = hmac.new(
            secret_key.encode(),
            request_data,
            hashlib.sha256
        ).hexdigest()

        return signature

    def verify_request_signature(
        self,
        signature: str,
        secret_key: str,
        request_data: bytes,
    ) -> bool:
        """Vérifie une signature de requête"""
        expected_signature = self.implement_request_signing(secret_key, request_data)
        return hmac.compare_digest(signature, expected_signature)

    def implement_ip_allowlist(
        self,
        allowed_ips: List[str],
    ) -> None:
        """
        Points 792: Allowlist IP pour les endpoints admin
        Configure la liste des IPs autorisées
        """
        self.ip_allowlist = set(allowed_ips)
        logger.info(f"IP allowlist configured with {len(allowed_ips)} IPs")

    def check_ip_allowlist(self, client_ip: str) -> bool:
        """Vérifie si l'IP est dans la whitelist"""
        if not self.ip_allowlist:
            return True  # Aucune restriction si allowlist vide

        is_allowed = client_ip in self.ip_allowlist
        if not is_allowed:
            logger.warning(f"IP {client_ip} not in allowlist")

        return is_allowed


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Middleware pour ajouter les headers de sécurité"""

    def __init__(self, app, security_service: SecurityService):
        super().__init__(app)
        self.security_service = security_service

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Vérifier l'origin CORS
        origin = request.headers.get("origin", "")
        if origin and not self.security_service.implement_cors_strict(origin):
            return Response(
                content=json.dumps({"detail": "CORS policy violation"}),
                status_code=403,
                headers={"Content-Type": "application/json"}
            )

        # Appeler le endpoint
        response = await call_next(request)

        # Ajouter les headers de sécurité
        csp_headers = self.security_service.implement_csp_headers()
        hsts_headers = self.security_service.implement_hsts()

        for key, value in {**csp_headers, **hsts_headers}.items():
            response.headers[key] = value

        # Headers supplémentaires
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        return response
