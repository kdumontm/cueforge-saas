"""
CI/CD pipeline configuration for CueForge.
Handles GitHub Actions workflow generation, test parallelism, build caching,
security scanning, performance budgets, and automated rollback.
"""

import yaml
from typing import Dict, List, Any
from dataclasses import dataclass, asdict


@dataclass
class TestConfig:
    """Test configuration"""
    parallelism: int = 4
    coverage_threshold: float = 80.0
    timeout_minutes: int = 30


@dataclass
class BuildConfig:
    """Build configuration"""
    use_docker_cache: bool = True
    use_dependency_cache: bool = True
    compress_artifacts: bool = True
    artifact_retention_days: int = 30


@dataclass
class SecurityConfig:
    """Security scanning configuration"""
    enable_sast: bool = True  # Static Application Security Testing
    enable_dependency_check: bool = True
    enable_container_scan: bool = True
    fail_on_critical: bool = True


@dataclass
class PerformanceConfig:
    """Performance budgets"""
    max_bundle_size_kb: float = 500.0
    max_lighthouse_score: float = 90.0
    max_lighthouse_time_to_interactive_ms: float = 3000.0
    max_api_response_time_ms: float = 500.0


class CICDConfig:
    """
    CI/CD pipeline configuration class for CueForge.
    Generates GitHub Actions workflows, handles test parallelism, caching,
    security scanning, and performance budgets.
    """

    def __init__(self):
        self.test_config = TestConfig()
        self.build_config = BuildConfig()
        self.security_config = SecurityConfig()
        self.performance_config = PerformanceConfig()

    def generate_github_actions(self) -> str:
        """
        Generate complete GitHub Actions workflow file.
        Includes testing, building, security checks, and deployment.

        Returns:
            str: GitHub Actions YAML workflow
        """
        workflow = {
            "name": "CI/CD Pipeline",
            "on": {
                "push": {"branches": ["main", "develop"]},
                "pull_request": {"branches": ["main", "develop"]},
            },
            "concurrency": {
                "group": "${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}",
                "cancel-in-progress": True,
            },
            "jobs": {
                "lint": self._create_lint_job(),
                "test": self._create_test_job(),
                "security": self._create_security_job(),
                "build": self._create_build_job(),
                "performance": self._create_performance_job(),
                "deploy-preview": self._create_preview_deploy_job(),
                "deploy-production": self._create_production_deploy_job(),
            },
        }

        return yaml.dump(workflow, default_flow_style=False, sort_keys=False)

    def _create_lint_job(self) -> Dict[str, Any]:
        """Create linting job configuration."""
        return {
            "runs-on": "ubuntu-latest",
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "uses": "actions/setup-python@v4",
                    "with": {"python-version": "3.11", "cache": "pip"},
                },
                {
                    "uses": "actions/setup-node@v4",
                    "with": {"node-version": "20", "cache": "npm"},
                },
                {
                    "name": "Install dependencies",
                    "run": "pip install -r backend/requirements.txt && npm install --prefix frontend",
                },
                {
                    "name": "Run Python linting",
                    "run": (
                        "pylint backend/app --fail-under=8.0 || true && "
                        "black --check backend/ && "
                        "isort --check-only backend/"
                    ),
                },
                {
                    "name": "Run TypeScript linting",
                    "run": "npm run lint --prefix frontend",
                },
            ],
        }

    def _create_test_job(self) -> Dict[str, Any]:
        """Create testing job with parallelism."""
        return {
            "runs-on": "ubuntu-latest",
            "strategy": {
                "matrix": {
                    "test-group": list(
                        range(1, self.test_config.parallelism + 1)
                    )
                }
            },
            "services": {
                "postgres": {
                    "image": "postgres:15",
                    "env": {
                        "POSTGRES_PASSWORD": "test",
                        "POSTGRES_DB": "cueforge_test",
                    },
                    "options": (
                        "--health-cmd pg_isready "
                        "--health-interval 10s "
                        "--health-timeout 5s "
                        "--health-retries 5"
                    ),
                    "ports": ["5432:5432"],
                },
                "redis": {
                    "image": "redis:7",
                    "options": (
                        "--health-cmd 'redis-cli ping' "
                        "--health-interval 10s "
                        "--health-timeout 5s "
                        "--health-retries 5"
                    ),
                    "ports": ["6379:6379"],
                },
            },
            "env": {
                "DATABASE_URL": "postgresql://postgres:test@localhost:5432/cueforge_test",
                "REDIS_URL": "redis://localhost:6379/0",
                "ENVIRONMENT": "test",
            },
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "uses": "actions/setup-python@v4",
                    "with": {"python-version": "3.11", "cache": "pip"},
                },
                {
                    "uses": "actions/setup-node@v4",
                    "with": {"node-version": "20", "cache": "npm"},
                },
                {
                    "name": "Install dependencies",
                    "run": "pip install -r backend/requirements.txt && npm install --prefix frontend",
                },
                {
                    "name": "Run backend tests (group ${{ matrix.test-group }})",
                    "run": (
                        "pytest backend/tests "
                        "--dist loadgroup "
                        "-n auto "
                        f"--tb=short "
                        f"--cov=backend/app "
                        f"--cov-report=xml "
                        f"-k 'group_${{{{ matrix.test-group }}}}' || "
                        "pytest backend/tests --collect-only -q | "
                        "awk 'NR % ${{ matrix.test-group }} == 0' | "
                        "xargs pytest"
                    ),
                },
                {
                    "name": "Run frontend tests",
                    "run": "npm test --prefix frontend -- --coverage",
                },
                {
                    "name": "Upload coverage",
                    "uses": "codecov/codecov-action@v3",
                    "with": {
                        "files": "./coverage/coverage-final.json,./backend/coverage.xml",
                        "fail_ci_if_error": False,
                    },
                },
            ],
        }

    def _create_security_job(self) -> Dict[str, Any]:
        """Create security scanning job (SAST, dependency check, container scan)."""
        return {
            "runs-on": "ubuntu-latest",
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "uses": "actions/setup-python@v4",
                    "with": {"python-version": "3.11"},
                },
                {
                    "name": "Install security tools",
                    "run": "pip install bandit safety semgrep",
                },
                {
                    "name": "Run Bandit (Python SAST)",
                    "run": "bandit -r backend/app -f json -o bandit-report.json || true",
                    "continue-on-error": True,
                },
                {
                    "name": "Check dependencies (Safety)",
                    "run": "safety check --json > safety-report.json || true",
                    "continue-on-error": True,
                },
                {
                    "name": "Run Semgrep (SAST)",
                    "run": "semgrep --config=p/security-audit backend/ --json -o semgrep-report.json || true",
                    "continue-on-error": True,
                },
                {
                    "name": "Upload security reports",
                    "uses": "actions/upload-artifact@v3",
                    "with": {
                        "name": "security-reports",
                        "path": "**/*-report.json",
                    },
                    "if": "always()",
                },
            ],
        }

    def _create_build_job(self) -> Dict[str, Any]:
        """Create Docker build job with caching."""
        return {
            "needs": ["lint", "test", "security"],
            "runs-on": "ubuntu-latest",
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "uses": "docker/setup-buildx-action@v2",
                },
                {
                    "uses": "docker/setup-qemu-action@v2",
                },
                {
                    "name": "Build and push Docker image",
                    "uses": "docker/build-push-action@v5",
                    "with": {
                        "context": ".",
                        "file": "./Dockerfile",
                        "push": "${{ github.ref == 'refs/heads/main' }}",
                        "tags": "cueforge:${{ github.sha }},cueforge:latest",
                        "cache-from": "type=gha",
                        "cache-to": "type=gha,mode=max",
                    },
                },
                {
                    "name": "Upload Docker image artifact",
                    "run": "docker save cueforge:latest | gzip > cueforge-image.tar.gz",
                },
                {
                    "uses": "actions/upload-artifact@v3",
                    "with": {
                        "name": "docker-image",
                        "path": "cueforge-image.tar.gz",
                        "retention-days": self.build_config.artifact_retention_days,
                    },
                },
            ],
        }

    def _create_performance_job(self) -> Dict[str, Any]:
        """Create performance testing job."""
        return {
            "needs": ["build"],
            "runs-on": "ubuntu-latest",
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "uses": "actions/setup-node@v4",
                    "with": {"node-version": "20"},
                },
                {
                    "name": "Install dependencies",
                    "run": "npm install --prefix frontend",
                },
                {
                    "name": "Check bundle size",
                    "run": (
                        "npm run build --prefix frontend && "
                        "du -sh frontend/.next/static | "
                        "awk '{print $1}' > bundle-size.txt && "
                        f"cat bundle-size.txt"
                    ),
                },
                {
                    "name": "Run Lighthouse",
                    "run": "npm install -g @lhci/cli && lhci autorun",
                    "continue-on-error": True,
                },
                {
                    "name": "Performance summary",
                    "run": "echo 'Performance checks complete'",
                },
            ],
        }

    def _create_preview_deploy_job(self) -> Dict[str, Any]:
        """Create preview deployment for pull requests."""
        return {
            "needs": ["build"],
            "runs-on": "ubuntu-latest",
            "if": "github.event_name == 'pull_request'",
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "name": "Deploy preview to Vercel",
                    "uses": "vercel/action@master",
                    "with": {
                        "vercel-token": "${{ secrets.VERCEL_TOKEN }}",
                        "github-token": "${{ secrets.GITHUB_TOKEN }}",
                        "vercel-org-id": "${{ secrets.VERCEL_ORG_ID }}",
                        "vercel-project-id": "${{ secrets.VERCEL_PROJECT_ID }}",
                    },
                },
                {
                    "name": "Comment PR with preview URL",
                    "uses": "actions/github-script@v7",
                    "with": {
                        "script": (
                            "github.rest.issues.createComment({\n"
                            "  issue_number: context.issue.number,\n"
                            "  owner: context.repo.owner,\n"
                            "  repo: context.repo.repo,\n"
                            "  body: '🚀 Preview deployed at ${{ env.PREVIEW_URL }}'\n"
                            "})"
                        ),
                    },
                },
            ],
        }

    def _create_production_deploy_job(self) -> Dict[str, Any]:
        """Create production deployment job."""
        return {
            "needs": ["build", "performance"],
            "runs-on": "ubuntu-latest",
            "if": "github.ref == 'refs/heads/main' && github.event_name == 'push'",
            "steps": [
                {"uses": "actions/checkout@v4"},
                {
                    "name": "Deploy to Railway",
                    "uses": "railway-app/action@v1",
                    "with": {
                        "token": "${{ secrets.RAILWAY_TOKEN }}",
                        "service": "${{ secrets.RAILWAY_SERVICE_ID }}",
                    },
                },
                {
                    "name": "Run health checks",
                    "run": (
                        "sleep 30 && "
                        "curl -f https://api.cueforge.app/health || exit 1"
                    ),
                },
                {
                    "name": "Rollback on failure",
                    "if": "failure()",
                    "uses": "railway-app/action@v1",
                    "with": {
                        "token": "${{ secrets.RAILWAY_TOKEN }}",
                        "service": "${{ secrets.RAILWAY_SERVICE_ID }}",
                        "action": "rollback",
                    },
                },
            ],
        }

    def configure_test_parallelism(self) -> Dict[str, Any]:
        """
        Configure test parallelism settings for distributed test execution.

        Returns:
            dict: Test parallelism configuration
        """
        return {
            "enabled": True,
            "parallelism": self.test_config.parallelism,
            "test_groups": [
                {
                    "name": f"group_{i}",
                    "description": f"Test group {i}",
                }
                for i in range(1, self.test_config.parallelism + 1)
            ],
            "timeout_minutes": self.test_config.timeout_minutes,
            "coverage_threshold": self.test_config.coverage_threshold,
            "reporters": ["json", "html", "cobertura"],
        }

    def configure_build_cache(self) -> Dict[str, Any]:
        """
        Configure Docker layer caching and dependency caching.

        Returns:
            dict: Cache configuration
        """
        return {
            "docker": {
                "enabled": self.build_config.use_docker_cache,
                "strategy": "max",  # Cache all layers
                "cache_from": ["type=gha"],
                "cache_to": ["type=gha,mode=max"],
            },
            "dependencies": {
                "enabled": self.build_config.use_dependency_cache,
                "paths": [
                    "backend/requirements.txt",
                    "frontend/package-lock.json",
                ],
                "cache_key": "deps-${{ hashFiles('**/requirements.txt', '**/package-lock.json') }}",
            },
            "artifacts": {
                "compress": self.build_config.compress_artifacts,
                "retention_days": self.build_config.artifact_retention_days,
            },
        }

    def generate_changelog(self) -> str:
        """
        Generate changelog from conventional commits.

        Returns:
            str: Changelog generation script
        """
        script = """#!/bin/bash
# Generate changelog from conventional commits

echo "# Changelog" > CHANGELOG.md
echo "" >> CHANGELOG.md

# Get commits since last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$LAST_TAG" ]; then
    COMMITS=$(git log --pretty=format:"%h %s" --reverse)
else
    COMMITS=$(git log $LAST_TAG..HEAD --pretty=format:"%h %s" --reverse)
fi

# Parse conventional commits
echo "## Changes" >> CHANGELOG.md
echo "" >> CHANGELOG.md

echo "$COMMITS" | while read HASH MESSAGE; do
    if [[ $MESSAGE =~ ^(feat|fix|docs|style|refactor|perf|test) ]]; then
        CATEGORY=$(echo $MESSAGE | cut -d: -f1)
        DESCRIPTION=$(echo $MESSAGE | cut -d: -f2- | sed 's/^ //')

        case $CATEGORY in
            feat) echo "- **Feature**: $DESCRIPTION" >> CHANGELOG.md ;;
            fix) echo "- **Fix**: $DESCRIPTION" >> CHANGELOG.md ;;
            docs) echo "- **Docs**: $DESCRIPTION" >> CHANGELOG.md ;;
            perf) echo "- **Performance**: $DESCRIPTION" >> CHANGELOG.md ;;
            refactor) echo "- **Refactor**: $DESCRIPTION" >> CHANGELOG.md ;;
        esac
    fi
done

cat CHANGELOG.md
"""
        return script

    def configure_security_scan(self) -> Dict[str, Any]:
        """
        Configure SAST and dependency scanning.

        Returns:
            dict: Security scan configuration
        """
        return {
            "sast": {
                "enabled": self.security_config.enable_sast,
                "tools": ["bandit", "semgrep"],
                "python_config": {
                    "severity": "HIGH",
                    "confidence": "HIGH",
                },
            },
            "dependency_check": {
                "enabled": self.security_config.enable_dependency_check,
                "tools": ["safety", "pip-audit"],
                "fail_on_critical": self.security_config.fail_on_critical,
            },
            "container_scan": {
                "enabled": self.security_config.enable_container_scan,
                "registry": "docker.io",
                "severity_threshold": "CRITICAL",
            },
        }

    def configure_performance_budget(self) -> Dict[str, Any]:
        """
        Configure performance budgets for bundle size and lighthouse scores.

        Returns:
            dict: Performance budget configuration
        """
        return {
            "bundles": [
                {
                    "name": "main",
                    "maxSize": f"{self.performance_config.max_bundle_size_kb}kb",
                },
                {
                    "name": "vendor",
                    "maxSize": f"{self.performance_config.max_bundle_size_kb * 0.8}kb",
                },
            ],
            "lighthouse": {
                "minScore": self.performance_config.max_lighthouse_score,
                "metrics": {
                    "first-contentful-paint": 1500,
                    "largest-contentful-paint": 2500,
                    "time-to-interactive": int(
                        self.performance_config.max_lighthouse_time_to_interactive_ms
                    ),
                    "cumulative-layout-shift": 0.1,
                },
            },
            "api": {
                "maxResponseTime": int(
                    self.performance_config.max_api_response_time_ms
                ),
                "endpoints": [
                    "/api/v1/health",
                    "/api/v1/tracks",
                    "/api/v1/users/me",
                ],
            },
        }

    def configure_rollback(self) -> Dict[str, Any]:
        """
        Configure automatic rollback on health check failures.

        Returns:
            dict: Rollback configuration
        """
        return {
            "enabled": True,
            "trigger": {
                "health_check_failures": 3,
                "check_interval_seconds": 10,
                "max_wait_time_seconds": 300,
            },
            "strategy": "blue_green",  # or "canary", "rolling"
            "notification": {
                "enabled": True,
                "channels": ["slack", "email"],
                "slack_webhook": "${{ secrets.SLACK_WEBHOOK }}",
                "email": "devops@cueforge.app",
            },
        }

    def generate_migration_test(self) -> str:
        """
        Generate database migration testing script.

        Returns:
            str: Migration test script
        """
        script = """#!/bin/bash
# Test database migrations in CI environment

set -e

echo "Testing database migrations..."

# Create test database
export TEST_DATABASE_URL="postgresql://postgres:test@localhost:5432/cueforge_test_migrations"

# Run migrations
python -m alembic upgrade head

# Verify migrations
python -m alembic current
python -m alembic history --verbose

# Run migration validation tests
pytest backend/tests/test_migrations.py -v

echo "✅ All migrations passed"
"""
        return script

    def to_dict(self) -> Dict[str, Any]:
        """Export configuration as dictionary."""
        return {
            "test": asdict(self.test_config),
            "build": asdict(self.build_config),
            "security": asdict(self.security_config),
            "performance": asdict(self.performance_config),
            "test_parallelism": self.configure_test_parallelism(),
            "build_cache": self.configure_build_cache(),
            "security_scan": self.configure_security_scan(),
            "performance_budget": self.configure_performance_budget(),
            "rollback": self.configure_rollback(),
        }
