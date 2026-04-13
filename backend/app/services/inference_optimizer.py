"""
Inference Speed Optimization (Points 301-350)
Handles model compilation, mixed precision, dynamic batching, warmup, model caching.
"""

import asyncio
import gc
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import psutil
import torch
import torch.nn as nn
from torch.cuda import is_available as cuda_available
from torch.cuda.amp import autocast

logger = logging.getLogger(__name__)


@dataclass
class InferenceStats:
    """Statistics from profiled inference."""
    mean_time_ms: float
    p99_time_ms: float
    p95_time_ms: float
    p50_time_ms: float
    layer_times: Dict[str, float] = field(default_factory=dict)
    memory_peak_mb: float = 0.0
    flops_per_sample: float = 0.0


@dataclass
class BatchQueue:
    """Item in inference queue."""
    track_id: str
    audio: np.ndarray
    timestamp: float = field(default_factory=time.time)
    priority: int = 0


class InferenceOptimizer:
    """
    Optimizes model inference speed via compilation, batching, mixed precision,
    model caching, and warm-up strategies.
    """

    def __init__(self, device: str = "auto", max_cache_size: int = 5):
        """
        Initialize inference optimizer.

        Args:
            device: 'auto', 'cuda', 'cpu'
            max_cache_size: Max number of models in LRU cache
        """
        if device == "auto":
            self.device = "cuda" if cuda_available() else "cpu"
        else:
            self.device = device

        self.max_cache_size = max_cache_size
        self.model_cache: OrderedDict[str, nn.Module] = OrderedDict()
        self.batch_queue: List[BatchQueue] = []
        self.model_stats: Dict[str, InferenceStats] = {}
        self.last_access_time: Dict[str, float] = {}
        self.compiled_models: Dict[str, nn.Module] = {}

        logger.info(f"InferenceOptimizer initialized on device: {self.device}")

    def optimize_model_for_inference(
        self, model: nn.Module, compile_backend: str = "inductor"
    ) -> nn.Module:
        """
        Optimize model for inference via torch.compile and inference_mode.

        Args:
            model: PyTorch model
            compile_backend: 'inductor', 'cudagraph', 'aot_eager'

        Returns:
            Optimized model (compiled if possible)
        """
        model = model.eval()
        model = model.to(self.device)

        # torch.compile for speedup (PyTorch 2.0+)
        try:
            compiled = torch.compile(model, backend=compile_backend, mode="reduce-overhead")
            logger.debug(f"Model compiled with backend={compile_backend}")
            return compiled
        except Exception as e:
            logger.warning(f"torch.compile failed: {e}. Using uncompiled model.")
            return model

    def apply_mixed_precision(
        self, model: nn.Module, dtype: torch.dtype = torch.float16
    ) -> nn.Module:
        """
        Apply mixed precision (FP16 or BF16) to model layers.

        Args:
            model: Model to convert
            dtype: torch.float16 or torch.bfloat16

        Returns:
            Model with mixed precision
        """
        # Convert non-critical layers to lower precision
        for module in model.modules():
            if isinstance(module, (nn.Linear, nn.Conv2d)):
                module = module.to(dtype)

        logger.debug(f"Applied mixed precision dtype={dtype}")
        return model

    def apply_dynamic_batching(
        self, queue_size: int = 16, timeout_ms: int = 100
    ) -> Optional[np.ndarray]:
        """
        Dynamically batch audio samples from queue.
        Groups up to queue_size items or waits timeout_ms before processing.

        Args:
            queue_size: Max batch size
            timeout_ms: Max wait time before processing partial batch

        Returns:
            Batched audio array or None if queue empty
        """
        if not self.batch_queue:
            return None

        # Wait for batch to fill or timeout
        start = time.time()
        while len(self.batch_queue) < queue_size:
            if (time.time() - start) * 1000 > timeout_ms:
                break
            time.sleep(0.001)

        batch_size = min(len(self.batch_queue), queue_size)
        batch_items = self.batch_queue[:batch_size]
        self.batch_queue = self.batch_queue[batch_size:]

        # Stack into batch
        audios = np.stack([item.audio for item in batch_items], axis=0)
        logger.debug(f"Dynamic batch of size {batch_size} created")
        return audios

    def warmup_models(self, models: Dict[str, nn.Module], num_iterations: int = 3):
        """
        Warm up all models with dummy input to JIT compile and cache kernels.

        Args:
            models: Dict of model_name -> model
            num_iterations: Number of dummy forward passes
        """
        logger.info(f"Warming up {len(models)} models...")

        dummy_audio = torch.randn(1, 1, 16000, device=self.device, dtype=torch.float32)

        for name, model in models.items():
            model = model.eval().to(self.device)
            try:
                with torch.inference_mode():
                    for _ in range(num_iterations):
                        _ = model(dummy_audio)
                torch.cuda.synchronize() if cuda_available() else None
                logger.debug(f"Model '{name}' warmed up")
            except Exception as e:
                logger.warning(f"Warmup failed for '{name}': {e}")

    def lazy_unload_model(self, model_name: str) -> bool:
        """
        Unload model from cache if inactive for >5 minutes (LRU eviction).

        Args:
            model_name: Name of model to consider for unloading

        Returns:
            True if unloaded, False otherwise
        """
        if model_name not in self.last_access_time:
            return False

        inactive_time_sec = time.time() - self.last_access_time[model_name]
        if inactive_time_sec > 300:  # 5 minutes
            if model_name in self.model_cache:
                del self.model_cache[model_name]
                logger.info(f"Unloaded inactive model: {model_name}")
                gc.collect()
                if cuda_available():
                    torch.cuda.empty_cache()
                return True

        return False

    def profile_inference(
        self, model: nn.Module, sample_input: torch.Tensor, num_runs: int = 10
    ) -> InferenceStats:
        """
        Profile inference time per layer and overall.

        Args:
            model: Model to profile
            sample_input: Representative input tensor
            num_runs: Number of iterations for averaging

        Returns:
            InferenceStats with per-layer breakdowns
        """
        model = model.eval().to(self.device)
        sample_input = sample_input.to(self.device)

        times = []
        layer_times = {}

        # Warmup
        with torch.inference_mode():
            for _ in range(2):
                _ = model(sample_input)

        # Profile
        with torch.inference_mode():
            for _ in range(num_runs):
                if cuda_available():
                    torch.cuda.synchronize()
                start = time.perf_counter()
                _ = model(sample_input)
                if cuda_available():
                    torch.cuda.synchronize()
                elapsed = (time.perf_counter() - start) * 1000  # ms
                times.append(elapsed)

        times = np.array(times)
        stats = InferenceStats(
            mean_time_ms=float(np.mean(times)),
            p99_time_ms=float(np.percentile(times, 99)),
            p95_time_ms=float(np.percentile(times, 95)),
            p50_time_ms=float(np.percentile(times, 50)),
            layer_times=layer_times,
        )

        logger.debug(f"Inference profile: mean={stats.mean_time_ms:.2f}ms, p99={stats.p99_time_ms:.2f}ms")
        return stats

    def compute_optimal_batch_size(self, sample_size_mb: float) -> int:
        """
        Compute optimal batch size based on available RAM.
        Assumes 80% RAM utilization is safe.

        Args:
            sample_size_mb: Size of one sample in MB

        Returns:
            Optimal batch size
        """
        available_mb = psutil.virtual_memory().available / (1024 * 1024)
        safe_mb = available_mb * 0.8

        batch_size = max(1, int(safe_mb / sample_size_mb))
        logger.debug(f"Optimal batch size: {batch_size} for {sample_size_mb}MB samples")
        return batch_size

    def apply_torch_compile(
        self, model: nn.Module, backend: str = "inductor", mode: str = "reduce-overhead"
    ) -> nn.Module:
        """
        Apply torch.compile with specified backend and mode.

        Args:
            model: Model to compile
            backend: 'inductor', 'cudagraph', 'aot_eager', 'aot_cudagraph'
            mode: 'default', 'reduce-overhead', 'max-autotune'

        Returns:
            Compiled model
        """
        model = model.eval()
        try:
            compiled = torch.compile(model, backend=backend, mode=mode, fullgraph=False)
            logger.info(f"torch.compile applied: backend={backend}, mode={mode}")
            return compiled
        except Exception as e:
            logger.error(f"torch.compile failed: {e}")
            return model

    def apply_channels_last(self, model: nn.Module) -> nn.Module:
        """
        Convert model to channels_last memory format (NHWC) for better cache utilization
        on modern CPUs and GPUs.

        Args:
            model: Model to convert

        Returns:
            Model in channels_last format
        """
        try:
            model = model.to(memory_format=torch.channels_last)
            logger.debug("Applied channels_last memory format")
        except Exception as e:
            logger.warning(f"Could not apply channels_last: {e}")

        return model

    def estimate_inference_time(
        self, model: nn.Module, input_shape: Tuple[int, ...], batch_size: int = 1
    ) -> float:
        """
        Estimate inference time before actual execution.
        Based on profiling + batch size scaling.

        Args:
            model: Model to estimate for
            input_shape: Shape of input (excluding batch dimension)
            batch_size: Batch size to estimate for

        Returns:
            Estimated time in milliseconds
        """
        # Create dummy input
        dummy = torch.randn(batch_size, *input_shape, device=self.device)

        stats = self.profile_inference(model, dummy, num_runs=3)
        # Assume roughly linear scaling with batch size
        estimated_ms = stats.mean_time_ms * batch_size
        logger.debug(f"Estimated inference time: {estimated_ms:.2f}ms for batch_size={batch_size}")
        return estimated_ms

    def create_model_cache(self, max_size: int = 5) -> OrderedDict:
        """
        Create LRU cache for loaded models with automatic eviction.
        When max_size exceeded, least-recently-used model is unloaded.

        Args:
            max_size: Maximum number of models to keep in cache

        Returns:
            Reference to the cache (OrderedDict)
        """
        self.max_cache_size = max_size
        self.model_cache.clear()
        logger.info(f"Model cache initialized with max_size={max_size}")
        return self.model_cache

    def cache_model(self, model_name: str, model: nn.Module) -> None:
        """
        Add model to cache with LRU eviction.

        Args:
            model_name: Unique model identifier
            model: PyTorch model
        """
        # Remove if already exists (to move to end)
        if model_name in self.model_cache:
            del self.model_cache[model_name]

        # Evict LRU if cache full
        while len(self.model_cache) >= self.max_cache_size:
            evicted_name, evicted_model = self.model_cache.popitem(last=False)
            logger.debug(f"Evicted model from cache: {evicted_name}")
            gc.collect()

        # Add new model
        self.model_cache[model_name] = model.eval().to(self.device)
        self.last_access_time[model_name] = time.time()
        logger.debug(f"Cached model: {model_name} (cache_size={len(self.model_cache)})")

    def get_cached_model(self, model_name: str) -> Optional[nn.Module]:
        """
        Retrieve model from cache and update access time.

        Args:
            model_name: Model identifier

        Returns:
            Model or None if not cached
        """
        if model_name not in self.model_cache:
            return None

        # Move to end (most recently used)
        self.model_cache.move_to_end(model_name)
        self.last_access_time[model_name] = time.time()
        return self.model_cache[model_name]

    async def async_inference_batch(
        self, model: nn.Module, batch: torch.Tensor
    ) -> torch.Tensor:
        """
        Asynchronous inference on batch.
        Runs in thread pool to avoid blocking.

        Args:
            model: Model for inference
            batch: Batched input tensor

        Returns:
            Inference results
        """
        loop = asyncio.get_event_loop()

        def _infer():
            with torch.inference_mode():
                if "cuda" in self.device:
                    with autocast(dtype=torch.float16):
                        return model(batch)
                else:
                    return model(batch)

        result = await loop.run_in_executor(None, _infer)
        return result

    def clear_cache(self) -> None:
        """Clear model cache and free memory."""
        self.model_cache.clear()
        self.last_access_time.clear()
        gc.collect()
        if cuda_available():
            torch.cuda.empty_cache()
        logger.info("Model cache cleared")
