from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models import User
from app.services.auth_service import hash_password
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    subscription_plan: str
    is_admin: bool
    tracks_today: int
    created_at: str

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_custom(cls, user: User):
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            subscription_plan=user.subscription_plan,
            is_admin=user.is_admin,
            tracks_today=user.tracks_today,
            created_at=user.created_at.isoformat() if user.created_at else "",
        )


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    subscription_plan: str = "free"  # free | pro | unlimited
    is_admin: bool = False


class UpdateUserRequest(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    subscription_plan: Optional[str] = None
    is_admin: Optional[bool] = None


# ── Dependency: admin-only guard ──────────────────────────────────────────────

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """List all users (admin only)."""
    users = db.query(User).offset(skip).limit(limit).all()
    return [AdminUserResponse.from_orm_custom(u) for u in users]


@router.get("/users/{user_id}", response_model=AdminUserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Get a single user by ID (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return AdminUserResponse.from_orm_custom(user)


@router.post("/users", response_model=AdminUserResponse, status_code=201)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Create a new user (admin or regular, any plan). Admin only."""
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    valid_plans = {"free", "pro", "unlimited"}
    if body.subscription_plan not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Choose from: {valid_plans}")

    new_user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        subscription_plan=body.subscription_plan,
        is_admin=body.is_admin,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return AdminUserResponse.from_orm_custom(new_user)


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update any field of a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.email is not None:
        existing = db.query(User).filter(User.email == body.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = body.email

    if body.name is not None:
        user.name = body.name

    if body.password is not None:
        user.password_hash = hash_password(body.password)

    if body.subscription_plan is not None:
        valid_plans = {"free", "pro", "unlimited"}
        if body.subscription_plan not in valid_plans:
            raise HTTPException(status_code=400, detail=f"Invalid plan. Choose from: {valid_plans}")
        user.subscription_plan = body.subscription_plan

    if body.is_admin is not None:
        # Prevent admin from removing their own admin status
        if user.id == current_admin.id and not body.is_admin:
            raise HTTPException(status_code=400, detail="Cannot remove your own admin status")
        user.is_admin = body.is_admin

    db.commit()
    db.refresh(user)
    return AdminUserResponse.from_orm_custom(user)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Delete a user (admin only). Cannot delete yourself."""
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

