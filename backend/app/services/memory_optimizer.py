"""
Memory Optimization (Points 351-400)
Handles buffer pooling, arena allocation, memory monitoring, OOM prediction, and cleanup.
"""

import gc
import logging
import mmap
import os
import resource
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

import numpy as np
import psutil
import torch

logger = logging.getLogger(__name__)


@dataclass
class MemoryReport:
    """Detailed memory usage report."""
    rss_mb: float  # Resident Set Size
    vms_mb: float  # Virtual Memory Size
    heap_mb: float
    gpu_memory_mb: float = 0.0
    pressure_percent: float = 0.0
    timestamp: float = field(default_factory=lambda: __import__("time").time())


class AudioBufferPool:
    """
    Pre-allocated pool of audio buffers to avoid malloc/free overhead.
    Reuses buffers across analyses.
    """

    def __init__(self, pool_size: int = 10, buffer_size: int = 16000 * 30):
        """
        Initialize buffer pool.

        Args:
            pool_size: Number of buffers in pool
            buffer_size: Samples per buffer (default 30sec @ 16kHz)
        """
        self.pool_size = pool_size
        self.buffer_size = buffer_size
        self.available: Deque[np.ndarray] = deque(maxlen=pool_size)
        self.in_use: Dict[int, np.ndarray] = {}

        # Pre-allocate all buffers
        for _ in range(pool_size):
            buf = np.zeros(buffer_size, dtype=np.float32)
            self.available.append(buf)

        logger.debug(f"AudioBufferPool created: size={pool_size}, buffer_size={buffer_size}")

    def acquire(self) -> np.ndarray:
        """
        Get a buffer from pool or allocate new one.

        Returns:
            Pre-allocated buffer (may contain garbage, caller must initialize)
        """
        if self.available:
            buf = self.available.popleft()
        else:
            buf = np.zeros(self.buffer_size, dtype=np.float32)
            logger.warning("Buffer pool exhausted, allocating new buffer")

        buf_id = id(buf)
        self.in_use[buf_id] = buf
        return buf

    def release(self, buffer: np.ndarray) -> None:
        """
        Return buffer to pool for reuse.

        Args:
            buffer: Buffer to release
        """
        buf_id = id(buffer)
        if buf_id in self.in_use:
            del self.in_use[buf_id]
            self.available.append(buffer)

    def get_stats(self) -> Dict[str, int]:
        """Get pool statistics."""
        return {
            "available": len(self.available),
            "in_use": len(self.in_use),
            "total": self.pool_size,
        }


class ArenaAllocator:
    """
    Arena allocation strategy for complete analyses.
    Pre-allocates large contiguous block, sub-allocates from it.
    Simplifies cleanup: free arena = free all allocations.
    """

    def __init__(self, arena_size_mb: int = 512):
        """
        Initialize arena.

        Args:
            arena_size_mb: Total arena size in MB
        """
        self.arena_size_bytes = arena_size_mb * 1024 * 1024
        self.arena = np.zeros(self.arena_size_bytes, dtype=np.uint8)
        self.offset = 0
        self.allocations: List[Tuple[int, int]] = []  # (offset, size)

        logger.debug(f"Arena allocator created: {arena_size_mb}MB")

    def allocate(self, size_bytes: int) -> np.ndarray:
        """
        Allocate memory from arena.

        Args:
            size_bytes: Number of bytes to allocate

        Returns:
            NumPy array view into arena

        Raises:
            MemoryError: If arena exhausted
        """
        if self.offset + size_bytes > self.arena_size_bytes:
            raise MemoryError(f"Arena exhausted: requested {size_bytes}, available {self.arena_size_bytes - self.offset}")

        offset = self.offset
        self.offset += size_bytes
        self.allocations.append((offset, size_bytes))

        # Return view into arena
        return self.arena[offset : offset + size_bytes]

    def clear(self) -> None:
        """Clear arena and reset."""
        self.arena.fill(0)
        self.offset = 0
        self.allocations.clear()
        logger.debug("Arena cleared")

    def get_stats(self) -> Dict[str, int]:
        """Get arena statistics."""
        return {
            "total_bytes": self.arena_size_bytes,
            "used_bytes": self.offset,
            "free_bytes": self.arena_size_bytes - self.offset,
            "allocations": len(self.allocations),
        }


