"""
Job Manager Service — Points 731-780 (Background Jobs)
Gère la planification, l'exécution et le suivi des jobs asynchrones.
"""

import asyncio
import hashlib
import logging
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Set
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class JobPriority(Enum):
    """Niveaux de priorité pour les jobs"""
    URGENT = 1
    NORMAL = 2
    BACKGROUND = 3


class JobStatus(Enum):
    """États des jobs"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


@dataclass
class JobMetrics:
    """Métriques d'un job"""
    job_id: str
    status: JobStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retries: int = 0
    max_retries: int = 3
    latency_ms: float = 0.0
    error_message: Optional[str] = None

    @property
    def duration_ms(self) -> float:
        """Durée d'exécution en ms"""
        if self.completed_at and self.started_at:
            return (self.completed_at - self.started_at).total_seconds() * 1000
        return 0.0


@dataclass
class Job:
    """Définition d'un job"""
    job_id: str
    track_id: str
    job_type: str
    priority: JobPriority
    status: JobStatus = JobStatus.PENDING
    created_at: datetime = field(default_factory=datetime.utcnow)
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Any] = None
    error: Optional[str] = None
    retries: int = 0
    max_retries: int = 3
    backoff_base: float = 1.0
    ttl_seconds: int = 3600  # Résultat gardé 1h par défaut
    dependencies: List[str] = field(default_factory=list)  # IDs des jobs dépendants
    user_id: Optional[str] = None

    def is_ready(self) -> bool:
        """Vérif si le job peut être exécuté (dépendances OK)"""
        return len(self.dependencies) == 0

    def is_expired(self) -> bool:
        """Vérif si le résultat est expiré"""
        if not self.completed_at:
            return False
        expiry = self.completed_at + timedelta(seconds=self.ttl_seconds)
        return datetime.utcnow() > expiry


@dataclass
class SSEMessage:
    """Message de streaming SSE"""
    event: str
    data: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_sse_format(self) -> str:
        """Formate le message pour SSE"""
        import json
        return f"event: {self.event}\ndata: {json.dumps(self.data)}\n\n"


class JobScheduler(ABC):
    """Interface pour différentes stratégies de planification"""

    @abstractmethod
    async def should_run(self, job: Job) -> bool:
        """Détermine si le job doit tourner maintenant"""
        pass


class CronScheduler(JobScheduler):
    """Planification basée sur cron (simplifié)"""

    def __init__(self, cron_expr: str):
        self.cron_expr = cron_expr

    async def should_run(self, job: Job) -> bool:
        """Basique: parse cron et vérifie l'heure"""
        # Implémentation simplifiée
        return True


class EventScheduler(JobScheduler):
    """Planification basée sur events"""

    def __init__(self, event_type: str):
        self.event_type = event_type

    async def should_run(self, job: Job) -> bool:
        return job.scheduled_at is None or datetime.utcnow() >= job.scheduled_at


