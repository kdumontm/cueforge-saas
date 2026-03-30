"""
Auth service — JWT access/refresh tokens, bcrypt passwords, hachage refresh token DB.
"""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Dict, Optional

from passlib.context import CryptContext
from jose import jwt, JWTError
import os
import logging

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
_raw_secret = os.getenv("SECRET_KEY", "")

# 🔴 CRITIQUE : refuse de démarrer avec la clé par défaut connue en prod
if not _raw_secret or _raw_secret == "cueforge-default-key-set-in-railway-env":
    import sys
    # En production (pas SQLite), on force l'arrêt
    db_url = os.getenv("DATABASE_URL", "sqlite://")
    if "sqlite" not in db_url:
        logger.critical(
            "🚨 SECRET_KEY non définie ou valeur par défaut détectée en production. "
            "Définissez SECRET_KEY dans les variables Railway (openssl rand -hex 32)."
        )
        sys.exit(1)
    else:
        # Dev local : on génère une clé temporaire (redémarrage = nouvelles sessions)
        _raw_secret = secrets.token_hex(32)
        logger.warning("⚠️  SECRET_KEY non définie — clé temporaire générée pour dev local.")

SECRET_KEY = _raw_secret
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))


def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Vérifie un mot de passe en clair contre son hash bcrypt."""
    return pwd_context.verify(plain, hashed)


def create_access_token(data: Dict) -> str:
    """JWT access token court (60 min par défaut)."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: Dict) -> str:
    """JWT refresh token long (30 jours par défaut)."""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def hash_refresh_token(token: str) -> str:
    """SHA-256 du refresh token — c'est ce qu'on stocke en DB, pas le token brut."""
    return hashlib.sha256(token.encode()).hexdigest()


def decode_access_token(token: str) -> Optional[Dict]:
    """Décode et valide un JWT access token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("type", "access")
        if token_type != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[Dict]:
    """Décode et valide un JWT refresh token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


def generate_email_verify_token() -> str:
    """Token aléatoire pour la vérification email."""
    return secrets.token_urlsafe(32)


def generate_oauth_state() -> str:
    """State aléatoire pour les flows OAuth."""
    return secrets.token_urlsafe(16)
