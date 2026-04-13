"""
DevOps endpoints — deployment config, CI/CD, testing, and documentation.
Wires deployment_config, ci_cd_config, testing_service, documentation_service services.

Endpoints:
- GET /api/v1/devops/deployment-config  → Railway deployment configuration
- GET /api/v1/devops/ci-cd               → GitHub Actions CI/CD configuration
- GET /api/v1/devops/tests/orchestrate   → Test orchestration plan
- GET /api/v1/devops/docs/openapi-spec   → OpenAPI specification
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/v1/devops", tags=["devops"])


@router.get("/deployment-config")
async def get_deployment_config(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Configuration de déploiement Railway."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        from app.services.deployment_config import DeploymentConfig
        config = DeploymentConfig()
        return config.generate_railway_config()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.get("/ci-cd")
async def get_ci_config(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Configuration CI/CD GitHub Actions."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        from app.services.ci_cd_config import CICDConfig
        config = CICDConfig()
        return config.generate_github_actions()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.get("/tests/orchestrate")
async def get_test_config(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Configuration des tests E2E/performance."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        from app.services.testing_service import TestingService
        orch = TestingService()
        return {"status": "ok", "methods": ["run_e2e_tests", "check_performance_budgets", "run_security_scan", "check_code_coverage"]}
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


@router.get("/docs/openapi-spec")
async def get_api_docs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Spécification OpenAPI générée."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    try:
        from app.services.documentation_service import DocumentationService
        gen = DocumentationService()
        return gen.generate_openapi_spec()
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}