class MemoryOptimizer:
    """
    Comprehensive memory optimization: monitoring, prediction, cleanup, constraints.
    """

    def __init__(self):
        """Initialize memory optimizer."""
        self.buffer_pool = AudioBufferPool(pool_size=10)
        self.arena_allocator = ArenaAllocator(arena_size_mb=512)
        self.memory_history: Deque[MemoryReport] = deque(maxlen=1000)
        self.oom_threshold_percent = 90.0
        self.memory_limit_soft_mb: Optional[int] = None

    def create_audio_buffer_pool(
        self, pool_size: int = 10, buffer_size: int = 16000 * 30
    ) -> AudioBufferPool:
        """
        Create pre-allocated audio buffer pool.

        Args:
            pool_size: Number of buffers
            buffer_size: Samples per buffer

        Returns:
            AudioBufferPool instance
        """
        self.buffer_pool = AudioBufferPool(pool_size, buffer_size)
        return self.buffer_pool

    def create_arena_allocator(self, arena_size_mb: int = 512) -> ArenaAllocator:
        """
        Create arena allocator for analysis session.

        Args:
            arena_size_mb: Arena size in MB

        Returns:
            ArenaAllocator instance
        """
        self.arena_allocator = ArenaAllocator(arena_size_mb)
        return self.arena_allocator

    def monitor_memory_pressure(self) -> MemoryReport:
        """
        Monitor current memory pressure.
        Alerts if >80% RAM utilization.

        Returns:
            MemoryReport with current stats
        """
        vm = psutil.virtual_memory()
        process = psutil.Process()
        process_info = process.memory_info()

        pressure_percent = vm.percent
        report = MemoryReport(
            rss_mb=process_info.rss / (1024 * 1024),
            vms_mb=process_info.vms / (1024 * 1024),
            heap_mb=vm.used / (1024 * 1024),
            pressure_percent=pressure_percent,
        )

        # GPU memory if available
        try:
            if torch.cuda.is_available():
                report.gpu_memory_mb = torch.cuda.memory_allocated() / (1024 * 1024)
        except Exception:
            pass

        self.memory_history.append(report)

        if pressure_percent > 80:
            logger.warning(f"High memory pressure: {pressure_percent:.1f}%")
        elif pressure_percent > self.oom_threshold_percent:
            logger.error(f"Critical memory pressure: {pressure_percent:.1f}%")

        return report

    def predict_oom(
        self, file_size_mb: float, memory_amplification_factor: float = 5.0
    ) -> Tuple[bool, float]:
        """
        Predict OOM before analysis launch.
        Multiplies file size by amplification factor (audio expansion, features, etc).

        Args:
            file_size_mb: Input file size in MB
            memory_amplification_factor: Multiplier (typically 3-10x)

        Returns:
            (will_oom, required_mb)
        """
        required_mb = file_size_mb * memory_amplification_factor
        available_mb = psutil.virtual_memory().available / (1024 * 1024)

        will_oom = required_mb > available_mb * 0.9  # 90% threshold

        logger.debug(
            f"OOM prediction: file={file_size_mb:.1f}MB, required={required_mb:.1f}MB, "
            f"available={available_mb:.1f}MB, will_oom={will_oom}"
        )

        return will_oom, required_mb

    def optimize_numpy_memory(self, array: np.ndarray) -> np.ndarray:
        """
        Optimize NumPy memory: force float32, use views, enable in-place ops.

        Args:
            array: NumPy array to optimize

        Returns:
            Optimized array (may be view)
        """
        # Ensure float32 (not float64)
        if array.dtype == np.float64:
            array = array.astype(np.float32)

        # Ensure C-contiguous (better cache locality)
        if not array.flags["C_CONTIGUOUS"]:
            array = np.ascontiguousarray(array)

        return array

    def create_feature_buffer_ring(self, num_buffers: int = 4, features_per_frame: int = 128) -> Deque:
        """
        Create ring buffer for temporary feature buffers.
        Circular buffer with fixed size, prevents unbounded growth.

        Args:
            num_buffers: Number of buffers in ring
            features_per_frame: Features per time frame

        Returns:
            Deque-based ring buffer
        """
        ring: Deque = deque(maxlen=num_buffers)
        for _ in range(num_buffers):
            buf = np.zeros((features_per_frame, 512), dtype=np.float32)
            ring.append(buf)

        logger.debug(f"Feature ring buffer created: {num_buffers} buffers, {features_per_frame} features")
        return ring

    def cleanup_after_analysis(self) -> None:
        """
        Aggressive cleanup after analysis: GC, CUDA cache empty, arena reset.
        """
        gc.collect()
        gc.collect()  # Two passes for deeply nested refs

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        self.arena_allocator.clear()
        self.buffer_pool.available.clear()

        logger.debug("Post-analysis cleanup completed")

    def get_memory_report(self) -> MemoryReport:
        """
        Get detailed memory usage report.

        Returns:
            MemoryReport with process and system stats
        """
        vm = psutil.virtual_memory()
        process = psutil.Process()
        process_info = process.memory_info()

        report = MemoryReport(
            rss_mb=process_info.rss / (1024 * 1024),
            vms_mb=process_info.vms / (1024 * 1024),
            heap_mb=vm.used / (1024 * 1024),
            pressure_percent=vm.percent,
        )

        try:
            if torch.cuda.is_available():
                report.gpu_memory_mb = torch.cuda.memory_allocated() / (1024 * 1024)
        except Exception:
            pass

        return report

    def apply_memory_limit(self, soft_limit_mb: int) -> None:
        """
        Apply soft memory limit per analysis via resource.RLIMIT_AS.
        Process will crash if exceeded (hard limit).

        Args:
            soft_limit_mb: Memory limit in MB
        """
        soft_limit_bytes = soft_limit_mb * 1024 * 1024

        try:
            hard, _ = resource.getrlimit(resource.RLIMIT_AS)
            resource.setrlimit(resource.RLIMIT_AS, (soft_limit_bytes, hard))
            self.memory_limit_soft_mb = soft_limit_mb
            logger.info(f"Memory limit set: {soft_limit_mb}MB")
        except Exception as e:
            logger.warning(f"Could not set memory limit: {e}")

    def mmap_large_audio(self, filepath: str, file_size_mb: float = 100.0) -> Optional[np.ndarray]:
        """
        Memory-map large audio files (>100MB) to avoid full load.
        Allows processing while keeping most data on disk.

        Args:
            filepath: Path to audio file
            file_size_mb: Threshold for using mmap

        Returns:
            Memory-mapped array or None if not applicable

        Raises:
            FileNotFoundError: If file not found
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        file_size = os.path.getsize(filepath) / (1024 * 1024)

        if file_size <= file_size_mb:
            return None

        try:
            with open(filepath, "rb") as f:
                mm = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
                logger.info(f"Memory-mapped {filepath} ({file_size:.1f}MB)")
                return mm
        except Exception as e:
            logger.error(f"Failed to mmap {filepath}: {e}")
            return None

    def get_memory_stats(self) -> Dict:
        """
        Get comprehensive memory statistics.

        Returns:
            Dict with buffer pool, arena, process memory stats
        """
        return {
            "buffer_pool": self.buffer_pool.get_stats(),
            "arena_allocator": self.arena_allocator.get_stats(),
            "memory_report": {
                "rss_mb": self.memory_history[-1].rss_mb if self.memory_history else 0,
                "vms_mb": self.memory_history[-1].vms_mb if self.memory_history else 0,
                "pressure_percent": self.memory_history[-1].pressure_percent if self.memory_history else 0,
            },
        }
