"""
Deployment configuration management for TrackCue infrastructure.
Handles Dockerfile generation, Railway config, health checks, SSL, scaling, etc.
"""

import os
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum


class DeploymentStage(Enum):
    """Deployment stages"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


@dataclass
class HealthCheckConfig:
    """Health check configuration"""
    enabled: bool = True
    path: str = "/health"
    interval_seconds: int = 30
    timeout_seconds: int = 10
    failure_threshold: int = 3
    success_threshold: int = 1


@dataclass
class ResourceLimits:
    """Resource constraints for services"""
    cpu_cores: float = 1.0
    memory_mb: int = 512
    max_connections: int = 100
    request_timeout_seconds: int = 30


@dataclass
class CDNConfig:
    """CDN configuration for static assets"""
    enabled: bool = True
    provider: str = "cloudflare"  # cloudflare, aws-cloudfront, etc.
    cache_ttl_seconds: int = 86400  # 24 hours
    compress: bool = True
    enable_brotli: bool = True


@dataclass
class SSLConfig:
    """SSL/TLS configuration"""
    enabled: bool = True
    min_version: str = "TLSv1.2"
    hsts_max_age: int = 31536000  # 1 year
    hsts_include_subdomains: bool = True
    hsts_preload: bool = True


class DeploymentConfig:
    """
    Main deployment configuration class for TrackCue.
    Generates Dockerfile, Railway config, health checks, SSL, scaling rules, etc.
    """

    def __init__(
        self,
        stage: DeploymentStage = DeploymentStage.PRODUCTION,
        app_name: str = "trackcue",
    ):
        self.stage = stage
        self.app_name = app_name
        self.health_check = HealthCheckConfig()
        self.resource_limits = ResourceLimits()
        self.cdn_config = CDNConfig()
        self.ssl_config = SSLConfig()

    def generate_dockerfile(self, python_version: str = "3.11") -> str:
        """
        Generate optimized multi-stage Dockerfile for TrackCue backend.
        Uses builder stage for dependencies, minimal runtime stage.

        Returns:
            str: Complete Dockerfile content
        """
        dockerfile = f"""# Multi-stage build for TrackCue backend
# Stage 1: Builder
FROM python:{python_version}-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    g++ \\
    libffi-dev \\
    libssl-dev \\
    python3-dev \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:{python_version}-slim

WORKDIR /app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \\
    libffi8 \\
    libssl3 \\
    ffmpeg \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r trackcue && useradd -r -g trackcue trackcue

# Copy Python dependencies from builder
COPY --from=builder /root/.local /home/trackcue/.local
ENV PATH=/home/trackcue/.local/bin:$PATH

# Copy application code
COPY backend/ /app/

# Set ownership
RUN chown -R trackcue:trackcue /app

USER trackcue

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \\
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Run application with gunicorn
CMD ["gunicorn", "app.main:app", "--workers", "4", "--worker-class", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000", "--timeout", "120"]
"""
        return dockerfile

    def generate_railway_config(self) -> Dict[str, Any]:
        """
        Generate Railway.app deployment configuration with health checks
        and resource scaling.

        Returns:
            dict: Railway configuration JSON
        """
        config = {
            "name": self.app_name,
            "builder": "dockerfile",
            "buildCommand": None,
            "startCommand": None,
            "environmentVariables": {
                "PYTHONUNBUFFERED": "1",
                "PYTHONHASHSEED": "random",
                "ENVIRONMENT": self.stage.value,
            },
            "services": {
                "backend": {
                    "dockerfilePath": "Dockerfile",
                    "healthcheck": {
                        "path": self.health_check.path,
                        "interval": self.health_check.interval_seconds,
                        "timeout": self.health_check.timeout_seconds,
                        "successThreshold": self.health_check.success_threshold,
                        "failureThreshold": self.health_check.failure_threshold,
                    },
                    "resources": {
                        "cpu": str(self.resource_limits.cpu_cores),
                        "memory": f"{self.resource_limits.memory_mb}Mi",
                    },
                },
                "postgres": {
                    "image": "postgres:15",
                    "environmentVariables": {
                        "POSTGRES_DB": self.app_name,
                        "POSTGRES_USER": self.app_name,
                    },
                    "volumes": [
                        {
                            "name": "postgres-data",
                            "mountPath": "/var/lib/postgresql/data",
                        }
                    ],
                },
            },
        }

        # Add scaling configuration for production
        if self.stage == DeploymentStage.PRODUCTION:
            config["services"]["backend"]["scaling"] = {
                "minInstances": 2,
                "maxInstances": 10,
                "targetCPUUtilization": 70,
                "targetMemoryUtilization": 80,
            }

        return config

    def create_health_endpoints(self) -> str:
        """
        Generate health check endpoint code for FastAPI.
        Creates /health, /ready, and /live endpoints.

        Returns:
            str: FastAPI router code
        """
        code = '''"""
Health check endpoints for deployment monitoring.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from datetime import datetime
import os

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/health")
async def health_check() -> dict:
    """
    Basic health check endpoint.
    Returns service status and timestamp.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": os.getenv("APP_VERSION", "unknown"),
    }


@router.get("/ready")
async def readiness_check(db: AsyncSession = Depends(get_db)) -> dict:
    """
    Readiness check - verifies database connectivity.
    Used by load balancers to route traffic.
    """
    try:
        # Test database connectivity
        await db.execute("SELECT 1")
        return {
            "status": "ready",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {
            "status": "not_ready",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }, 503


@router.get("/live")
async def liveness_check() -> dict:
    """
    Liveness check - simple indicator that service is alive.
    Kubernetes uses this to restart unhealthy containers.
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat(),
    }
