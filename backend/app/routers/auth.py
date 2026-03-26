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
    email: EmailStr
    password: str
    name: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
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
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=user_data.email,
        name=user_data.name or user_data.email.split("@")[0],
        password_hash=hash_password(user_data.password),
        subscription_plan="free",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, token_type="bearer", user=UserResponse.from_orm(user))

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token, token_type="bearer", user=UserResponse.from_orm(user))

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.from_orm(user)

@router.put("/me", response_model=UserResponse)
async def update_me(user_data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_data.name:
        user.name = user_data.name
    if user_data.email:
        existing = db.query(User).filter(User.email == user_data.email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken")
        user.email = user_data.email
    db.commit()
    db.refresh(user)
    return UserResponse.from_orm(user)

@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    # Always return OK (security: don't reveal if email exists)
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
async def setup_admin(
    email: str,
    secret: str,
    db: Session = Depends(get_db)
):
    """Promote a user to admin. Protected by ADMIN_SETUP_KEY env var."""
    import os
    key = os.getenv("ADMIN_SETUP_KEY", "")
    if not key or secret != key:
        raise HTTPException(status_code=403, detail="Invalid setup key")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    db.commit()
    return {"message": f"{email} is now admin"}
