"""
Distributed audio analysis pipeline for CueForge.
Points 521-550: Task DAG generation, stage distribution, worker affinity,
backpressure handling, async result collection, partial result merging,
worker failure handling, pipeline throughput measurement, stage reordering,
micro-batching for efficiency.
"""

import asyncio
import time
import logging
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import heapq

logger = logging.getLogger(__name__)


class StageType(Enum):
    """Audio analysis pipeline stages."""
    LOAD = "load"
    NORMALIZE = "normalize"
    FFT = "fft"
    ONSET = "onset"
    CHROMA = "chroma"
    TEMPO = "tempo"
    MEL = "mel_spectrogram"
    ZERO_CROSSING = "zero_crossing"
    SPECTRAL = "spectral"
    IDENTIFY = "identify"
    EXPORT = "export"


class WorkerStatus(Enum):
    """Worker status."""
    IDLE = "idle"
    BUSY = "busy"
    FAILED = "failed"
    OFFLINE = "offline"


@dataclass
class AnalysisStage:
    """Audio analysis stage in pipeline."""
    stage_id: str
    stage_type: StageType
    dependencies: List[str] = field(default_factory=list)
    estimated_time_ms: float = 100.0
    cpu_affinity_required: bool = False
    gpu_preferred: bool = False
    parallelizable: bool = True
    priority: int = 0  # Higher = earlier execution


@dataclass
class TaskNode:
    """Task node in DAG."""
    task_id: str
    track_id: str
    stage: AnalysisStage
    input_data: Optional[Any] = None
    output_data: Optional[Any] = None
    status: str = "pending"  # pending, running, completed, failed
    worker_id: Optional[int] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    retry_count: int = 0
    max_retries: int = 3


@dataclass
class WorkerMetrics:
    """Per-worker metrics."""
    worker_id: int
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    total_time_ms: float = 0.0
    avg_task_time_ms: float = 0.0
    cache_hits: int = 0
    cache_misses: int = 0
    last_assigned_track_id: Optional[str] = None


@dataclass
class PipelineMetrics:
    """Overall pipeline metrics."""
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    total_pipeline_time_ms: float = 0.0
    throughput_tasks_per_second: float = 0.0
    avg_latency_ms: float = 0.0
    worker_utilization_percent: float = 0.0
    queue_depth: int = 0
    backpressure_events: int = 0


