FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PyTorch CPU-only + Demucs (séparation stems qualité pro)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir demucs>=4.0.0

# Pré-télécharger le modèle htdemucs (~80MB) pour éviter le DL au premier usage
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs')" || true

COPY app/ ./app/

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