'''
        return code

    def configure_resource_limits(self) -> Dict[str, Any]:
        """
        Generate resource limit configuration for containers.
        CPU and memory constraints per service.

        Returns:
            dict: Resource limits configuration
        """
        return {
            "backend": {
                "cpu": {
                    "request": "500m",
                    "limit": f"{int(self.resource_limits.cpu_cores * 1000)}m",
                },
                "memory": {
                    "request": f"{int(self.resource_limits.memory_mb * 0.8)}Mi",
                    "limit": f"{self.resource_limits.memory_mb}Mi",
                },
                "timeout": f"{self.resource_limits.request_timeout_seconds}s",
            },
            "database": {
                "cpu": {"request": "250m", "limit": "1000m"},
                "memory": {"request": "256Mi", "limit": "1024Mi"},
            },
            "cache": {
                "cpu": {"request": "100m", "limit": "500m"},
                "memory": {"request": "128Mi", "limit": "512Mi"},
            },
        }

    def configure_cdn(self) -> Dict[str, Any]:
        """
        Generate CDN configuration for static assets and API responses.
        Includes cache control headers and compression settings.

        Returns:
            dict: CDN configuration
        """
        return {
            "enabled": self.cdn_config.enabled,
            "provider": self.cdn_config.provider,
            "caching": {
                "rules": [
                    {
                        "path": "/static/*",
                        "ttl": self.cdn_config.cache_ttl_seconds,
                        "compress": self.cdn_config.compress,
                        "enable_brotli": self.cdn_config.enable_brotli,
                    },
                    {
                        "path": "/api/v1/*",
                        "ttl": 300,  # 5 minutes for API
                        "compress": True,
                    },
                    {
                        "path": "/public/*",
                        "ttl": 86400,  # 24 hours for public assets
                        "compress": True,
                    },
                ],
            },
            "headers": {
                "Cache-Control": f"public, max-age={self.cdn_config.cache_ttl_seconds}",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "SAMEORIGIN",
                "X-XSS-Protection": "1; mode=block",
            },
        }

    def configure_ssl(self) -> Dict[str, Any]:
        """
        Generate SSL/TLS configuration for HTTPS.
        Includes HSTS headers and security best practices.

        Returns:
            dict: SSL configuration
        """
        return {
            "enabled": self.ssl_config.enabled,
            "min_version": self.ssl_config.min_version,
            "headers": {
                "Strict-Transport-Security": (
                    f"max-age={self.ssl_config.hsts_max_age}; "
                    f"includeSubDomains"
                    f"{'; preload' if self.ssl_config.hsts_preload else ''}"
                ),
                "Content-Security-Policy": (
                    "default-src 'self'; "
                    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                    "style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data: https:; "
                    "font-src 'self' data:;"
                ),
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "X-XSS-Protection": "1; mode=block",
                "Referrer-Policy": "strict-origin-when-cross-origin",
            },
        }

    def configure_connection_pool(self) -> Dict[str, Any]:
        """
        Configure database connection pooling for optimal performance.

        Returns:
            dict: Connection pool configuration
        """
        return {
            "pool_size": 20,
            "max_overflow": 40,
            "pool_recycle": 3600,  # Recycle connections after 1 hour
            "pool_pre_ping": True,  # Test connections before use
            "echo": False,  # Disable SQL query logging in production
            "pool_timeout": 30,
            "pool_connect_args": {
                "timeout": 10,
                "check_same_thread": False,
            },
        }

    def generate_env_template(self) -> str:
        """
        Generate .env.example template with all required environment variables.

        Returns:
            str: Environment variables template
        """
        template = """# TrackCue Environment Configuration Template
# Copy this file to .env and fill in your actual values

# Application
ENVIRONMENT=production
APP_NAME=TrackCue
APP_VERSION=1.0.0
DEBUG=false
SECRET_KEY=your-secret-key-here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/trackcue
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=40

# API Keys (External Services)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-secret
MUSICBRAINZ_API_KEY=your-musicbrainz-key
ACOUSTID_API_KEY=your-acoustid-key
ITUNES_API_KEY=your-itunes-key
LASTFM_API_KEY=your-lastfm-key

# Frontend
NEXT_PUBLIC_API_URL=https://api.trackcue.app
NEXT_PUBLIC_ENVIRONMENT=production

# Email Service
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-email-password
SUPPORT_EMAIL=support@trackcue.app

# Cloud Storage
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
AWS_S3_BUCKET=trackcue-assets
AWS_REGION=us-east-1

# Redis Cache
REDIS_URL=redis://localhost:6379/0
CACHE_TTL_SECONDS=3600

# Security
CORS_ORIGINS=https://trackcue.app,https://www.trackcue.app
ALLOWED_HOSTS=trackcue.app,www.trackcue.app,api.trackcue.app

# Deployment
RAILWAY_ENVIRONMENT=production
RAILWAY_STATIC_URL=https://assets.trackcue.app

# Monitoring & Logging
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=INFO
OBSERVABILITY_ENABLED=true
"""
        return template

    def configure_graceful_shutdown(self) -> str:
        """
        Generate graceful shutdown handler code for proper cleanup on SIGTERM.

        Returns:
            str: Shutdown handler code
        """
        code = '''"""
Graceful shutdown handling for safe server termination.
"""

