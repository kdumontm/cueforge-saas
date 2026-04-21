"""
Cloudflare R2 — service de stockage objet.

R2 = S3-compatible. On utilise boto3 pointant vers l'endpoint
https://<ACCOUNT_ID>.r2.cloudflarestorage.com.

Fonctionne en mode "hybride" avec le stockage local :
- Source de vérité : R2 (si configuré)
- Cache ephémère : /app/uploads (pour l'analyse audio qui a besoin d'un fichier local)

Activation : les 4 env vars doivent être set.
Si non configuré, toutes les fonctions sont no-op et `enabled()` → False.

Env vars requises :
- R2_ACCOUNT_ID        : identifiant de compte Cloudflare (32 chars hex)
- R2_ACCESS_KEY_ID     : clé d'accès générée dans R2 API tokens
- R2_SECRET_ACCESS_KEY : secret associé
- R2_BUCKET            : nom du bucket (ex: "cueforge-audio")
"""
import os
import logging
from typing import Optional, BinaryIO
from functools import lru_cache

logger = logging.getLogger(__name__)

# Lazy import pour ne pas crasher au boot si boto3 n'est pas encore installé
_boto3_cache = None


def _boto3():
    global _boto3_cache
    if _boto3_cache is None:
        import boto3  # type: ignore
        _boto3_cache = boto3
    return _boto3_cache


# ── Configuration ────────────────────────────────────────────────────────────

def _cfg():
    """Lit la config à chaque appel pour permettre des toggles à chaud."""
    return {
        "account_id": os.getenv("R2_ACCOUNT_ID"),
        "access_key": os.getenv("R2_ACCESS_KEY_ID"),
        "secret_key": os.getenv("R2_SECRET_ACCESS_KEY"),
        "bucket":     os.getenv("R2_BUCKET"),
        "ttl":        int(os.getenv("R2_SIGNED_URL_TTL_SECONDS", "3600")),
    }


def enabled() -> bool:
    """True si R2 est configuré (les 4 creds présents)."""
    c = _cfg()
    return all([c["account_id"], c["access_key"], c["secret_key"], c["bucket"]])


def _endpoint() -> str:
    c = _cfg()
    return f"https://{c['account_id']}.r2.cloudflarestorage.com"


@lru_cache(maxsize=1)
def _client_cached():
    """Client boto3 configuré pour R2, memoïsé au process."""
    c = _cfg()
    boto3 = _boto3()
    # Region "auto" recommandé pour R2
    return boto3.client(
        "s3",
        endpoint_url=_endpoint(),
        aws_access_key_id=c["access_key"],
        aws_secret_access_key=c["secret_key"],
        region_name="auto",
    )


def _client():
    """Récupère le client boto3 (lève RuntimeError si R2 non configuré)."""
    if not enabled():
        raise RuntimeError("R2 non configuré (vérifier R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET)")
    return _client_cached()


# ── Opérations ───────────────────────────────────────────────────────────────

def upload_file(local_path: str, key: str, content_type: Optional[str] = None) -> str:
    """
    Upload un fichier local vers R2 sous la clé donnée.

    Args:
        local_path: Chemin local du fichier source
        key: Clé objet R2 (= basename comme "UUID.mp3")
        content_type: MIME type optionnel (déduit sinon)

    Returns:
        La clé R2 (identique à `key` — retournée pour chaînage)
    """
    c = _cfg()
    extra = {}
    if content_type:
        extra["ContentType"] = content_type
    else:
        # Déduit depuis l'extension
        ct = _guess_content_type(key)
        if ct:
            extra["ContentType"] = ct

    _client().upload_file(local_path, c["bucket"], key, ExtraArgs=extra or None)
    logger.info(f"[R2] Uploaded {local_path} → {c['bucket']}/{key}")
    return key


def download_file(key: str, local_path: str) -> None:
    """Télécharge un objet R2 vers un chemin local."""
    c = _cfg()
    _client().download_file(c["bucket"], key, local_path)
    logger.info(f"[R2] Downloaded {c['bucket']}/{key} → {local_path}")


def delete_object(key: str) -> bool:
    """Supprime un objet. Retourne True si l'appel s'est bien passé."""
    if not enabled():
        return False
    c = _cfg()
    try:
        _client().delete_object(Bucket=c["bucket"], Key=key)
        logger.info(f"[R2] Deleted {c['bucket']}/{key}")
        return True
    except Exception as e:
        logger.warning(f"[R2] Delete failed for {key}: {e}")
        return False


def object_exists(key: str) -> bool:
    """Vérifie la présence d'un objet via HEAD."""
    if not enabled():
        return False
    c = _cfg()
    try:
        _client().head_object(Bucket=c["bucket"], Key=key)
        return True
    except Exception:
        return False


def get_signed_url(key: str, ttl_seconds: Optional[int] = None) -> str:
    """
    Génère une URL signée (GET) pour permettre au frontend de lire l'objet.
    """
    c = _cfg()
    ttl = ttl_seconds or c["ttl"]
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": c["bucket"], "Key": key},
        ExpiresIn=ttl,
    )


def list_objects(prefix: str = "", max_keys: int = 1000):
    """Liste les clés du bucket (générateur)."""
    if not enabled():
        return
    c = _cfg()
    client = _client()
    continuation = None
    while True:
        params = {"Bucket": c["bucket"], "MaxKeys": max_keys, "Prefix": prefix}
        if continuation:
            params["ContinuationToken"] = continuation
        resp = client.list_objects_v2(**params)
        for obj in resp.get("Contents") or []:
            yield obj  # {Key, Size, LastModified, ETag, ...}
        if not resp.get("IsTruncated"):
            return
        continuation = resp.get("NextContinuationToken")


def healthcheck() -> dict:
    """Vérifie que le bucket est joignable et retourne des infos de base."""
    if not enabled():
        return {"enabled": False, "reason": "creds manquants"}
    c = _cfg()
    try:
        _client().head_bucket(Bucket=c["bucket"])
        return {"enabled": True, "bucket": c["bucket"], "endpoint": _endpoint(), "ok": True}
    except Exception as e:
        return {"enabled": True, "bucket": c["bucket"], "endpoint": _endpoint(), "ok": False, "error": str(e)}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _guess_content_type(filename: str) -> Optional[str]:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "mp3":  "audio/mpeg",
        "wav":  "audio/wav",
        "flac": "audio/flac",
        "aiff": "audio/aiff",
        "aif":  "audio/aiff",
        "m4a":  "audio/mp4",
        "ogg":  "audio/ogg",
        "opus": "audio/opus",
        "aac":  "audio/aac",
    }.get(ext)


def key_from_local_path(local_path: str) -> str:
    """Extrait une clé R2 sûre depuis un chemin local (= basename UUID.ext)."""
    return os.path.basename(local_path)