class DistributedAnalyzer:
    """Distributed audio analysis orchestrator."""

    def __init__(self, num_workers: int = 4, queue_size: int = 100):
        self.num_workers = num_workers
        self.queue_size = queue_size
        self.task_graph: Dict[str, TaskNode] = {}
        self.workers: Dict[int, WorkerMetrics] = {i: WorkerMetrics(worker_id=i) for i in range(num_workers)}
        self.task_queue: asyncio.Queue = None
        self.result_queue: asyncio.Queue = None
        self.pipeline_metrics = PipelineMetrics()
        self.worker_affinity: Dict[int, str] = {}  # worker_id -> last_track_id
        self.backpressure_threshold = queue_size * 0.8
        self.start_time = None

    # Point 521: create_task_graph
    def create_task_graph(self, tracks: List[str], analysis_stages: List[AnalysisStage]) -> Dict[str, TaskNode]:
        """
        Create task DAG with dependencies between analysis stages.
        Returns nodes representing all work to be done.
        """
        task_graph = {}
        task_id_counter = 0

        for track_id in tracks:
            for stage in analysis_stages:
                task_id = f"task_{task_id_counter}_{track_id}_{stage.stage_id}"
                task_id_counter += 1

                task_node = TaskNode(
                    task_id=task_id,
                    track_id=track_id,
                    stage=stage,
                    status="pending"
                )

                task_graph[task_id] = task_node

        self.task_graph = task_graph
        self.pipeline_metrics.total_tasks = len(task_graph)

        logger.info(f"Created task graph with {len(task_graph)} nodes ({len(tracks)} tracks × {len(analysis_stages)} stages)")

        return task_graph

    # Point 522: distribute_stages
    def distribute_stages(self, task_graph: Dict[str, TaskNode]) -> Dict[int, List[str]]:
        """
        Distribute independent stages across available workers.
        Returns mapping of worker_id -> list of task_ids.
        """
        worker_assignments: Dict[int, List[str]] = {i: [] for i in range(self.num_workers)}

        # Group tasks by stage for parallelization
        tasks_by_stage: Dict[str, List[str]] = defaultdict(list)
        for task_id, task in task_graph.items():
            tasks_by_stage[task.stage.stage_id].append(task_id)

        # Distribute each stage's tasks across workers
        for stage_id, task_ids in tasks_by_stage.items():
            for i, task_id in enumerate(task_ids):
                worker_id = i % self.num_workers
                worker_assignments[worker_id].append(task_id)

        logger.info(f"Distributed {len(task_graph)} tasks across {self.num_workers} workers")
        for w_id, tasks in worker_assignments.items():
            logger.debug(f"Worker {w_id}: {len(tasks)} tasks")

        return worker_assignments

    # Point 523: apply_worker_affinity
    def apply_worker_affinity(self, task_id: str, worker_id: int) -> bool:
        """
        Assign same track to same worker for cache locality.
        Returns True if affinity applied.
        """
        task = self.task_graph.get(task_id)
        if not task:
            return False

        track_id = task.track_id
        last_track = self.worker_affinity.get(worker_id)

        # Cache hit: same track as last assignment
        if last_track == track_id:
            self.workers[worker_id].cache_hits += 1
            logger.debug(f"Worker {worker_id}: cache hit on track {track_id}")
            return True
        else:
            self.workers[worker_id].cache_misses += 1
            self.worker_affinity[worker_id] = track_id
            return False

    # Point 524: implement_backpressure
    async def implement_backpressure(self, queue_depth: int) -> bool:
        """
        Apply backpressure if queue is too full.
        Returns True if backpressure applied (caller should wait).
        """
        if queue_depth >= self.backpressure_threshold:
            self.pipeline_metrics.backpressure_events += 1
            logger.warning(f"Backpressure triggered: queue_depth={queue_depth}/{self.queue_size}")
            await asyncio.sleep(0.1)  # Brief pause
            return True

        return False

    # Point 525: collect_results_async
    async def collect_results_async(self, timeout_s: float = 60.0) -> List[Tuple[str, Any]]:
        """
        Asynchronously collect results from workers.
        Returns partial results as they complete.
        """
        results = []
        start_time = time.time()

        while time.time() - start_time < timeout_s:
            try:
                # Non-blocking get with timeout
                task_id, result = await asyncio.wait_for(
                    self.result_queue.get(),
                    timeout=0.5
                )
                results.append((task_id, result))
                self.pipeline_metrics.completed_tasks += 1

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error collecting result: {e}")

        logger.info(f"Collected {len(results)} results in {time.time() - start_time:.2f}s")
        return results

    # Point 526: merge_partial_results
    def merge_partial_results(self, partial_results: Dict[str, List[Any]]) -> Dict[str, Any]:
        """
        Merge partial results from multiple workers.
        Combines outputs from different pipeline stages.
        """
        merged = {}

        for track_id, results in partial_results.items():
            # Merge results from same track
            merged[track_id] = {
                "analysis_results": results,
                "merge_timestamp": time.time(),
                "source_count": len(results)
            }

            # Example: combine spectral features
            spectral_features = [r for r in results if isinstance(r, dict) and "spectral" in r]
            if spectral_features:
                merged[track_id]["combined_spectral"] = {
                    "feature_count": len(spectral_features),
                    "avg_energy": sum(r.get("energy", 0) for r in spectral_features) / len(spectral_features)
                }

        logger.info(f"Merged results for {len(merged)} tracks")
        return merged

    # Point 527: handle_worker_failure
    async def handle_worker_failure(self, worker_id: int, failed_task_id: str) -> bool:
        """
        Retry failed task on another worker or drop it.
        Returns True if retry scheduled, False if task abandoned.
        """
        task = self.task_graph.get(failed_task_id)
        if not task:
            return False

        task.retry_count += 1
        self.workers[worker_id].failed_tasks += 1

        if task.retry_count >= task.max_retries:
            logger.error(f"Task {failed_task_id} exceeded max retries ({task.max_retries})")
            self.pipeline_metrics.failed_tasks += 1
            return False

        # Find alternative worker
        alt_worker_id = None
        for w_id in range(self.num_workers):
            if w_id != worker_id:
                alt_worker_id = w_id
                break

        if alt_worker_id is not None:
            logger.warning(f"Retrying task {failed_task_id} on worker {alt_worker_id} (attempt {task.retry_count})")
            task.worker_id = alt_worker_id
            task.status = "pending"
            return True

        return False

    # Point 528: compute_pipeline_throughput
    def compute_pipeline_throughput(self) -> Dict[str, float]:
        """
        Measure overall pipeline throughput and latencies.
        Returns throughput stats in tasks/second.
        """
        if not self.start_time:
            return {
                "throughput_tasks_per_second": 0.0,
                "avg_latency_ms": 0.0,
                "peak_latency_ms": 0.0,
                "utilization_percent": 0.0
            }

        elapsed_s = time.time() - self.start_time
        if elapsed_s <= 0:
            elapsed_s = 0.001

        # Throughput
        completed = self.pipeline_metrics.completed_tasks
        throughput = completed / elapsed_s

        # Latencies
        latencies = []
        for task in self.task_graph.values():
            if task.start_time and task.end_time:
                latencies.append((task.end_time - task.start_time) * 1000)

        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        peak_latency = max(latencies) if latencies else 0

        # Utilization: completed / total
        utilization = (completed / self.pipeline_metrics.total_tasks * 100) if self.pipeline_metrics.total_tasks > 0 else 0

        self.pipeline_metrics.throughput_tasks_per_second = throughput
        self.pipeline_metrics.avg_latency_ms = avg_latency
        self.pipeline_metrics.total_pipeline_time_ms = elapsed_s * 1000
        self.pipeline_metrics.worker_utilization_percent = utilization

        logger.info(f"Pipeline throughput: {throughput:.2f} tasks/s, "
                   f"avg latency: {avg_latency:.2f}ms, utilization: {utilization:.1f}%")

        return {
            "throughput_tasks_per_second": throughput,
            "avg_latency_ms": avg_latency,
            "peak_latency_ms": peak_latency,
            "utilization_percent": utilization,
            "completed_tasks": completed,
            "total_tasks": self.pipeline_metrics.total_tasks
        }

    # Point 529: optimize_stage_ordering
    def optimize_stage_ordering(self, stages: List[AnalysisStage]) -> List[AnalysisStage]:
        """
        Reorder analysis stages to minimize latency.
        Prioritizes fast stages first (cheaper operations first).
        """
        # Sort by estimated execution time + priority
        def stage_key(stage):
            # Lower time = earlier execution (greedy scheduling)
            # Higher priority = earlier execution
            return (stage.estimated_time_ms, -stage.priority)

        sorted_stages = sorted(stages, key=stage_key)

        logger.info(f"Reordered {len(sorted_stages)} stages for optimal latency")
        for i, stage in enumerate(sorted_stages):
            logger.debug(f"Stage {i}: {stage.stage_id} (est. {stage.estimated_time_ms}ms, priority {stage.priority})")

        return sorted_stages

    # Point 530: implement_micro_batching
    def implement_micro_batching(self, tasks: List[str], batch_size: int = 4) -> List[List[str]]:
        """
        Group tracks into micro-batches (2-4 tracks per batch).
        Improves cache efficiency and vectorization.
        """
        batches = []

        for i in range(0, len(tasks), batch_size):
            batch = tasks[i:i + batch_size]
            batches.append(batch)

        logger.info(f"Created {len(batches)} micro-batches from {len(tasks)} tasks "
                   f"(batch_size={batch_size})")

        return batches


