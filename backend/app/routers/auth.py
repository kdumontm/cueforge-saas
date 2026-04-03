"""
Enhanced auth router — REPLACES backend/app/routers/auth.py

New endpoints:
- POST /auth/verify-email         → confirm email with token
- POST /auth/resend-verify        → resend verification email
- POST /auth/refresh              → refresh token rotation
- POST /auth/oauth/google         → Google OAuth callback
- POST /auth/oauth/spotify        → Spotify OAuth callback
- DELETE /auth/logout              → invalidate refresh token

Enhanced:
- register now sends verification email + returns refresh_token
- login now returns refresh_token + updates last_login_at
"""
from typing import Optional
from datetime import datetime, timedelta
import secrets
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Annotated
from pydantic import BaseModel, EmailStr, field_validator, Field

from app.database import get_db
from app.models import User
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    generate_email_verify_token
)
from app.services.email_service import (
    send_reset_email,
    send_verification_email,
    send_welcome_email,
)
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_token(token: str) -> str:
    """SHA-256 hash d'un token avant stockage en BDD (one-way)."""
    return hashlib.sha256(token.encode()).hexdigest()


# ─── Pydantic schemas ────────────────────────────────────────────


def _validate_password_strength(v: str) -> str:
    """Shared password validation logic."""
    if len(v) < 8:
        raise ValueError("Le mot de passe doit contenir au moins 8 caracteres")
    if not any(c.isupper() for c in v):
        raise ValueError("Le mot de passe doit contenir au moins une majuscule")
    if not any(c.isdigit() for c in v):
        raise ValueError("Le mot de passe doit contenir au moins un chiffre")
    if not any(c in "!@#$%^&*()_+-=[]{}|;:',.<>?/" for c in v):
        raise ValueError("Le mot de passe doit contenir au moins un caractere special")
    return v


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: Annotated[str, Field(min_length=2, max_length=50)]

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserLogin(BaseModel):
    username: str  # Login by username (name field)
    password: str


class UserUpdate(BaseModel):
    name: Optional[Annotated[str, Field(min_length=2, max_length=50)]] = None
    email: Optional[EmailStr] = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    subscription_plan: str
    is_admin: bool
    tracks_today: int
    email_verified: bool = False
    avatar_url: Optional[str] = None
    organization_id: Optional[int] = None
    org_role: str = "member"
    use_stem_separation: bool = False

    class Config:
        from_attributes = True


class UserSettingsUpdate(BaseModel):
    use_stem_separation: Optional[bool] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class VerifyEmailRequest(BaseModel):
    token: str


class ResendVerifyRequest(BaseModel):
    email: EmailStr


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password_strength(v)


_ALLOWED_REDIRECT_PREFIXES = (
    "https://exquisite-art-production-f4c6.up.railway.app",
    "http://localhost",   # dev only
    "http://127.0.0.1",  # dev only
)


class OAuthCallbackRequest(BaseModel):
    code: str
    redirect_uri: str

    @field_validator("redirect_uri")
    @classmethod
    def redirect_uri_allowlist(cls, v: str) -> str:
        if not any(v.startswith(prefix) for prefix in _ALLOWED_REDIRECT_PREFIXES):
            raise ValueError("redirect_uri non autorisé")
        return v


# ─── Registration ─────────────────────────────────────────────────


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.name == user_data.name).first():
        raise HTTPException(status_code=400, detail="Username already taken")

    verify_token = generate_email_verify_token()

    new_user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hash_password(user_data.password),
        email_verify_token=_hash_token(verify_token),
        email_verify_token_expires=datetime.utcnow() + timedelta(hours=24),
        email_verified=True,  # Auto-verify (no email service in dev/early prod)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Send verification email (non-blocking, don't fail registration)
    try:
        send_verification_email(new_user.email, verify_token)
    except Exception:
        pass  # SMTP not configured in dev

    access = create_access_token({"sub": str(new_user.id)})
    refresh = create_refresh_token({"sub": str(new_user.id)})

    # Store hashed refresh token (only hash in DB, plaintext returned to client)
    new_user.refresh_token = _hash_token(refresh)
    # 🔴 FIX (faille 8) : Stocke le HASH SHA-256 du refresh token, pas le token brut
    new_user.refresh_token = _hash_token(refresh)
    db.commit()

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        user=UserResponse.model_validate(new_user),
    )


# ─── Email verification ──────────────────────────────────────────


@router.post("/verify-email")
async def verify_email(req: VerifyEmailRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email_verify_token == _hash_token(req.token)).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    if user.email_verified:
        return {"message": "Email already verified"}

    # Vérifier l'expiration du token (24h)
    if user.email_verify_token_expires and user.email_verify_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=400,
            detail="Le lien de vérification a expiré. Demandez un nouveau lien.",
        )

    user.email_verified = True
    user.email_verify_token = None
    user.email_verify_token_expires = None
    db.commit()

    # Send welcome email
    try:
        send_welcome_email(user.email, user.name or "DJ")
    except Exception:
        pass

    return {"message": "Email verified successfully"}


