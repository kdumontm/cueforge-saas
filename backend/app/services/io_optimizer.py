"""
I/O Pipeline Optimization (Points 401-440)
Handles async reading, prefetching, parallel decoding, compression, streaming, hashing.
"""

import asyncio
import hashlib
import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import BinaryIO, Callable, Dict, List, Optional

import aiofiles
import numpy as np

try:
    import xxhash
except ImportError:
    xxhash = None

logger = logging.getLogger(__name__)


@dataclass
class StorageProfile:
    """Detected storage characteristics."""
    is_ssd: bool
    is_network: bool
    is_ramdisk: bool
    avg_access_time_ms: float


class IOOptimizer:
    """
    Optimizes I/O pipeline: async reads, prefetching, parallel decode,
    compression, streaming, temp file strategy, fast hashing.
    """

    def __init__(self, max_workers: int = 4):
        """
        Initialize I/O optimizer.

        Args:
            max_workers: Max threads for parallel operations
        """
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.storage_profiles: Dict[str, StorageProfile] = {}
        self.prefetch_queue: List[str] = []

    async def async_read_audio(self, filepath: str, chunk_size: int = 8192) -> bytes:
        """
        Asynchronously read audio file without blocking.

        Args:
            filepath: Path to audio file
            chunk_size: Read chunk size in bytes

        Returns:
            Complete file contents
        """
        try:
            async with aiofiles.open(filepath, mode="rb") as f:
                contents = await f.read()
            logger.debug(f"Async read {filepath}: {len(contents)} bytes")
            return contents
        except Exception as e:
            logger.error(f"Async read failed for {filepath}: {e}")
            raise

    async def async_read_chunks(
        self, filepath: str, chunk_size: int = 8192
    ) -> asyncio.AsyncGenerator[bytes, None]:
        """
        Read audio file asynchronously in chunks.

        Args:
            filepath: Path to audio file
            chunk_size: Chunk size in bytes

        Yields:
            Chunks of data
        """
        try:
            async with aiofiles.open(filepath, mode="rb") as f:
                while True:
                    chunk = await f.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        except Exception as e:
            logger.error(f"Async chunk read failed for {filepath}: {e}")
            raise

    def prefetch_next_track(self, queue: List[str]) -> asyncio.Task:
        """
        Pre-read next track in queue asynchronously.
        Overlaps I/O of track N+1 with processing of track N.

        Args:
            queue: List of track filepaths

        Returns:
            Async task for prefetch (can be awaited later)
        """
        if not queue:
            return None

        next_track = queue[0]

        async def _prefetch():
            logger.debug(f"Prefetching {next_track}")
            try:
                _ = await self.async_read_audio(next_track)
            except Exception as e:
                logger.warning(f"Prefetch failed: {e}")

        return asyncio.create_task(_prefetch())

    def parallel_decode(
        self, filepaths: List[str], decoder_fn: Callable[[str], np.ndarray]
    ) -> List[np.ndarray]:
        """
        Decode multiple audio files in parallel using ThreadPoolExecutor.

        Args:
            filepaths: List of file paths to decode
            decoder_fn: Function to decode one file (e.g., librosa.load)

        Returns:
            List of decoded audio arrays
        """
        results = []
        futures = [
            self.executor.submit(decoder_fn, filepath)
            for filepath in filepaths
        ]

        for future in futures:
            try:
                result = future.result(timeout=60)
                results.append(result)
            except Exception as e:
                logger.error(f"Parallel decode failed: {e}")
                results.append(None)

        logger.debug(f"Parallel decode completed: {len([r for r in results if r is not None])}/{len(filepaths)}")
        return results

    def chunk_aligned_read(
        self, filepath: str, offset: int = 0, size: int = -1, page_size: int = 4096
    ) -> bytes:
        """
        Read file with alignment to page boundaries (4KB) for optimal I/O.

        Args:
            filepath: File to read
            offset: Start offset
            size: Bytes to read (-1 = all)
            page_size: Page size for alignment

        Returns:
            File contents
        """
        # Align offset to page boundary
        aligned_offset = (offset // page_size) * page_size
        padding = offset - aligned_offset

        with open(filepath, "rb") as f:
            f.seek(aligned_offset)
            aligned_size = size + padding if size > 0 else -1
            data = f.read(aligned_size) if aligned_size > 0 else f.read()

        result = data[padding : padding + size] if size > 0 else data[padding :]
        logger.debug(f"Chunk-aligned read: offset={offset}, aligned_offset={aligned_offset}")
        return result

    def compress_analysis_result(
        self, data: bytes, compression: str = "brotli"
    ) -> bytes:
        """
        Compress analysis results for efficient storage/transmission.

        Args:
            data: Data to compress
            compression: 'brotli' or 'gzip'

        Returns:
            Compressed data
        """
        try:
            if compression == "brotli":
                import brotli
                compressed = brotli.compress(data)
            elif compression == "gzip":
                import gzip
                compressed = gzip.compress(data, compresslevel=6)
            else:
                raise ValueError(f"Unknown compression: {compression}")

            ratio = len(compressed) / len(data)
            logger.debug(f"Compressed {len(data)} -> {len(compressed)} bytes (ratio={ratio:.2f})")
            return compressed
        except ImportError as e:
            logger.warning(f"Compression library not available: {e}")
            return data

    def decompress_analysis_result(self, data: bytes, compression: str = "brotli") -> bytes:
        """
        Decompress analysis results.

        Args:
            data: Compressed data
            compression: 'brotli' or 'gzip'

        Returns:
            Decompressed data
        """
        try:
            if compression == "brotli":
                import brotli
                return brotli.decompress(data)
            elif compression == "gzip":
                import gzip
                return gzip.decompress(data)
            else:
                raise ValueError(f"Unknown compression: {compression}")
        except ImportError as e:
            logger.warning(f"Decompression library not available: {e}")
            return data

    async def stream_waveform_data(
        self, filepath: str, chunk_duration_sec: float = 1.0, sample_rate: int = 16000
    ) -> asyncio.AsyncGenerator[np.ndarray, None]:
        """
        Stream waveform data in chunks instead of loading entire file.
        Reduces memory footprint for large files.

        Args:
            filepath: Audio file path
            chunk_duration_sec: Duration of each chunk in seconds
            sample_rate: Sample rate in Hz

        Yields:
            Chunks of waveform data
        """
        chunk_samples = int(chunk_duration_sec * sample_rate)

        try:
            async for raw_chunk in self.async_read_chunks(filepath):
                # Convert bytes to float32 samples
                samples = np.frombuffer(raw_chunk, dtype=np.float32)

                # Yield in fixed-size chunks
                for i in range(0, len(samples), chunk_samples):
                    yield samples[i : i + chunk_samples]
        except Exception as e:
            logger.error(f"Waveform streaming failed: {e}")

    def batch_file_operations(
        self, operations: List[tuple]
    ) -> None:
        """
        Batch multiple file operations to reduce system calls.
        Operations like: ('read', path), ('write', path, data), ('delete', path)

        Args:
            operations: List of (operation, *args) tuples
        """
        for op in operations:
            try:
                if op[0] == "read":
                    with open(op[1], "rb") as f:
                        _ = f.read()
                elif op[0] == "write":
                    with open(op[1], "wb") as f:
                        f.write(op[2])
                elif op[0] == "delete":
                    os.remove(op[1])
            except Exception as e:
                logger.error(f"Batched operation failed: {e}")

        logger.debug(f"Batched {len(operations)} file operations")

    def optimize_temp_files(self, prefer_ramdisk: bool = True) -> str:
        """
        Return optimized temp directory.
        Prefers /dev/shm (ramdisk) if available, falls back to /tmp.

        Args:
            prefer_ramdisk: Try to use ramdisk if available

        Returns:
            Path to temp directory
        """
        if prefer_ramdisk and os.path.exists("/dev/shm") and os.access("/dev/shm", os.W_OK):
            logger.debug("Using /dev/shm for temp files (ramdisk)")
            return "/dev/shm"

        return tempfile.gettempdir()

    def compute_file_hash_fast(
        self, filepath: str, algorithm: str = "xxhash64", chunk_size: int = 65536
    ) -> str:
        """
        Compute file hash quickly using xxhash (faster than MD5/SHA).

        Args:
            filepath: File to hash
            algorithm: 'xxhash64' (fast), 'xxhash128', 'md5', 'sha256'
            chunk_size: Read chunk size

        Returns:
            Hex digest
        """
        if algorithm.startswith("xxhash") and xxhash:
            if algorithm == "xxhash64":
                hasher = xxhash.xxh64()
            elif algorithm == "xxhash128":
                hasher = xxhash.xxh128()
            else:
                hasher = xxhash.xxh64()
        elif algorithm == "md5":
            hasher = hashlib.md5()
        elif algorithm == "sha256":
            hasher = hashlib.sha256()
        else:
            hasher = hashlib.md5()

        try:
            with open(filepath, "rb") as f:
                while True:
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    hasher.update(chunk)

            digest = hasher.hexdigest()
            logger.debug(f"Computed {algorithm} hash for {filepath}: {digest[:16]}...")
            return digest
        except Exception as e:
            logger.error(f"Hash computation failed for {filepath}: {e}")
            raise

    def detect_storage_type(self, filepath: str) -> StorageProfile:
        """
        Detect storage type (SSD vs HDD vs network) for path optimization.

        Args:
            filepath: File path to detect storage for

        Returns:
            StorageProfile with detected characteristics
        """
        # Get mount point
        path = os.path.abspath(filepath)
        while path != "/":
            if os.path.ismount(path):
                break
            path = os.path.dirname(path)

        is_ssd = False
        is_network = False
        is_ramdisk = False

        # Heuristics
        if "ramdisk" in path or path in ["/dev/shm", "/tmp"]:
            is_ramdisk = True
        elif "nfs" in path or "smb" in path or "network" in path:
            is_network = True
        else:
            # Try to detect SSD via rotation (Linux)
            try:
                import subprocess

                result = subprocess.run(
                    ["lsblk", "-d", "-n", "-o", "ROTA", f"/{path.split(os.sep)[1]}"],
                    capture_output=True,
                    text=True,
                )
                is_ssd = result.stdout.strip() == "0"
            except Exception:
                pass

        # Estimate access time
        avg_access_ms = 5.0 if is_ssd else (15.0 if is_network else 10.0)

        profile = StorageProfile(
            is_ssd=is_ssd,
            is_network=is_network,
            is_ramdisk=is_ramdisk,
            avg_access_time_ms=avg_access_ms,
        )

        logger.debug(f"Storage profile for {path}: SSD={is_ssd}, network={is_network}, ramdisk={is_ramdisk}")
        self.storage_profiles[path] = profile
        return profile

    async def async_prefetch_and_process(
        self,
        track_queue: List[str],
        process_fn: Callable[[bytes], None],
    ) -> None:
        """
        Prefetch next track while processing current track asynchronously.

        Args:
            track_queue: Queue of track filepaths
            process_fn: Sync function to process track data
        """
        if not track_queue:
            return

        prefetch_task = None
        for i, track in enumerate(track_queue):
            # Start prefetch for next track
            if i + 1 < len(track_queue):
                next_track = track_queue[i + 1]
                prefetch_task = asyncio.create_task(self.async_read_audio(next_track))

            # Process current track
            data = await self.async_read_audio(track)
            process_fn(data)

            # Wait for prefetch if needed
            if prefetch_task:
                await prefetch_task

        logger.debug("Async prefetch+process completed")

    def shutdown(self) -> None:
        """Shutdown executor and cleanup."""
        self.executor.shutdown(wait=True)
        logger.debug("IOOptimizer shutdown")
