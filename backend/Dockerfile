FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PyTorch CPU-only + Demucs for stem separation (optional — analysis works without it)
# Uses CPU-only torch to minimize image size (~800MB vs ~2GB)
# If this step fails, the container still works — stem separation is just disabled
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir demucs>=4.0.0 \
    && python -c "import torch; import demucs; print(f'torch={torch.__version__}, demucs OK')" \
    || echo "WARNING: PyTorch/Demucs install failed — stem separation disabled"

# Pré-télécharger le modèle mdx_extra_q (~80MB, 4x plus rapide que htdemucs sur CPU)
RUN python -c "from demucs.pretrained import get_model; get_model('mdx_extra_q'); print('mdx_extra_q model cached')" \
    || echo "WARNING: mdx_extra_q model download skipped"

COPY app/ ./app/

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
