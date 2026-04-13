"""
Service OAuth — Gère l'échange de tokens et login/register via providers externes.

Providers supportés : Google, Spotify.
Isolé du router pour permettre :
  - Tests unitaires sans FastAPI
  - Ajout de nouveaux providers sans toucher au router
  - Réutilisation (ex: linking de compte depuis profil)
"""
import hashlib
from typing import Optional
from datetime import datetime

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import User
from app.services.auth_service import create_access_token, create_refresh_token


def _hash_token(token: str) -> str:
    """SHA-256 hash d'un token avant stockage en BDD."""
    return hashlib.sha256(token.encode()).hexdigest()


# ═══════════════════════════════════════════════
# Provider token exchange
# ═══════════════════════════════════════════════


async def exchange_google_token(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Échange un code Google OAuth contre les infos utilisateur.

    Returns:
        dict avec provider_id, email, name, avatar_url
    Raises:
        ValueError si l'échange échoue
    """
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            raise ValueError("Google OAuth token exchange failed")
        token_data = token_res.json()

        userinfo_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_res.status_code != 200:
            raise ValueError("Failed to get Google user info")
        google_user = userinfo_res.json()

    return {
        "provider_id": google_user["id"],
        "email": google_user.get("email"),
        "name": google_user.get("name", google_user.get("email", "User").split("@")[0]),
        "avatar_url": google_user.get("picture"),
    }


async def exchange_spotify_token(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> dict:
    """Échange un code Spotify OAuth contre les infos utilisateur.

    Returns:
        dict avec provider_id, email, name, avatar_url
    Raises:
        ValueError si l'échange échoue
    """
    import base64

    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Authorization": f"Basic {auth_header}"},
        )
        if token_res.status_code != 200:
            raise ValueError("Spotify OAuth token exchange failed")
        token_data = token_res.json()

        userinfo_res = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_res.status_code != 200:
            raise ValueError("Failed to get Spotify user info")
        spotify_user = userinfo_res.json()

    images = spotify_user.get("images", [])
    return {
        "provider_id": spotify_user["id"],
        "email": spotify_user.get("email"),
        "name": spotify_user.get("display_name", spotify_user["id"]),
        "avatar_url": images[0]["url"] if images else None,
    }


# ═══════════════════════════════════════════════
# Login or register via OAuth
# ═══════════════════════════════════════════════


def oauth_login_or_register(
    db: Session,
    provider: str,
    provider_id: str,
    email: Optional[str],
    name: str,
    avatar_url: Optional[str] = None,
) -> dict:
    """Trouve ou crée un utilisateur à partir des données OAuth.

    Returns:
        dict avec access_token, refresh_token, token_type, user (objet User)
    Raises:
        ValueError si pas d'email et pas de compte existant
    """
    # Chercher un compte déjà lié à ce provider
    user = db.query(User).filter(
        User.oauth_provider == provider,
        User.oauth_id == provider_id,
    ).first()

    # Si pas de compte lié et pas d'email → erreur
    if not user and not email:
        raise ValueError(
            f"Votre compte {provider} ne fournit pas d'email. "
            "Veuillez autoriser l'accès à votre email ou vous inscrire avec email/mot de passe."
        )

    # Si pas de compte lié mais email connu → lier les comptes
    if not user and email:
        user = db.query(User).filter(
            func.lower(User.email) == email.strip().lower()
        ).first()
        if user:
            user.oauth_provider = provider
            user.oauth_id = provider_id
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url

    # Créer un nouveau compte si nécessaire
    if not user:
        base_name = name or "dj"
        unique_name = base_name
        counter = 1
        while db.query(User).filter(User.name == unique_name).first():
            unique_name = f"{base_name}{counter}"
            counter += 1

        user = User(
            email=email,
            name=unique_name,
            password_hash=None,
            oauth_provider=provider,
            oauth_id=provider_id,
            avatar_url=avatar_url,
            email_verified=True,
        )
        db.add(user)

    # Mettre à jour le login et générer les tokens
    user.last_login_at = datetime.utcnow()
    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    user.refresh_token = _hash_token(refresh)

    db.commit()
    db.refresh(user)

    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": user,
    }
