"""
Auth service — JWT access/refresh tokens, bcrypt passwords, hachage refresh token DB.
"""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Dict, Optional

from passlib.context import CryptContext
from jose import jwt, JWTError
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

# Charger la config centralisée
_settings = get_settings()

# Password hashing — configurable bcrypt rounds
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=_settings.BCRYPT_ROUNDS
)

# JWT settings — la clé est déjà sécurisée par get_settings() (fallback hostname-based)
SECRET_KEY = _settings.SECRET_KEY
ALGORITHM = _settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = _settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_DAYS = _settings.REFRESH_TOKEN_EXPIRE_DAYS


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
