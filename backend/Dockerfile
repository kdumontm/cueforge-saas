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

# Pré-télécharger le modèle Demucs htdemucs (~80MB) — seul modèle nécessaire
# (mdx_extra_q retiré pour réduire la taille image et la RAM build Railway)
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs'); print('htdemucs model cached')" \
    || echo "WARNING: htdemucs model download skipped"

COPY app/ ./app/

# Skip deep analysis by default (saves ~200MB RAM on Railway)
# Override with SKIP_DEEP_ANALYSIS=0 in Railway env vars to enable
ENV SKIP_DEEP_ANALYSIS=1

EXPOSE 8000

# ⚡ 1 worker : après passage à 2 workers (c6f5c2b) on a eu un crash loop épisodique
# (OOM Railway). Le pipeline analyse a été découpé en INSTANT (3-5s) + PRIMARY_COMPLETE
# + stems background (commits 2e6a90c + 01a695f) donc les handlers HTTP sont plus
# rapides, 1 worker suffit. Demucs (~800MB RAM) + torch en background peuvent OOM
# si 2 workers + 2 Demucs parallèles en même temps.
# limit-concurrency 100 par worker + timeout-keep-alive court.
# Shell form (pas de []) pour que $PORT soit résolu par /bin/sh
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --limit-concurrency 100 --timeout-keep-alive 20 --proxy-headers --forwarded-allow-ips="*"
