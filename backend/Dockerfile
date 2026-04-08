FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    build-essential \
    gcc \
    g++ \
    pkg-config \
    git \
    && rm -rf /var/lib/apt/lists/*

# ── Étape 1: Cython + numpy (requis AVANT madmom) ─────────────────────
RUN pip install --no-cache-dir Cython "numpy==1.26.4"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Étape 2: PyTorch CPU-only (requis AVANT allin1 + demucs) ──────────
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && python -c "import torch; print(f'torch={torch.__version__} OK')" \
    || echo "WARNING: PyTorch install failed"

# ── Étape 3: madmom — deep learning beat tracking ─────────────────────
# Version dev depuis GitHub = meilleur support Python 3.11 + numpy 1.26
# --no-build-isolation pour utiliser le Cython système
RUN pip install --no-cache-dir --no-build-isolation \
    "setuptools>=65.0" "mido" "scipy>=1.0" \
    && pip install --no-cache-dir --no-build-isolation \
    "git+https://github.com/CPJKU/madmom.git" \
    && python -c "import madmom; print(f'madmom OK')" \
    || echo "WARNING: madmom install failed — will use librosa for beat tracking"

# ── Étape 4: allin1 — deep learning structure detection (ISMIR 2023) ──
# Nécessite torch déjà installé
RUN pip install --no-cache-dir "allin1>=1.0.0" \
    && python -c "import allin1; print('allin1 OK')" \
    || echo "WARNING: allin1 install failed — will use librosa for structure detection"

# ── Étape 5: Demucs stem separation ───────────────────────────────────
RUN pip install --no-cache-dir "demucs>=4.0.0" \
    && python -c "import demucs; print('demucs OK')" \
    || echo "WARNING: Demucs install failed — stem separation disabled"

# Pré-télécharger le modèle mdx_extra_q (~80MB)
RUN python -c "from demucs.pretrained import get_model; get_model('mdx_extra_q'); print('mdx_extra_q model cached')" \
    || echo "WARNING: mdx_extra_q model download skipped"

COPY app/ ./app/

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