class JobManager:
    """Gestionnaire principal des jobs asynchrones (Points 731-780)"""

    def __init__(self, max_workers: int = 10):
        self.jobs: Dict[str, Job] = {}
        self.dead_letter_queue: List[Job] = []
        self.job_chains: Dict[str, List[str]] = {}  # parent -> [child_ids]
        self.rate_limits: Dict[str, int] = defaultdict(int)  # user_id -> count
        self.priority_lanes: Dict[JobPriority, asyncio.Queue] = {
            JobPriority.URGENT: asyncio.Queue(),
            JobPriority.NORMAL: asyncio.Queue(),
            JobPriority.BACKGROUND: asyncio.Queue(),
        }
        self.deduplication_cache: Dict[str, str] = {}  # (track_id, type) -> job_id
        self.max_workers = max_workers
        self.active_workers: int = 0
        self.metrics_history: List[JobMetrics] = []
        self.slo_targets: Dict[str, float] = {
            "p95_latency_ms": 30000,
            "error_rate": 0.05,
            "throughput_jobs_per_sec": 10
        }

    async def schedule_job(
        self,
        track_id: str,
        job_type: str,
        payload: Dict[str, Any],
        priority: JobPriority = JobPriority.NORMAL,
        scheduler: Optional[JobScheduler] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """
        Points 731: Planifier un job (cron ou event-driven)
        Retourne job_id
        """
        job_id = str(uuid.uuid4())

        job = Job(
            job_id=job_id,
            track_id=track_id,
            job_type=job_type,
            priority=priority,
            payload=payload,
            user_id=user_id,
        )

        self.jobs[job_id] = job

        # Ajouter aux rate limits
        if user_id:
            self.rate_limits[user_id] += 1

        # Queue par priorité
        await self.priority_lanes[priority].put(job_id)

        logger.info(f"Job scheduled: {job_id} (type={job_type}, priority={priority})")

        return job_id

    async def retry_with_backoff(self, job: Job) -> bool:
        """
        Points 732: Retry avec exponential backoff (1s, 2s, 4s, 8s, max 60s)
        Retourne True si retry possible, False si max atteint
        """
        if job.retries >= job.max_retries:
            logger.error(f"Max retries reached for job {job.job_id}")
            return False

        # Calcul du délai: backoff_base ^ retries, max 60s
        delay_seconds = min(job.backoff_base ** job.retries, 60)

        logger.info(f"Retrying job {job.job_id} in {delay_seconds}s (attempt {job.retries + 1}/{job.max_retries})")

        await asyncio.sleep(delay_seconds)

        job.retries += 1
        job.status = JobStatus.RETRYING

        # Re-queue le job
        await self.priority_lanes[job.priority].put(job.job_id)

        return True

    def deduplicate_jobs(self, track_id: str, job_type: str) -> Optional[str]:
        """
        Points 733: Déduplication par track_id + type
        Retourne job_id existant ou None si aucun
        """
        dedup_key = f"{track_id}:{job_type}"

        if dedup_key in self.deduplication_cache:
            existing_job_id = self.deduplication_cache[dedup_key]
            job = self.jobs.get(existing_job_id)

            # Valide si le job est toujours en cours
            if job and job.status in [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.RETRYING]:
                logger.info(f"Job {existing_job_id} already running for {dedup_key}")
                return existing_job_id

        return None

    def set_priority_lane(self, job_id: str, new_priority: JobPriority) -> None:
        """
        Points 734: Lanes de priorité (urgent/normal/background)
        Change la priorité d'un job
        """
        if job_id not in self.jobs:
            return

        job = self.jobs[job_id]
        old_priority = job.priority
        job.priority = new_priority

        logger.info(f"Job {job_id} priority changed: {old_priority} -> {new_priority}")

    async def cancel_job(self, job_id: str) -> bool:
        """
        Points 735: Annulation propre avec cleanup
        Retourne True si annulation réussie
        """
        if job_id not in self.jobs:
            return False

        job = self.jobs[job_id]

        # Marquer comme cancelled
        job.status = JobStatus.CANCELLED
        job.completed_at = datetime.utcnow()

        # Cleanup des dépendances (les jobs dépendants sont orphelins)
        for child_id in self.job_chains.get(job_id, []):
            if child_id in self.jobs:
                await self.cancel_job(child_id)

        # Cleanup de la cache
        dedup_key = f"{job.track_id}:{job.job_type}"
        if self.deduplication_cache.get(dedup_key) == job_id:
            del self.deduplication_cache[dedup_key]

        logger.info(f"Job {job_id} cancelled")

        return True

    async def stream_job_progress(self, job_id: str) -> asyncio.Queue:
        """
        Points 736: Streaming du progress via SSE
        Retourne une queue asyncio qui envoie des SSEMessage
        """
        queue: asyncio.Queue = asyncio.Queue()

        if job_id not in self.jobs:
            msg = SSEMessage(
                event="error",
                data={"error": f"Job {job_id} not found"}
            )
            await queue.put(msg)
            return queue

        job = self.jobs[job_id]

        # Envoyer l'état initial
        initial_msg = SSEMessage(
            event="job_status",
            data={
                "job_id": job_id,
                "status": job.status.value,
                "progress": 0
            }
        )
        await queue.put(initial_msg)

        # TODO: Ajouter des updates périodiques pendant l'exécution

        return queue

    def create_job_chain(
        self,
        jobs_spec: List[tuple],
    ) -> str:
        """
        Points 737: Chaînage de jobs avec dépendances
        jobs_spec: [(track_id, job_type, payload), ...]
        Retourne parent_job_id
        """
        parent_job_id = str(uuid.uuid4())
        child_ids = []

        # Créer tous les jobs
        for i, (track_id, job_type, payload) in enumerate(jobs_spec):
            job_id = str(uuid.uuid4())

            job = Job(
                job_id=job_id,
                track_id=track_id,
                job_type=job_type,
                priority=JobPriority.NORMAL,
                payload=payload,
            )

            # Ajouter dépendances (le job dépend du précédent)
            if i > 0:
                job.dependencies = [child_ids[i - 1]]

            self.jobs[job_id] = job
            child_ids.append(job_id)

        # Mapper les dépendances
        self.job_chains[parent_job_id] = child_ids

        logger.info(f"Job chain {parent_job_id} created with {len(child_ids)} jobs")

        return parent_job_id

    def set_result_ttl(self, job_id: str, ttl_seconds: int) -> None:
        """
        Points 738: TTL sur les résultats de jobs (cleanup auto)
        Définit le TTL pour le résultat d'un job
        """
        if job_id not in self.jobs:
            return

        self.jobs[job_id].ttl_seconds = ttl_seconds
        logger.info(f"Job {job_id} TTL set to {ttl_seconds}s")

    async def rate_limit_jobs(self, user_id: str, max_per_minute: int = 60) -> bool:
        """
        Points 739: Rate limiting par user
        Retourne True si la requête est autorisée, False si rate-limitée
        """
        current_count = self.rate_limits.get(user_id, 0)

        if current_count >= max_per_minute:
            logger.warning(f"Rate limit exceeded for user {user_id}")
            return False

        # Incrémente et programme un reset
        self.rate_limits[user_id] = current_count + 1

        # Reset après 1 minute
        async def reset_after_minute():
            await asyncio.sleep(60)
            self.rate_limits[user_id] = max(0, self.rate_limits[user_id] - 1)

        asyncio.create_task(reset_after_minute())

        return True

    def get_job_metrics(self) -> Dict[str, Any]:
        """
        Points 740: Métriques (latence, throughput, error rate)
        Retourne dict avec stats agrégées
        """
        if not self.metrics_history:
            return {
                "total_jobs": len(self.jobs),
                "completed_jobs": sum(1 for j in self.jobs.values() if j.status == JobStatus.COMPLETED),
                "failed_jobs": sum(1 for j in self.jobs.values() if j.status == JobStatus.FAILED),
                "p95_latency_ms": 0,
                "error_rate": 0.0,
                "throughput_jobs_per_sec": 0.0,
            }

        completed = [m for m in self.metrics_history if m.status == JobStatus.COMPLETED]
        failed = [m for m in self.metrics_history if m.status == JobStatus.FAILED]

        latencies = sorted([m.latency_ms for m in completed])
        p95_idx = int(len(latencies) * 0.95) if latencies else 0
        p95_latency = latencies[p95_idx] if p95_idx < len(latencies) else 0

        error_rate = len(failed) / len(self.metrics_history) if self.metrics_history else 0

        return {
            "total_jobs": len(self.jobs),
            "completed_jobs": len(completed),
            "failed_jobs": len(failed),
            "p95_latency_ms": p95_latency,
            "error_rate": error_rate,
            "throughput_jobs_per_sec": len(self.metrics_history) / 60.0,  # Simplifié
        }

    async def handle_dead_letter(self, job: Job, error: str) -> None:
        """
        Points 741: Traitement de la dead letter queue
        Envoie les jobs non-replayable à la DLQ
        """
        job.error = error
        job.status = JobStatus.FAILED
        job.completed_at = datetime.utcnow()

        # Essayer un retry
        if await self.retry_with_backoff(job):
            return

        # Si retry impossible, ajouter à DLQ
        self.dead_letter_queue.append(job)

        logger.error(f"Job {job.job_id} moved to dead letter queue: {error}")

    def implement_fair_scheduling(self) -> str:
        """
        Points 742: Round-robin entre users
        Retourne le job_id du prochain job à exécuter (round-robin par user)
        """
        user_jobs: Dict[str, List[str]] = defaultdict(list)

        # Grouper les jobs par user
        for job_id, job in self.jobs.items():
            if job.status in [JobStatus.PENDING, JobStatus.RETRYING]:
                user_id = job.user_id or "anonymous"
                user_jobs[user_id].append(job_id)

        if not user_jobs:
            return ""

        # Round-robin: prendre le premier job de chaque user à tour de rôle
        # Ici simplifié: on prend le premier job du premier user disponible
        first_user = next(iter(user_jobs))
        return user_jobs[first_user][0] if user_jobs[first_user] else ""

    async def execute_job(self, job: Job, handler: Callable) -> None:
        """Exécute un job avec le handler fourni"""
        job.status = JobStatus.RUNNING
        job.started_at = datetime.utcnow()

        start_time = time.time()

        try:
            result = await handler(job)
            job.result = result
            job.status = JobStatus.COMPLETED
        except Exception as e:
            await self.handle_dead_letter(job, str(e))
        finally:
            job.completed_at = datetime.utcnow()
            latency_ms = (time.time() - start_time) * 1000

            # Enregistrer les métriques
            metrics = JobMetrics(
                job_id=job.job_id,
                status=job.status,
                created_at=job.created_at,
                started_at=job.started_at,
                completed_at=job.completed_at,
                latency_ms=latency_ms,
                error_message=job.error,
            )
            self.metrics_history.append(metrics)

    def cleanup_expired_results(self) -> int:
        """Nettoie les résultats expirés, retourne nombre supprimés"""
        count = 0
        expired_ids = [
            job_id for job_id, job in self.jobs.items()
            if job.is_expired()
        ]

        for job_id in expired_ids:
            del self.jobs[job_id]
            count += 1

        logger.info(f"Cleaned up {count} expired job results")
        return count
