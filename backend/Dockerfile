FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    libchromaprint-tools \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Debug: check all Python files for syntax errors
RUN python3 -m py_compile app/routers/tracks.py && echo "tracks.py OK" || echo "tracks.py FAILED"
RUN python3 -m py_compile app/services/audio_analysis.py && echo "audio_analysis.py OK" || echo "audio_analysis.py FAILED"
RUN python3 -m py_compile app/services/genre_detection.py && echo "genre_detection.py OK" || echo "genre_detection.py FAILED"
RUN python3 -c "import tokenize, io; list(tokenize.generate_tokens(io.StringIO(open('app/routers/tracks.py').read()).readline)); print('tokenize OK')"
RUN python3 -c "import ast; ast.parse(open('app/routers/tracks.py').read()); print('AST parse OK')"
RUN head -25 app/routers/tracks.py
RUN python3 -c "f=open('app/routers/tracks.py','rb'); d=f.read(200); print([hex(b) for b in d])"

EXPOSE 8000

CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
