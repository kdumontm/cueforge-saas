from typing import Optional
from datetime import datetime, timedelta
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models import User
from app.services.auth_service import (
    hash_password, verify_password, create_access_token
)
from app.services.email_service import send_reset_email
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class UserRegister(BaseModel):
    email: EmailStr       # Required for account, NOT used for login
    password: str
    name: str             # This becomes the username used to log in


class UserLogin(BaseModel):
    username: str         # Login is by username (name field), not email
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    subscription_plan: str
    is_admin: bool
    tracks_today: int

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/register", response_model=TokenResponse)
async def register(user_data: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.name == user_data.name).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    new_user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hash_password(user_data.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    token = create_access_token({"sub": str(new_user.id)})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.from_orm(new_user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login by username (name field). Email is not used for login."""
    user = db.query(User).filter(User.name == credentials.username).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.from_orm(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.from_orm(user)


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
    db.commit()
    db.refresh(user)
    return UserResponse.from_orm(user)


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()
        try:
            send_reset_email(user.email, token)
        except Exception:
            pass  # Log but don't fail
    return {"message": "If this email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.reset_token == req.token).first()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    user.password_hash = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()
    return {"message": "Password updated successfully"}


@router.delete("/me", status_code=204)
async def delete_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()


@router.post("/setup-admin")
async def setup_admin(email: str, secret: str, db: Session = Depends(get_db)):
    import os
    key = os.getenv("ADMIN_SETUP_KEY")
    if not key or secret != key:
        raise HTTPException(status_code=403, detail="Invalid setup key")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    db.commit()
    return {"message": f"{email} is now admin"}