@router.post("/resend-verify")
async def resend_verify(req: ResendVerifyRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if user and not user.email_verified:
        token = generate_email_verify_token()
        user.email_verify_token = _hash_token(token)
        user.email_verify_token_expires = datetime.utcnow() + timedelta(hours=24)
        db.commit()
        try:
            send_verification_email(user.email, token)  # send plaintext to user
        except Exception:
            pass
    # Always return success (don't reveal if email exists)
    return {"message": "If this email exists and is unverified, a link has been sent."}


# ─── Login ────────────────────────────────────────────────────────


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login by username or email. Returns access + refresh tokens."""
    user = db.query(User).filter(
        or_(User.name == credentials.username, User.email == credentials.username)
    ).first()
    if not user or not user.password_hash or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    # Auto-verify email on first login if not yet verified (no email service in dev)
    if not user.email_verified:
        user.email_verified = True
        db.commit()

    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})

    user.refresh_token = _hash_token(refresh)
    # 🔴 FIX (faille 8) : Stocke le HASH SHA-256, pas le token brut
    user.refresh_token = _hash_token(refresh)
    user.last_login_at = datetime.utcnow()
    db.commit()

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


# ─── Token refresh ───────────────────────────────────────────────


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(req: RefreshRequest, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access + refresh pair (rotation)."""
    payload = decode_refresh_token(req.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Compare le hash du token reçu avec le hash stocké en DB
    if user.refresh_token != _hash_token(req.refresh_token):
        # Possible vol de token — invalide tout
        user.refresh_token = None
        db.commit()
        raise HTTPException(status_code=401, detail="Token reuse detected, please login again")

    # Rotate tokens
    new_access = create_access_token({"sub": str(user.id)})
    new_refresh = create_refresh_token({"sub": str(user.id)})
    user.refresh_token = _hash_token(new_refresh)
    db.commit()

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


# ─── Logout ──────────────────────────────────────────────────────


@router.delete("/logout", status_code=204)
async def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Invalidate the user's refresh token."""
    user.refresh_token = None
    db.commit()


# ─── Profile ─────────────────────────────────────────────────────


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    user_data: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user_data.name:
        if db.query(User).filter(User.name == user_data.name, User.id != user.id).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        user.name = user_data.name
    if user_data.email:
        existing = db.query(User).filter(User.email == user_data.email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = user_data.email
        # Re-verify email on change
        user.email_verified = False
        token = generate_email_verify_token()
        user.email_verify_token = _hash_token(token)
        user.email_verify_token_expires = datetime.utcnow() + timedelta(hours=24)
        try:
            send_verification_email(user.email, token)  # send plaintext to user
        except Exception:
            pass
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


# ─── User settings (analysis preferences) ────────────────────────


@router.patch("/me/settings", response_model=UserResponse)
async def update_settings(
    settings: UserSettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update user analysis settings.
    Currently supports:
    - use_stem_separation: enable Demucs stem separation for ultra-precise cue points
    """
    if settings.use_stem_separation is not None:
        user.use_stem_separation = settings.use_stem_separation
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


# ─── Password reset (existing, unchanged) ────────────────────────


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = _hash_token(token)
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        try:
            send_reset_email(user.email, token)  # send plaintext to user
        except Exception:
            pass
    return {"message": "If this email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == _hash_token(req.token)).first()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user.password_hash = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    user.refresh_token = None  # Invalide toutes les sessions actives après reset
    db.commit()
    return {"message": "Password updated successfully"}


# ─── Account deletion ────────────────────────────────────────────


@router.delete("/me", status_code=204)
async def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.organization_id and user.org_role == "owner":
        raise HTTPException(
            status_code=400,
            detail="Vous etes proprietaire d'une organisation. "
                   "Transferez la propriete ou supprimez l'organisation d'abord.",
        )
    if user.organization_id:
        user.organization_id = None
        user.org_role = "member"
    db.delete(user)
    db.commit()


# ─── Admin setup ─────────────────────────────────────────────────


class AdminSetupRequest(BaseModel):
    email: EmailStr
    secret: str


@router.post("/setup-admin")
async def setup_admin(req: AdminSetupRequest, db: Session = Depends(get_db)):
    """Promouvoir un utilisateur en admin.
    Le secret doit être dans le body JSON (jamais en query param → évite les logs serveur).
    """
    import os
    key = os.getenv("ADMIN_SETUP_KEY")
    if not key or req.secret != key:
        raise HTTPException(status_code=403, detail="Invalid setup key")
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    db.commit()
    return {"message": f"{req.email} is now admin"}

# ——— RGPD data export ——————————————————————————————————————

@router.get("/me/export")
async def export_my_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """RGPD Art. 20 — Export all personal data as JSON."""
    from app.models.track import Track
    from app.models.organization import UsageLog

    tracks = db.query(Track).filter(Track.user_id == user.id).all()
    usage_logs = db.query(UsageLog).filter(UsageLog.user_id == user.id).all()

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "subscription_plan": user.subscription_plan,
            "email_verified": user.email_verified,
            "oauth_provider": user.oauth_provider,
            "organization_id": str(user.organization_id) if user.organization_id else None,
            "org_role": user.org_role,
            "created_at": str(user.created_at) if user.created_at else None,
            "last_login_at": str(user.last_login_at) if user.last_login_at else None,
        },
        "tracks": [
            {
                "id": str(t.id),
                "original_filename": t.original_filename,
                "artist": t.artist,
                "title": t.title,
                "genre": t.genre,
                "bpm": t.bpm,
                "key": t.musical_key if hasattr(t, "musical_key") else None,
                "created_at": str(t.created_at) if hasattr(t, "created_at") and t.created_at else None,
            }
            for t in tracks
        ],
        "usage_logs": [
            {
                "action": log.action,
                "timestamp": str(log.timestamp) if hasattr(log, "timestamp") else None,
            }
            for log in usage_logs
        ],
    }




# ─── OAuth endpoints (Google & Spotify) ──────────────────────────


@router.post("/oauth/google", response_model=TokenResponse)
async def oauth_google(req: OAuthCallbackRequest, db: Session = Depends(get_db)):
    """Exchange Google OAuth code for CueForge tokens."""
    import httpx
    import os

    client_id = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    # Exchange code for Google access token
    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": req.code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": req.redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Google OAuth failed")
        token_data = token_res.json()

        # Get user info
        userinfo_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get Google user info")
        google_user = userinfo_res.json()

    google_id = google_user["id"]
    email = google_user.get("email")
    name = google_user.get("name", email.split("@")[0] if email else "User")
    avatar = google_user.get("picture")

    return await _oauth_login_or_register(
        db, provider="google", provider_id=google_id,
        email=email, name=name, avatar_url=avatar,
    )


@router.post("/oauth/spotify", response_model=TokenResponse)
async def oauth_spotify(req: OAuthCallbackRequest, db: Session = Depends(get_db)):
    """Exchange Spotify OAuth code for CueForge tokens."""
    import httpx
    import os
    import base64

    client_id = os.getenv("SPOTIFY_CLIENT_ID")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=501, detail="Spotify OAuth not configured")

    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    async with httpx.AsyncClient() as client:
        token_res = await client.post(
            "https://accounts.spotify.com/api/token",
            data={
                "code": req.code,
                "redirect_uri": req.redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Authorization": f"Basic {auth_header}"},
        )
        if token_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Spotify OAuth failed")
        token_data = token_res.json()

        userinfo_res = await client.get(
            "https://api.spotify.com/v1/me",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        if userinfo_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get Spotify user info")
        spotify_user = userinfo_res.json()

    spotify_id = spotify_user["id"]
    email = spotify_user.get("email")
    name = spotify_user.get("display_name", spotify_id)
    images = spotify_user.get("images", [])
    avatar = images[0]["url"] if images else None

    return await _oauth_login_or_register(
        db, provider="spotify", provider_id=spotify_id,
        email=email, name=name, avatar_url=avatar,
    )


async def _oauth_login_or_register(
    db: Session,
    provider: str,
    provider_id: str,
    email: Optional[str],
    name: str,
    avatar_url: Optional[str] = None,
) -> TokenResponse:
    """Find or create user from OAuth provider data."""
    # Check if user already linked this provider
    user = db.query(User).filter(
        User.oauth_provider == provider,
        User.oauth_id == provider_id,
    ).first()

    # Si le provider ne renvoie pas d'email et qu'on n'a pas de compte lié → erreur
    if not user and not email:
        raise HTTPException(
            status_code=400,
            detail=f"Votre compte {provider} ne fournit pas d'email. "
                   "Veuillez autoriser l'accès à votre email ou vous inscrire avec email/mot de passe.",
        )

    if not user and email:
        # Check if email already exists (link accounts)
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.oauth_provider = provider
            user.oauth_id = provider_id
            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url

    if not user:
        # Create new user
        # Ensure unique username
        base_name = name or "dj"
        unique_name = base_name
        counter = 1
        while db.query(User).filter(User.name == unique_name).first():
            unique_name = f"{base_name}{counter}"
            counter += 1

        user = User(
            email=email,
            name=unique_name,
            password_hash=None,  # OAuth-only, no password
            oauth_provider=provider,
            oauth_id=provider_id,
            avatar_url=avatar_url,
            email_verified=True,  # OAuth emails are pre-verified
        )
        db.add(user)

    user.last_login_at = datetime.utcnow()
    access = create_access_token({"sub": str(user.id)})
    refresh = create_refresh_token({"sub": str(user.id)})
    user.refresh_token = _hash_token(refresh)  # 🔴 FIX (faille 8)

    db.commit()
    db.refresh(user)

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )
