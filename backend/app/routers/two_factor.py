"""
Two-Factor Authentication (TOTP) router.
Uses pyotp for TOTP generation/verification.

Endpoints:
- POST /2fa/setup → generate TOTP secret + QR code URI (requires auth)
- POST /2fa/enable { code } → verify TOTP code and enable 2FA
- POST /2fa/verify { code } → verify TOTP during login
- POST /2fa/disable { code } → disable 2FA
"""
import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models import User
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/2fa", tags=["2fa"])


class TOTPSetupResponse(BaseModel):
    """Response for TOTP setup endpoint."""
    secret: str
    uri: str  # otpauth:// URI for QR code


class TOTPCodeRequest(BaseModel):
    """Request body for TOTP code verification."""
    code: str


class TOTPStatusResponse(BaseModel):
    """Response showing 2FA status."""
    enabled: bool
    backup_codes: list[str] | None = None


@router.post("/setup", response_model=TOTPSetupResponse)
async def setup_2fa(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate a new TOTP secret for the user.

    This stores a temporary pending secret on the user.
    The user must call /2fa/enable within the session to confirm.

    Returns:
        TOTPSetupResponse with secret and provisioning URI for QR code generation
    """
    # Generate new random secret
    secret = pyotp.random_base32()

    # Store pending secret on user (will be moved to active secret when verified)
    user.totp_pending_secret = secret
    db.commit()

    # Generate provisioning URI for QR code
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(
        name=user.email,
        issuer_name="CueForge"
    )

    return TOTPSetupResponse(secret=secret, uri=uri)


@router.post("/enable")
async def enable_2fa(
    req: TOTPCodeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify TOTP code and enable 2FA for the user.

    Requires a pending secret from /2fa/setup.
    Verifies the provided 6-digit code against the pending secret.
    If valid, moves the pending secret to active and enables 2FA.

    Args:
        req: Contains the 6-digit TOTP code to verify

    Raises:
        HTTPException 400: If 2FA is already enabled or no pending secret
        HTTPException 401: If the code is invalid
    """
    if user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA est déjà activé pour ce compte"
        )

    if not user.totp_pending_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lancez /2fa/setup d'abord pour générer un secret"
        )

    # Verify the code against the pending secret
    totp = pyotp.TOTP(user.totp_pending_secret)
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code 2FA invalide. Veuillez vérifier et réessayer."
        )

    # Code is valid — move pending secret to active and enable 2FA
    user.totp_secret = user.totp_pending_secret
    user.totp_pending_secret = None
    user.totp_enabled = True
    db.commit()

    return {
        "message": "2FA activé avec succès",
        "status": "enabled"
    }


@router.post("/verify")
async def verify_2fa(
    req: TOTPCodeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify a TOTP code (used during login flow or for verification).

    Args:
        req: Contains the 6-digit TOTP code to verify

    Raises:
        HTTPException 400: If 2FA is not enabled
        HTTPException 401: If the code is invalid
    """
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA n'est pas activé pour ce compte"
        )

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code 2FA invalide"
        )

    return {
        "message": "Code vérifié avec succès",
        "status": "verified"
    }


@router.post("/disable")
async def disable_2fa(
    req: TOTPCodeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Disable 2FA after verifying the current TOTP code.

    As a security measure, the user must provide a valid TOTP code
    to disable 2FA. This prevents accidental or unauthorized disabling.

    Args:
        req: Contains the 6-digit TOTP code to verify

    Raises:
        HTTPException 400: If 2FA is not enabled
        HTTPException 401: If the code is invalid
    """
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA n'est pas activé pour ce compte"
        )

    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(req.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code 2FA invalide. Impossible de désactiver 2FA."
        )

    # Code is valid — disable 2FA
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_pending_secret = None
    db.commit()

    return {
        "message": "2FA désactivé avec succès",
        "status": "disabled"
    }


@router.get("/status")
async def get_2fa_status(
    user: User = Depends(get_current_user),
):
    """
    Get the current 2FA status for the user.

    Returns:
        Object with enabled flag
    """
    return {
        "enabled": user.totp_enabled,
        "has_pending_secret": user.totp_pending_secret is not None
    }
