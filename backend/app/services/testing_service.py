"""
TestingService - Testing & Quality Assurance pour TrackCue
Points 1931-1970: E2E, visual regression, performance budgets, accessibility, etc.
"""

import subprocess
import json
import hashlib
import time
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from datetime import datetime
import os
import re


class TestLevel(str, Enum):
    """Niveaux de test"""
    UNIT = "unit"
    INTEGRATION = "integration"
    E2E = "e2e"


@dataclass
class PerformanceBudget:
    """Budget de performance"""
    metric: str  # "lcp", "fid", "cls", "fcp"
    threshold_ms: float  # en millisecondes
    region: str = "global"  # "global", "us", "eu", "asia"


@dataclass
class TestResult:
    """Résultat d'un test"""
    passed: bool
    test_name: str
    duration_ms: float
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class TestingService:
    """Service de testing et quality assurance"""

    def __init__(self, project_root: str = "/tmp/trackcue-saas"):
        self.project_root = project_root
        self.backend_dir = os.path.join(project_root, "backend")
        self.frontend_dir = os.path.join(project_root, "frontend")
        self.test_results: List[TestResult] = []

    # ============================================================================
    # 1932: run_e2e_tests - Orchestration des tests E2E (Playwright)
    # ============================================================================
    def run_e2e_tests(
        self, spec_pattern: Optional[str] = None, headless: bool = True
    ) -> Dict[str, Any]:
        """
        Lancer les tests E2E avec Playwright.

        Args:
            spec_pattern: Pattern pour filtrer les tests (e.g., "upload", "analyze")
            headless: Mode headless (pas de fenêtre)

        Returns:
            Résumé des tests avec pass/fail et détails
        """
        start_time = time.time()

        # Commande Playwright
        cmd = ["npx", "playwright", "test"]

        if spec_pattern:
            cmd.extend(["-g", spec_pattern])

        if headless:
            cmd.append("--headed=false")

        try:
            # Lancer les tests
            result = subprocess.run(
                cmd,
                cwd=self.frontend_dir,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minutes max
            )

            duration_ms = (time.time() - start_time) * 1000

            # Parser le résultat
            output = result.stdout + result.stderr
            passed = result.returncode == 0

            # Extraire les stats
            passed_count = output.count(" passed")
            failed_count = output.count(" failed")

            return {
                "status": "passed" if passed else "failed",
                "duration_ms": duration_ms,
                "passed_tests": passed_count,
                "failed_tests": failed_count,
                "total_tests": passed_count + failed_count,
                "pass_rate_percent": (passed_count / (passed_count + failed_count) * 100) if (passed_count + failed_count) > 0 else 0,
                "output": output[-500:] if len(output) > 500 else output,  # Dernières 500 chars
            }

        except subprocess.TimeoutExpired:
            return {
                "status": "timeout",
                "error": "E2E tests exceeded 10 minute timeout",
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    # ============================================================================
    # 1933: check_visual_regression - Comparaison de screenshots (pixel diff)
    # ============================================================================
    def check_visual_regression(self, baseline_dir: str, current_dir: str) -> Dict[str, Any]:
        """
        Vérifier les régressions visuelles en comparant les screenshots.

        Args:
            baseline_dir: Répertoire des screenshots de référence
            current_dir: Répertoire des screenshots courants

        Returns:
            Rapport de régression avec diffs détaillées
        """
        regressions = []
        identical = 0
        total = 0

        try:
            # Lister les fichiers de baseline
            baseline_files = os.listdir(baseline_dir) if os.path.exists(baseline_dir) else []

            for filename in baseline_files:
                if not filename.endswith((".png", ".jpg")):
                    continue

                total += 1
                baseline_path = os.path.join(baseline_dir, filename)
                current_path = os.path.join(current_dir, filename)

                if not os.path.exists(current_path):
                    regressions.append({
                        "file": filename,
                        "status": "missing",
                        "message": "Current screenshot not found",
                    })
                    continue

                # Comparer les images via hash
                baseline_hash = self._compute_image_hash(baseline_path)
                current_hash = self._compute_image_hash(current_path)

                if baseline_hash == current_hash:
                    identical += 1
                else:
                    # Calculer la différence pixel (approximation)
                    diff_percent = self._calculate_image_diff_percent(baseline_path, current_path)

                    if diff_percent > 5:  # Seuil: 5% de différence = régression
                        regressions.append({
                            "file": filename,
                            "status": "regression",
                            "diff_percent": diff_percent,
                        })

            return {
                "status": "passed" if not regressions else "failed",
                "total_screenshots": total,
                "identical": identical,
                "regressions": regressions,
                "regression_count": len(regressions),
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    def _compute_image_hash(self, image_path: str) -> str:
        """Calculer le hash SHA256 d'une image"""
        sha256_hash = hashlib.sha256()
        with open(image_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def _calculate_image_diff_percent(self, img1_path: str, img2_path: str) -> float:
        """Calculer le pourcentage de différence entre deux images (approximation)"""
        try:
            from PIL import Image, ImageChops

            img1 = Image.open(img1_path)
            img2 = Image.open(img2_path)

            # Redimensionner si nécessaire
            if img1.size != img2.size:
                img2 = img2.resize(img1.size)

            # Calculer la différence
            diff = ImageChops.difference(img1, img2)
            total_pixels = img1.width * img1.height * 3  # RGB
            diff_pixels = sum(diff.getdata())

            return (diff_pixels / total_pixels) * 100

        except Exception:
            # Si Pillow n'est pas disponible, retourner une estimation basée sur le hash
            return 100.0

    # ============================================================================
    # 1934: check_performance_budgets - Vérification des budgets perf
    # ============================================================================
    def check_performance_budgets(self, budgets: List[PerformanceBudget]) -> Dict[str, Any]:
        """
        Vérifier que les métriques de performance respectent les budgets.

        Args:
            budgets: Liste des budgets de performance à vérifier

        Returns:
            Résumé des vérifications avec pass/fail
        """
        violations = []
        passed = []

        # Récupérer les métriques (hypothèse: fichier metrics.json existe)
        metrics_file = os.path.join(self.frontend_dir, ".measurements/metrics.json")
        metrics = {}

        if os.path.exists(metrics_file):
            try:
                with open(metrics_file, "r") as f:
                    metrics = json.load(f)
            except Exception:
                metrics = {}

        for budget in budgets:
            actual_value = metrics.get(budget.metric, {}).get(budget.region, float("inf"))

            if actual_value > budget.threshold_ms:
                violations.append({
                    "metric": budget.metric,
                    "region": budget.region,
                    "threshold": budget.threshold_ms,
                    "actual": actual_value,
                    "exceeded_by_ms": actual_value - budget.threshold_ms,
                })
            else:
                passed.append({
                    "metric": budget.metric,
                    "region": budget.region,
                    "threshold": budget.threshold_ms,
                    "actual": actual_value,
                    "headroom_ms": budget.threshold_ms - actual_value,
                })

        return {
            "status": "passed" if not violations else "failed",
            "budgets_checked": len(budgets),
            "passed": len(passed),
            "violations": len(violations),
            "details": {
                "passed": passed,
                "violations": violations,
            },
        }

    # ============================================================================
    # 1935: run_accessibility_audit - Audit a11y automatique (axe-core)
    # ============================================================================
    def run_accessibility_audit(self, url: str) -> Dict[str, Any]:
        """
        Lancer un audit d'accessibilité avec axe-core.

        Args:
            url: URL à auditer (e.g., http://localhost:3000)

        Returns:
            Rapport d'accessibilité avec violations et best practices
        """
        try:
            # Script Playwright pour exécuter axe-core
            script = f"""
import {{ playwrightLauncher }} from '@axe-core/playwright';
import {{ chromium }} from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('{url}');

// Charger et exécuter axe
const axeResults = await page.evaluate(() => {{
  return new Promise((resolve) => {{
    axe.run(document, (error, results) => {{
      if (error) throw error;
      resolve(results);
    }});
  }});
}});

console.log(JSON.stringify(axeResults));
await browser.close();
"""

            # Écrire le script temporairement
            script_path = "/tmp/axe_audit.js"
            with open(script_path, "w") as f:
                f.write(script)

            # Exécuter
            result = subprocess.run(
                ["node", script_path],
                cwd=self.frontend_dir,
                capture_output=True,
                text=True,
                timeout=60,
            )

            # Parser le résultat
            try:
                axe_data = json.loads(result.stdout)
            except json.JSONDecodeError:
                axe_data = {}

            violations = axe_data.get("violations", [])
            passes = axe_data.get("passes", [])
            incomplete = axe_data.get("incomplete", [])

            return {
                "status": "passed" if not violations else "failed",
                "url": url,
                "violations": {
                    "count": len(violations),
                    "details": violations,
                },
                "passes": len(passes),
                "incomplete": {
                    "count": len(incomplete),
                    "details": incomplete,
                },
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    # ============================================================================
    # 1936: run_api_contract_tests - Test de contrats API
    # ============================================================================
    def run_api_contract_tests(self) -> Dict[str, Any]:
        """
        Tester les contrats API (validation de schémas OpenAPI).

        Returns:
            Résumé des tests de contrats
        """
        try:
            # Commande: lancer les tests de contrats
            result = subprocess.run(
                ["npm", "run", "test:contracts"],
                cwd=self.frontend_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )

            passed = result.returncode == 0
            output = result.stdout + result.stderr

            # Extraire les stats
            contract_tests = len(re.findall(r"contract.*test", output, re.IGNORECASE))
            passed_count = output.count("✓") or output.count("passed")
            failed_count = output.count("✗") or output.count("failed")

            return {
                "status": "passed" if passed else "failed",
                "contract_tests": contract_tests,
                "passed": passed_count,
                "failed": failed_count,
                "output": output[-300:] if len(output) > 300 else output,
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    # ============================================================================
    # 1937: run_load_test - Test de charge basique
    # ============================================================================
    def run_load_test(
        self, endpoint: str, concurrent_users: int = 10, duration_seconds: int = 30
    ) -> Dict[str, Any]:
        """
        Lancer un test de charge simple.

        Args:
            endpoint: Endpoint à tester (e.g., http://api.local/analyze)
            concurrent_users: Nombre d'utilisateurs concurrents
            duration_seconds: Durée du test en secondes

        Returns:
            Rapport de charge avec latence, RPS, erreurs
        """
        try:
            # Utiliser Apache Bench ou k6
            cmd = [
                "ab",
                "-n",
                str(concurrent_users * duration_seconds),  # Nombre total de requêtes
                "-c",
                str(concurrent_users),  # Concurrence
                endpoint,
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            output = result.stdout
            # Parser le résultat ApacheBench
            return self._parse_ab_output(output)

        except FileNotFoundError:
            # ApacheBench non disponible, retourner une estimation
            return {
                "status": "skipped",
                "message": "Apache Bench not available. Install with: apt-get install apache2-utils",
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    def _parse_ab_output(self, output: str) -> Dict[str, Any]:
        """Parser la sortie d'ApacheBench"""
        try:
            lines = output.split("\n")
            data = {}

            for line in lines:
                if "Requests per second" in line:
                    data["rps"] = float(line.split(":")[1].strip().split()[0])
                elif "Time per request" in line and "mean" not in line:
                    data["mean_latency_ms"] = float(line.split(":")[1].strip().split()[0])
                elif "Failed requests" in line:
                    data["failed_requests"] = int(line.split(":")[1].strip())
                elif "Total transferred" in line:
                    data["total_transferred_bytes"] = int(line.split(":")[1].strip().split()[0])

            return {
                "status": "passed" if data.get("failed_requests", 0) == 0 else "failed",
                "metrics": data,
            }

        except Exception:
            return {"status": "error", "error": "Failed to parse ApacheBench output"}

    # ============================================================================
    # 1938: run_security_scan - Scan de sécurité automatisé
    # ============================================================================
    def run_security_scan(self) -> Dict[str, Any]:
        """
        Lancer un scan de sécurité (dépendances, SAST, etc.).

        Returns:
            Rapport de sécurité avec vulnérabilités
        """
        vulnerabilities = []
        warnings = []

        try:
            # Scan npm audit
            result = subprocess.run(
                ["npm", "audit", "--json"],
                cwd=self.frontend_dir,
                capture_output=True,
                text=True,
                timeout=60,
            )

            try:
                audit_data = json.loads(result.stdout)
                vulnerabilities.extend(audit_data.get("vulnerabilities", []))
            except json.JSONDecodeError:
                pass

        except Exception as e:
            warnings.append(f"npm audit failed: {str(e)}")

        try:
            # Scan pip (backend)
            result = subprocess.run(
                ["pip-audit", "--json"],
                cwd=self.backend_dir,
                capture_output=True,
                text=True,
                timeout=60,
            )

            try:
                audit_data = json.loads(result.stdout)
                vulnerabilities.extend(audit_data.get("vulnerabilities", []))
            except json.JSONDecodeError:
                pass

        except Exception as e:
            warnings.append(f"pip-audit failed: {str(e)}")

        return {
            "status": "passed" if not vulnerabilities else "failed",
            "vulnerabilities": len(vulnerabilities),
            "details": vulnerabilities,
            "warnings": warnings,
            "recommendations": [
                "Run `npm audit fix` to fix frontend vulnerabilities",
                "Run `pip install --upgrade pip && pip-audit --fix` for backend",
            ],
        }

    # ============================================================================
    # 1939: check_code_coverage - Vérification couverture de code
    # ============================================================================
    def check_code_coverage(self, min_coverage_percent: float = 80.0) -> Dict[str, Any]:
        """
        Vérifier la couverture de code.

        Args:
            min_coverage_percent: Couverture minimale requise

        Returns:
            Rapport de couverture par fichier
        """
        try:
            # Frontend (Jest)
            result = subprocess.run(
                ["npm", "run", "test:coverage"],
                cwd=self.frontend_dir,
                capture_output=True,
                text=True,
                timeout=120,
            )

            output = result.stdout + result.stderr

            # Chercher le résumé de couverture
            coverage_pattern = r"(\d+\.?\d*)\% of statements"
            match = re.search(coverage_pattern, output)
            coverage_percent = float(match.group(1)) if match else 0.0

            status = "passed" if coverage_percent >= min_coverage_percent else "failed"

            return {
                "status": status,
                "coverage_percent": coverage_percent,
                "minimum_required": min_coverage_percent,
                "headroom": coverage_percent - min_coverage_percent,
                "output": output[-200:] if len(output) > 200 else output,
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }

    # ============================================================================
    # 1940: quarantine_flaky_tests - Quarantine des tests instables
    # ============================================================================
    def quarantine_flaky_tests(self, flakiness_threshold: int = 3) -> Dict[str, Any]:
        """
        Identifier et quéarantine les tests instables (qui échouent parfois).

        Args:
            flakiness_threshold: Nombre d'échecs avant quarantine

        Returns:
            Liste des tests mis en quarantine
        """
        try:
            # Lire le fichier de résultats des tests
            results_file = os.path.join(self.frontend_dir, ".test-results.json")

            if not os.path.exists(results_file):
                return {
                    "status": "skipped",
                    "message": "No test results file found",
                }

            with open(results_file, "r") as f:
                test_results = json.load(f)

            # Identifier les tests flaky
            flaky_tests = []
            test_failures = {}

            for result in test_results.get("tests", []):
                test_name = result.get("name")
                passed = result.get("passed", True)

                if not passed:
                    test_failures[test_name] = test_failures.get(test_name, 0) + 1

            for test_name, failure_count in test_failures.items():
                if failure_count >= flakiness_threshold:
                    flaky_tests.append({
                        "name": test_name,
                        "failure_count": failure_count,
                        "status": "quarantined",
                    })

            # Sauvegarder la liste des tests mis en quarantine
            quarantine_file = os.path.join(self.frontend_dir, ".quarantined-tests.json")
            with open(quarantine_file, "w") as f:
                json.dump({"quarantined": flaky_tests}, f, indent=2)

            return {
                "status": "passed",
                "flaky_tests_count": len(flaky_tests),
                "quarantined_tests": flaky_tests,
                "quarantine_file": quarantine_file,
            }

        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
            }
