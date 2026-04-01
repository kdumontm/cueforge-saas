FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PyTorch CPU-only + Demucs for DJ-grade stem separation
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir demucs>=4.0.0 \
    && python -c "import torch; import demucs; print(f'torch={torch.__version__}, demucs OK')"

# Pré-télécharger le modèle htdemucs (~80MB)
RUN python -c "from demucs.pretrained import get_model; get_model('htdemucs'); print('htdemucs model OK')"

COPY app/ ./app/

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
