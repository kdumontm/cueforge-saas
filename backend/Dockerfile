FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    build-essential \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Cython needed BEFORE madmom (madmom's setup.py imports it)
RUN pip install --no-cache-dir Cython numpy==1.26.4

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# madmom (deep learning beat tracking) — optional, falls back to librosa
RUN pip install --no-cache-dir madmom>=0.16.1 \
    && python -c "import madmom; print(f'madmom={madmom.__version__} OK')" \
    || echo "WARNING: madmom install failed — will use librosa for beat tracking"

# allin1 (deep learning structure detection) — optional, falls back to librosa SSM
RUN pip install --no-cache-dir allin1>=1.0.0 \
    && python -c "import allin1; print('allin1 OK')" \
    || echo "WARNING: allin1 install failed — will use librosa for structure detection"

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
