FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PyTorch CPU-only (minimal) + Demucs for DJ-grade stem separation
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir demucs>=4.0.0

# Pré-télécharger le modèle htdemucs (~80MB) pour éviter le DL au premier usage
# On log l'erreur au lieu de la masquer
RUN python -c "\
import sys; \
try: \
    from demucs.pretrained import get_model; \
    m = get_model('htdemucs'); \
    print('htdemucs model loaded OK'); \
except Exception as e: \
    print(f'WARNING: model pre-download failed: {e}', file=sys.stderr); \
    sys.exit(0) \
"

# Vérifier que tout est installé correctement
RUN python -c "import torch; import demucs; print(f'torch={torch.__version__}, demucs OK')"

COPY app/ ./app/

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
