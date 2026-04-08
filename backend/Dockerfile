FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Étape 2: PyTorch CPU-only (requis AVANT allin1 + demucs) ──────────
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && python -c "import torch; print(f'torch={torch.__version__} OK')" \
    || echo "WARNING: PyTorch install failed"

# NOTE: madmom et allin1 désactivés — compilation C cause crash sur Railway.
# Le code gère leur absence via ImportError → fallback librosa.
# Alternative future: BeatNet (PyTorch natif, pas de compilation C)

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
