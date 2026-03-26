from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models import User
from app.services.auth_service import (
    hash_password, verify_password, create_access_token
)
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


class UserRegister(BaseModel):
    """User registration request"""
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    """User login request"""
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    """User update request"""
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class UserResponse(BaseModel):
    """User response"""
    id: int
    email: str
    name: str
    subscription_plan: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    """Token response"""
    access_token: str
    token_type: str
    user: UserResponse


@router.post("/register", response_model=TokenResponse)
async def register(
    user_data: UserRegister,
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    Register a new user.

    Args:
        user_data: Registration data
        db: Database session

    Returns:
        Token and user info
    """
    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = hash_password(user_data.password)
    user = User(
        email=user_data.email,
        name=user_data.name,
        password_hash=hashed_password,
        subscription_plan="free"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create token
    token = create_access_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: UserLogin,
    db: Session = Depends(get_db)
) -> TokenResponse:
    """
    Login user.

    Args:
        credentials: Login credentials
        db: Database session

    Returns:
        Token and user info
    """
    user = db.query(User).filter(User.email == credentials.email).first()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Create token
    token = create_access_token({"sub": str(user.id)})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.from_orm(user)
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    user: User = Depends(get_current_user)
) -> UserResponse:
    """
    Get current user info.

    Args:
        user: Current user from dependency

    Returns:
        User info
    """
    return UserResponse.from_orm(user)


@router.put("/me", response_model=UserResponse)
async def update_user(
    user_data: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> UserResponse:
    """
    Update current user.

    Args:
        user_data: Update data
        user: Current user from dependency
        db: Database session

    Returns:
        Updated user info
    """
    if user_data.name:
        user.name = user_data.name

    if user_data.email:
        # Check if email is already taken
        existing = db.query(User).filter(
            User.email == user_data.email,
            User.id != user.id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already taken"
            )
        user.email = user_data.email

    db.commit()
    db.refresh(user)

    return UserResponse.from_orm(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> None:
    """
    Delete current user account.

    Args:
        user: Current user from dependency
        db: Database session
    """
    db.delete(user)
    db.commit()
