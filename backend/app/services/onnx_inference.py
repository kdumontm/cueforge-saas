"""
ONNX Runtime inference for audio analysis models.
Provides 2-5× speedup over PyTorch on CPU via ONNX + optional INT8 quantization.

Designed for beat_this model acceleration on CPU-only environments.
Graceful fallback to PyTorch if ONNX not available.
"""
import os
import logging
import numpy as np
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

logger = logging.getLogger(__name__)

# Cache directory for ONNX models
ONNX_CACHE_DIR = Path(os.environ.get('ONNX_CACHE_DIR', '/tmp/cueforge_onnx_cache'))

_onnx_session = None
_onnx_available = None


def is_onnx_available() -> bool:
    """Check if ONNX Runtime is available."""
    global _onnx_available
    if _onnx_available is None:
        try:
            import onnxruntime  # noqa: F401
            _onnx_available = True
            logger.info("ONNX Runtime available — will use for acceleration")
        except ImportError:
            _onnx_available = False
            logger.debug("ONNX Runtime not available, will use PyTorch fallback")
    return _onnx_available


def export_model_to_onnx(
    pytorch_model: Any,
    input_shape: Tuple[int, ...],
    output_path: str
) -> bool:
    """
    Export a PyTorch model to ONNX format.

    Args:
        pytorch_model: The PyTorch model instance
        input_shape: Shape of input tensor (e.g., (1, 1, sr*duration))
        output_path: Path where ONNX model will be saved

    Returns:
        True if export succeeded, False otherwise
    """
    try:
        import torch
        ONNX_CACHE_DIR.mkdir(parents=True, exist_ok=True)

        dummy_input = torch.randn(*input_shape)
        torch.onnx.export(
            pytorch_model,
            dummy_input,
            output_path,
            opset_version=14,
            input_names=['audio'],
            output_names=['beats', 'downbeats'],
            dynamic_axes={
                'audio': {0: 'batch', 2: 'time'},
                'beats': {0: 'batch', 1: 'time'},
                'downbeats': {0: 'batch', 1: 'time'},
            }
        )
        logger.info(f"Model exported to ONNX: {output_path}")
        return True
    except Exception as e:
        logger.warning(f"ONNX export failed: {e}")
        return False


def quantize_onnx_model(input_path: str, output_path: str) -> bool:
    """
    Quantize ONNX model to INT8 for further speedup.

    Args:
        input_path: Path to unquantized ONNX model
        output_path: Path where quantized model will be saved

    Returns:
        True if quantization succeeded, False otherwise
    """
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(
            input_path,
            output_path,
            weight_type=QuantType.QInt8,
        )
        logger.info(f"Model quantized to INT8: {output_path}")
        return True
    except Exception as e:
        logger.warning(f"INT8 quantization failed: {e}")
        return False


def get_onnx_session(model_path: str) -> Optional[Any]:
    """
    Get or create an ONNX Runtime inference session with optimal settings.

    Args:
        model_path: Path to ONNX model file

    Returns:
        ONNX Runtime InferenceSession or None if failed
    """
    global _onnx_session
    if _onnx_session is not None:
        return _onnx_session

    try:
        import onnxruntime as ort

        # Optimal session options for audio processing
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = min(os.cpu_count() or 4, 4)
        sess_options.inter_op_num_threads = 1
        sess_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

        # Try GPU first, fall back to CPU
        providers = ['CPUExecutionProvider']
        try:
            if 'CUDAExecutionProvider' in ort.get_available_providers():
                providers.insert(0, 'CUDAExecutionProvider')
                logger.info("ONNX using CUDA GPU acceleration")
        except Exception:
            pass

        _onnx_session = ort.InferenceSession(
            model_path,
            sess_options,
            providers=providers
        )
        logger.info(f"ONNX session created: {model_path} (providers: {providers})")
        return _onnx_session
    except Exception as e:
        logger.warning(f"Failed to create ONNX session: {e}")
        return None


def run_onnx_inference(session: Any, audio_array: np.ndarray) -> Optional[Dict]:
    """
    Run inference using ONNX Runtime session.

    Args:
        session: ONNX Runtime InferenceSession
        audio_array: Audio array (1D, 2D, or 3D)

    Returns:
        Dict with 'beats' and 'downbeats' arrays, or None if failed
    """
    try:
        # Ensure correct shape and dtype
        if audio_array.ndim == 1:
            audio_array = audio_array[np.newaxis, np.newaxis, :]  # [1, 1, time]
        elif audio_array.ndim == 2:
            audio_array = audio_array[np.newaxis, :]  # [1, channels, time]

        audio_array = audio_array.astype(np.float32)

        outputs = session.run(None, {'audio': audio_array})

        return {
            'beats': outputs[0],
            'downbeats': outputs[1] if len(outputs) > 1 else None
        }
    except Exception as e:
        logger.warning(f"ONNX inference failed: {e}")
        return None


def setup_onnx_for_beat_tracking(pytorch_model: Optional[Any] = None) -> Optional[str]:
    """
    Setup ONNX model for beat tracking.

    Tries in order:
    1) Cached quantized model (INT8)
    2) Cached ONNX model (FP32)
    3) Export from PyTorch + quantize

    Args:
        pytorch_model: Optional PyTorch model for export

    Returns:
        Path to ONNX model or None if setup failed
    """
    ONNX_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    quantized_path = str(ONNX_CACHE_DIR / 'beat_this_int8.onnx')
    onnx_path = str(ONNX_CACHE_DIR / 'beat_this.onnx')

    # 1. Try cached quantized model
    if os.path.exists(quantized_path):
        logger.debug("Using cached INT8 quantized ONNX model")
        return quantized_path

    # 2. Try cached ONNX model
    if os.path.exists(onnx_path):
        # Try to quantize it
        if quantize_onnx_model(onnx_path, quantized_path):
            return quantized_path
        return onnx_path

    # 3. Export from PyTorch
    if pytorch_model is not None:
        # Typical input: [batch=1, channels=1, time=sr*duration]
        # For beat_this: typically 22050 Hz, ~30 seconds
        input_shape = (1, 1, 22050 * 30)
        if export_model_to_onnx(pytorch_model, input_shape, onnx_path):
            if quantize_onnx_model(onnx_path, quantized_path):
                return quantized_path
            return onnx_path

    return None