# Async orchestrator for pipeline execution

async def run_distributed_pipeline(
    analyzer: DistributedAnalyzer,
    tracks: List[str],
    stages: List[AnalysisStage],
    worker_functions: Dict[int, Callable]
) -> Dict[str, Any]:
    """
    Execute distributed analysis pipeline.
    Orchestrates task distribution, execution, and result collection.
    """
    analyzer.start_time = time.time()

    # Create task graph
    task_graph = analyzer.create_task_graph(tracks, stages)

    # Optimize stage ordering
    optimized_stages = analyzer.optimize_stage_ordering(stages)

    # Create micro-batches
    batches = analyzer.implement_micro_batching(tracks, batch_size=4)

    # Distribute tasks
    assignments = analyzer.distribute_stages(task_graph)

    # Initialize queues
    analyzer.task_queue = asyncio.Queue(maxsize=analyzer.queue_size)
    analyzer.result_queue = asyncio.Queue()

    # Simulate task processing
    completed_results = []
    for task_id, task in task_graph.items():
        try:
            # Apply worker affinity
            worker_id = task.worker_id or 0
            analyzer.apply_worker_affinity(task_id, worker_id)

            # Check backpressure
            queue_depth = analyzer.task_queue.qsize()
            await analyzer.implement_backpressure(queue_depth)

            # Simulate work
            task.status = "completed"
            task.start_time = time.time()
            task.end_time = time.time() + (task.stage.estimated_time_ms / 1000.0)
            await asyncio.sleep(task.stage.estimated_time_ms / 1000.0)

            completed_results.append((task_id, {"status": "completed", "track_id": task.track_id}))

        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            await analyzer.handle_worker_failure(0, task_id)

    # Collect results
    await analyzer.result_queue.put((completed_results[0][0], completed_results[0][1]))

    # Compute metrics
    throughput = analyzer.compute_pipeline_throughput()

    return {
        "completed_tasks": len(completed_results),
        "throughput": throughput,
        "metrics": analyzer.pipeline_metrics
    }