import asyncio
import signal
from typing import Callable, List
from fastapi import FastAPI
import logging

logger = logging.getLogger(__name__)


class GracefulShutdownManager:
    """Manages graceful shutdown with cleanup handlers."""

    def __init__(self, app: FastAPI):
        self.app = app
        self.shutdown_handlers: List[Callable] = []
        self.is_shutting_down = False

    def add_shutdown_handler(self, handler: Callable) -> None:
        """Register a shutdown cleanup handler."""
        self.shutdown_handlers.append(handler)

    async def shutdown(self, signum: int = None) -> None:
        """Execute all shutdown handlers and cleanup."""
        logger.info("Received shutdown signal, starting graceful shutdown...")
        self.is_shutting_down = True

        # Execute all registered handlers
        for handler in self.shutdown_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    handler()
            except Exception as e:
                logger.error(f"Error during shutdown handler: {e}")

        logger.info("Graceful shutdown complete")

    def setup_signal_handlers(self, loop) -> None:
        """Setup SIGTERM and SIGINT handlers."""
        for sig in [signal.SIGTERM, signal.SIGINT]:
            loop.add_signal_handler(
                sig,
                lambda: asyncio.create_task(self.shutdown(sig))
            )
'''
        return code

    def configure_auto_scaling(self) -> Dict[str, Any]:
        """
        Generate auto-scaling rules based on CPU and queue metrics.

        Returns:
            dict: Auto-scaling configuration
        """
        return {
            "enabled": True,
            "metrics": [
                {
                    "name": "cpu_utilization",
                    "target": 70,  # Target 70% CPU
                    "scale_up_threshold": 80,
                    "scale_down_threshold": 30,
                    "evaluation_periods": 2,
                    "datapoints_to_alarm": 2,
                },
                {
                    "name": "memory_utilization",
                    "target": 80,  # Target 80% memory
                    "scale_up_threshold": 90,
                    "scale_down_threshold": 40,
                },
                {
                    "name": "request_queue_length",
                    "target": 10,  # Target queue of 10 requests
                    "scale_up_threshold": 20,
                    "scale_down_threshold": 5,
                },
            ],
            "scaling_actions": {
                "scale_up": {
                    "min_capacity": 2,
                    "max_capacity": 10,
                    "cooldown_seconds": 300,  # 5 minutes
                    "adjustment": 1,  # Add 1 instance
                },
                "scale_down": {
                    "cooldown_seconds": 600,  # 10 minutes
                    "adjustment": 1,  # Remove 1 instance
                },
            },
        }

    def to_dict(self) -> Dict[str, Any]:
        """
        Export complete deployment configuration as dictionary.

        Returns:
            dict: Complete configuration
        """
        return {
            "stage": self.stage.value,
            "app_name": self.app_name,
            "health_check": asdict(self.health_check),
            "resource_limits": asdict(self.resource_limits),
            "cdn": asdict(self.cdn_config),
            "ssl": asdict(self.ssl_config),
            "railway": self.generate_railway_config(),
            "resource_limits_detailed": self.configure_resource_limits(),
            "connection_pool": self.configure_connection_pool(),
            "auto_scaling": self.configure_auto_scaling(),
        }

    def to_json(self, indent: int = 2) -> str:
        """Export configuration as JSON string."""
        return json.dumps(self.to_dict(), indent=indent)


# Factory function for creating environment-specific configs
def create_deployment_config(stage: str = "production") -> DeploymentConfig:
    """
    Factory function to create deployment config for specific stage.

    Args:
        stage: "development", "staging", or "production"

    Returns:
        DeploymentConfig: Configured deployment instance
    """
    stage_enum = DeploymentStage(stage.lower())
    config = DeploymentConfig(stage=stage_enum)

    # Adjust resource limits based on stage
    if stage_enum == DeploymentStage.DEVELOPMENT:
        config.resource_limits.cpu_cores = 0.5
        config.resource_limits.memory_mb = 256
    elif stage_enum == DeploymentStage.STAGING:
        config.resource_limits.cpu_cores = 1.0
        config.resource_limits.memory_mb = 512
    else:  # PRODUCTION
        config.resource_limits.cpu_cores = 2.0
        config.resource_limits.memory_mb = 1024

    return config
