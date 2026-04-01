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
# Si Demucs OOM à l'exécution, le service tombe en fallback HPSS automatiquement
RUN pip install --no-cache-dir \
    torch torchaudio \
    --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir demucs>=4.0.0 \
    && python -c "import torch; import demucs; print(f'torch={torch.__version__}, demucs OK')"

# Pré-télécharger le modèle htdemucs (~80MB)
# Non-bloquant: si ça échoue, Demucs le retéléchargera au premier usage
# (ou le fallback HPSS prendra le relais)
RUN python -c "\
try:\n\
    from demucs.pretrained import get_model\n\
    get_model('htdemucs')\n\
    print('htdemucs model OK')\n\
except Exception as e:\n\
    print(f'Model pre-download skipped: {e}')\n\
" || true

COPY app/ ./app/

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
