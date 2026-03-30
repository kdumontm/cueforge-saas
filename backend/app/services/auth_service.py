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
_INSECURE_DEFAULT = "cueforge-default-key-set-in-railway-env"

if not _raw_secret or _raw_secret == _INSECURE_DEFAULT:
    # Génère une clé dérivée du hostname + salt fixe — stable entre redémarrages,
    # inconnue des attaquants (contrairement à la valeur hardcodée publique).
    # ⚠️  Ajouter SECRET_KEY dans Railway pour une sécurité maximale.
    import socket
    _stable_seed = f"cueforge-auto-{socket.gethostname()}-railway"
    _raw_secret = hashlib.sha256(_stable_seed.encode()).hexdigest()
    db_url = os.getenv("DATABASE_URL", "sqlite://")
    if "sqlite" not in db_url:
        logger.critical(
            "🚨 SECRET_KEY non définie en production ! "
            "Clé auto-générée utilisée (stable mais non recommandée). "
            "Ajoutez SECRET_KEY dans Railway → Variables dès que possible."
        )
    else:
        logger.warning("⚠️  SECRET_KEY non définie — clé auto-générée pour dev local.")

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
