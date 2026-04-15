"""
CueForge — Demucs stem separation sur GPU via Modal.

Déploiement :
  1. pip install modal
  2. modal setup          (login une fois)
  3. modal deploy modal_demucs.py

L'endpoint web est automatiquement créé par Modal.
Le backend CueForge l'appelle via HTTPS avec le token MODAL_AUTH_TOKEN.

GPU T4 : ~3-5s par track (vs 20-40s CPU)
Coût : ~$0.59/h → $30 free/mois ≈ 50h ≈ 36 000 tracks
"""
import io
import os
import modal

# ── Image Docker avec Demucs + PyTorch GPU ──────────────────────────────

demucs_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "torch>=2.1",
        "torchaudio>=2.1",
        "demucs>=4.0",
        "numpy<2",
        "soundfile",
    )
    # Pré-télécharger le modèle htdemucs au build (évite cold start)
    .run_commands(
        "python -c \"from demucs.pretrained import get_model; get_model('htdemucs'); print('htdemucs cached')\""
    )
)

app = modal.App("cueforge-demucs", image=demucs_image)

# ── Volume pour cache modèle (persistant entre les appels) ─────────────
model_cache = modal.Volume.from_name("demucs-model-cache", create_if_missing=True)

# ── Secret pour authentification ────────────────────────────────────────
# Créer sur Modal dashboard : Settings → Secrets → "cueforge-auth"
# avec la clé MODAL_AUTH_TOKEN=<ton_token_secret>


@app.function(
    gpu="T4",
    timeout=120,
    container_idle_timeout=60,  # Garde le container chaud 60s après le dernier appel
    volumes={"/cache": model_cache},
    memory=4096,
)
def separate_stems(audio_bytes: bytes, filename: str = "track.mp3") -> dict:
    """
    Sépare un fichier audio en 4 stems via Demucs htdemucs sur GPU.

    Args:
        audio_bytes: Contenu du fichier audio (MP3, WAV, FLAC, etc.)
        filename: Nom du fichier (pour l'extension)

    Returns:
        Dict avec 4 clés (drums, bass, vocals, other) → bytes WAV chacun
    """
    import tempfile
    import torch
    import torchaudio
    import numpy as np
    import soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[CueForge] Device: {device}, CUDA: {torch.cuda.is_available()}")

    # Sauvegarder le fichier temporairement
    ext = os.path.splitext(filename)[1] or ".mp3"
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        # Charger le modèle (cached en mémoire après le premier appel)
        model = get_model("htdemucs")
        model.eval()
        model.to(device)

        # Charger l'audio
        wav, sr_orig = torchaudio.load(tmp_path)

        model_sr = model.samplerate
        if sr_orig != model_sr:
            resampler = torchaudio.transforms.Resample(sr_orig, model_sr)
            wav = resampler(wav)

        # Mono → stéréo si nécessaire
        if wav.shape[0] == 1:
            wav = wav.repeat(2, 1)
        elif wav.shape[0] > 2:
            wav = wav[:2]

        # Limiter à 5 min
        max_samples = model_sr * 300
        if wav.shape[1] > max_samples:
            wav = wav[:, :max_samples]

        wav = wav.unsqueeze(0).to(device)
        print(f"[CueForge] Audio shape: {wav.shape}, sr: {model_sr}")

        # Séparation GPU — segment court pour vitesse max
        with torch.no_grad():
            sources = apply_model(
                model, wav, device=device,
                progress=False,
                split=True,
                segment=15,
                overlap=0.1,
                shifts=0,
            )

        # Convertir chaque stem en WAV bytes (mono, 22050Hz)
        stem_names = model.sources  # ['drums', 'bass', 'other', 'vocals']
        result = {}
        for i, name in enumerate(stem_names):
            stem_stereo = sources[0, i].cpu().numpy()  # [2, time]
            stem_mono = np.mean(stem_stereo, axis=0)

            # Resample vers 22050Hz pour l'analyse
            import librosa
            stem_22k = librosa.resample(stem_mono, orig_sr=model_sr, target_sr=22050)

            # Encoder en WAV bytes
            buf = io.BytesIO()
            sf.write(buf, stem_22k, 22050, format="WAV", subtype="FLOAT")
            result[name] = buf.getvalue()

        print(f"[CueForge] Stems: {list(result.keys())}")
        return result

    finally:
        os.unlink(tmp_path)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


# ── Endpoint HTTPS (web_endpoint) pour appel depuis Railway ─────────────

@app.function(
    gpu="T4",
    timeout=120,
    container_idle_timeout=60,
    volumes={"/cache": model_cache},
    memory=4096,
)
@modal.web_endpoint(method="POST")
def separate_stems_api(request: dict) -> dict:
    """
    Endpoint HTTPS appelé par le backend CueForge.

    Body JSON:
        {
            "audio_url": "https://backend.railway.app/api/v1/tracks/123/audio?token=xxx",
            "track_id": 123,
            "auth_token": "secret"
        }

    Returns:
        {
            "status": "ok",
            "track_id": 123,
            "stems": {"drums": "<base64>", "bass": "<base64>", ...}
        }
    """
    import base64
    import urllib.request

    # Validation
    auth = request.get("auth_token", "")
    expected = os.environ.get("MODAL_AUTH_TOKEN", "")
    if expected and auth != expected:
        return {"status": "error", "message": "Unauthorized"}

    audio_url = request.get("audio_url")
    track_id = request.get("track_id", 0)

    if not audio_url:
        return {"status": "error", "message": "audio_url required"}

    # Télécharger l'audio depuis Railway
    print(f"[CueForge] Downloading audio for track {track_id}...")
    try:
        req = urllib.request.Request(audio_url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            audio_bytes = resp.read()
    except Exception as e:
        return {"status": "error", "message": f"Download failed: {str(e)[:200]}"}

    print(f"[CueForge] Audio downloaded: {len(audio_bytes) / 1024 / 1024:.1f} MB")

    # Séparer les stems
    try:
        stems = separate_stems.local(audio_bytes, f"track_{track_id}.mp3")
    except Exception as e:
        return {"status": "error", "message": f"Separation failed: {str(e)[:200]}"}

    # Encoder en base64 pour le transport JSON
    stems_b64 = {}
    for name, wav_bytes in stems.items():
        stems_b64[name] = base64.b64encode(wav_bytes).decode("ascii")

    return {
        "status": "ok",
        "track_id": track_id,
        "stems": stems_b64,
    }
