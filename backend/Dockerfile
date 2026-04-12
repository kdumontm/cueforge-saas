FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── PyTorch CPU-only (requis AVANT beat_this + demucs) ────────────────
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && python -c "import torch; print(f'torch={torch.__version__} OK')" \
    || echo "WARNING: PyTorch install failed"

# ── beat_this — CPJKU deep learning beat tracking (PyTorch pur) ───────
# Même labo que madmom mais 100% PyTorch, pas de compilation C
RUN pip install --no-cache-dir tqdm einops soxr rotary-embedding-torch \
    && pip install --no-cache-dir "git+https://github.com/CPJKU/beat_this.git" \
    && python -c "from beat_this.inference import File2Beats; print('beat_this OK')" \
    || echo "WARNING: beat_this install failed — will use librosa for beat tracking"

# ── Étape 5: Demucs stem separation ───────────────────────────────────
RUN pip install --no-cache-dir "demucs>=4.0.0" \
    && python -c "import demucs; print('demucs OK')" \
    || echo "WARNING: Demucs install failed — stem separation disabled"

# Pré-télécharger le modèle mdx_extra_q (~80MB)
RUN python -c "from demucs.pretrained import get_model; get_model('mdx_extra_q'); print('mdx_extra_q model cached')" \
    || echo "WARNING: mdx_extra_q model download skipped"

COPY app/ ./app/

EXPOSE 8000

# ⚡ 2 workers pour paralléliser les requêtes (adapté à la RAM Railway ~512MB)
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2 --limit-concurrency 50
