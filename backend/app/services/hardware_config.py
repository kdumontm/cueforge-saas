"""
Hardware detection and configuration for optimal audio analysis performance.
Auto-detects GPU/CPU capabilities and configures libraries accordingly.
Points 91-92: GPU detection and multi-core acceleration.
"""
import os
import logging
import multiprocessing
from typing import Dict, Any

logger = logging.getLogger(__name__)

_hardware_info = None


def detect_hardware() -> Dict[str, Any]:
    """Detect available hardware for audio analysis."""
    global _hardware_info
    if _hardware_info is not None:
        return _hardware_info

    info = {
        'cpu_count': multiprocessing.cpu_count() or 4,
        'cuda_available': False,
        'cuda_device': None,
        'cuda_memory_gb': 0,
        'ram_gb': 0,
        'optimal_threads': 4,
        'optimal_batch_size': 1,
    }

    # Detect RAM
    try:
        import psutil
        info['ram_gb'] = round(psutil.virtual_memory().total / (1024**3), 1)
    except ImportError:
        pass

    # Detect CUDA GPU
    try:
        import torch
        if torch.cuda.is_available():
            info['cuda_available'] = True
            info['cuda_device'] = torch.cuda.get_device_name(0)
            info['cuda_memory_gb'] = round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1)
            logger.info(f"GPU detected: {info['cuda_device']} ({info['cuda_memory_gb']} GB)")
    except (ImportError, Exception) as e:
        logger.debug(f"No CUDA GPU: {e}")

    # Calculate optimal thread count
    # For audio: use physical cores (not hyperthreads), cap at 8
    physical_cores = info['cpu_count'] // 2 or 2
    info['optimal_threads'] = min(physical_cores, 8)

    # Batch size based on RAM
    if info['ram_gb'] >= 16:
        info['optimal_batch_size'] = 4
    elif info['ram_gb'] >= 8:
        info['optimal_batch_size'] = 2
    else:
        info['optimal_batch_size'] = 1

    _hardware_info = info
    logger.info(f"Hardware: {info['cpu_count']} CPUs, {info['ram_gb']}GB RAM, "
                f"GPU: {info['cuda_device'] or 'None'}, "
                f"optimal threads: {info['optimal_threads']}")
    return info


def configure_torch():
    """Configure PyTorch for optimal performance on detected hardware."""
    info = detect_hardware()

    try:
        import torch

        # Set thread count for CPU operations
        torch.set_num_threads(info['optimal_threads'])
        torch.set_num_interop_threads(2)

        # Disable gradient computation globally for inference
        torch.set_grad_enabled(False)

        logger.info(f"PyTorch configured: {info['optimal_threads']} threads, "
                     f"device={'cuda' if info['cuda_available'] else 'cpu'}")
    except ImportError:
        pass


def configure_numpy():
    """Configure NumPy/MKL thread count."""
    info = detect_hardware()
    threads = str(info['optimal_threads'])

    # Set thread counts for various BLAS backends
    os.environ.setdefault('OMP_NUM_THREADS', threads)
    os.environ.setdefault('MKL_NUM_THREADS', threads)
    os.environ.setdefault('OPENBLAS_NUM_THREADS', threads)
    os.environ.setdefault('NUMBA_NUM_THREADS', threads)

    logger.info(f"NumPy/BLAS configured: {threads} threads")


def get_device():
    """Get optimal PyTorch device for inference."""
    info = detect_hardware()
    try:
        import torch
        if info['cuda_available']:
            return torch.device('cuda')
    except ImportError:
        pass
    return 'cpu'


def configure_all():
    """Configure all libraries for optimal performance. Call at app startup."""
    configure_numpy()
    configure_torch()
    info = detect_hardware()
    return info
