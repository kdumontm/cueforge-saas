# syntax=docker/dockerfile:1.6
# Dockerfile multi-stage — les ML deps + model sont cachés dans la 1ère stage.
# Quand seul app/ change (99% des push), seul la stage "runtime" rebuild → ~30s.
# Quand requirements.txt change, la stage "ml-deps" rebuild → 5-10 min (rare).

# ── STAGE 1 : ML deps + model (lourd, ~5-10 min, cache très agressif) ─────
FROM python:3.11-slim AS ml-deps

WORKDIR /app

# apt deps système (ffmpeg, libsndfile pour audio)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# pip deps du projet (cache invalide uniquement si requirements.txt change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PyTorch CPU-only (nécessaire pour beat_this + demucs)
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && python -c "import torch; print(f'torch={torch.__version__} OK')" \
    || echo "WARNING: PyTorch install failed"

# beat_this (CPJKU deep learning beat tracking)
RUN pip install --no-cache-dir tqdm einops soxr rotary-embedding-torch \
    && pip install --no-cache-dir "git+https://github.com/CPJKU/beat_this.git" \
    && python -c "from beat_this.inference import File2Beats; print('beat_this OK')" \
    || echo "WARNING: beat_this install failed — will use librosa for beat tracking"

# Demucs stem separation
RUN pip install --no-cache-dir "demucs>=4.0.0" \
    && python -c "import demucs; print('demucs OK')" \
    || echo "WARNING: Demucs install failed — stem separation disabled"

# Pré-télécharger le modèle Demucs htdemucs (~80MB) — cache dans l'image
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs_ft'); print('htdemucs_ft model cached')" \
    || echo "WARNING: htdemucs model download skipped"


# ── STAGE 2 : runtime (léger, ~30s, rebuild à chaque push code) ──────────
FROM ml-deps AS runtime

WORKDIR /app

# Seule cette couche rebuild quand tu modifies app/
COPY app/ ./app/

# Skip deep analysis par défaut (économise RAM au boot)
ENV SKIP_DEEP_ANALYSIS=1
# LEAN_BOOT : skip les inits ML optionnels au boot (lazy-importés)
ENV LEAN_BOOT=1

EXPOSE 8000

# 1 worker uvicorn — les imports ML lazy gardent la RAM pic maîtrisée.
# Mutex Demucs dans stems_service.py sérialise les séparations (RAM safe).
# limit-concurrency 100 par worker suffit largement pour ce trafic.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 100 --timeout-keep-alive 20 --proxy-headers --forwarded-allow-ips="*"
