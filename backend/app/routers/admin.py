from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models import User
from app.models.site_settings import PageConfig, PlanFeature, DEFAULT_PLAN_FEATURES, DEFAULT_PLAN_CONFIGS
from app.services.auth_service import hash_password, verify_password
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
            created_at=str(user.created_at) if user.created_at else "",
        )


class CreateUserRequest(BaseModel):
    email: EmailStr
    name: str
    password: str
    subscription_plan: str = "free"
    is_admin: bool = False


class UpdateUserRequest(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = None
    password: Optional[str] = None
    subscription_plan: Optional[str] = None
    is_admin: Optional[bool] = None


class PageConfigResponse(BaseModel):
    id: int
    page_name: str
    is_enabled: bool
    label: Optional[str]

    class Config:
        from_attributes = True


class PageToggleRequest(BaseModel):
    is_enabled: bool


class UserSettingsUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class UserProfileResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    subscription_plan: str
    is_admin: bool

    class Config:
        from_attributes = True


# ── Helpers ──────────────────────────────────────────────────────────────────

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


# ── Admin: User Management ──────────────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """List all users. Admin only."""
    users = db.query(User).order_by(User.id).all()
    return [AdminUserResponse.from_orm_custom(u) for u in users]


@router.post("/users", response_model=AdminUserResponse, status_code=201)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
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
    """Update a user's details. Admin only."""
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


# ── Admin: Page Management ──────────────────────────────────────────────────

@router.get("/pages", response_model=List[PageConfigResponse])
def list_pages(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """List all page configs. Admin only."""
    pages = db.query(PageConfig).order_by(PageConfig.id).all()
    return pages


@router.patch("/pages/{page_name}", response_model=PageConfigResponse)
def toggle_page(
    page_name: str,
    body: PageToggleRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Enable or disable a page. Admin only."""
    page = db.query(PageConfig).filter(PageConfig.page_name == page_name).first()
    if not page:
        raise HTTPException(status_code=404, detail=f"Page '{page_name}' not found")
    page.is_enabled = body.is_enabled
    db.commit()
    db.refresh(page)
    return page


# ── Public: Page Settings (no auth required) ────────────────────────────────

@router.get("/settings/pages", response_model=List[PageConfigResponse])
def get_public_page_settings(db: Session = Depends(get_db)):
    """Public endpoint: returns which pages are enabled/disabled."""
    pages = db.query(PageConfig).order_by(PageConfig.id).all()
    return pages


# ── User: Self-service Settings ─────────────────────────────────────────────

@router.get("/me", response_model=UserProfileResponse)
def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Get current user's profile."""
    return current_user


@router.patch("/me", response_model=UserProfileResponse)
def update_my_profile(
    body: UserSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update current user's profile (name, email, password)."""
    if body.name is not None:
        current_user.name = body.name

    if body.email is not None:
        existing = db.query(User).filter(User.email == body.email, User.id != current_user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = body.email

    if body.new_password is not None:
        if not body.current_password:
            raise HTTPException(status_code=400, detail="Current password required to set a new password")
        if not verify_password(body.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = hash_password(body.new_password)

    db.commit()
    db.refresh(current_user)
    return current_user



# ── Schemas: Plan Features ────────────────────────────────────────────────────

class PlanFeatureResponse(BaseModel):
    plan_name: str
    feature_name: str
    is_enabled: bool
    label: Optional[str]

    class Config:
        from_attributes = True


class PlanFeatureToggleRequest(BaseModel):
    is_enabled: bool


class PlanFeaturesMatrix(BaseModel):
    """Full matrix: {plan_name: {feature_name: bool}}"""
    features: dict  # {"free": {"analysis": true, ...}, "pro": {...}, ...}
    feature_labels: dict  # {"analysis": "Audio Analysis (BPM, Key, Energy)", ...}


# ── Admin: Plan Feature Gating ────────────────────────────────────────────────

@router.get("/plan-features", response_model=PlanFeaturesMatrix)
def get_plan_features(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the full plan-feature matrix. Any authenticated user can read."""
    all_features = db.query(PlanFeature).all()

    # If no features in DB yet, initialize from defaults
    if not all_features:
        for plan_name, enabled_features in DEFAULT_PLAN_CONFIGS.items():
            for feat in DEFAULT_PLAN_FEATURES:
                pf = PlanFeature(
                    plan_name=plan_name,
                    feature_name=feat["feature_name"],
                    is_enabled=feat["feature_name"] in enabled_features,
                    label=feat["label"],
                )
                db.add(pf)
        db.commit()
        all_features = db.query(PlanFeature).all()

    # Build matrix
    features = {}
    feature_labels = {}
    for pf in all_features:
        if pf.plan_name not in features:
            features[pf.plan_name] = {}
        features[pf.plan_name][pf.feature_name] = pf.is_enabled
        if pf.label:
            feature_labels[pf.feature_name] = pf.label

    return PlanFeaturesMatrix(features=features, feature_labels=feature_labels)


@router.patch("/plan-features/{plan_name}/{feature_name}")
def toggle_plan_feature(
    plan_name: str,
    feature_name: str,
    body: PlanFeatureToggleRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Toggle a feature for a specific plan. Admin only."""
    valid_plans = {"free", "pro", "unlimited"}
    if plan_name not in valid_plans:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {plan_name}")

    pf = db.query(PlanFeature).filter(
        PlanFeature.plan_name == plan_name,
        PlanFeature.feature_name == feature_name,
    ).first()

    if not pf:
        raise HTTPException(status_code=404, detail=f"Feature '{feature_name}' not found for plan '{plan_name}'")

    pf.is_enabled = body.is_enabled
    db.commit()
    db.refresh(pf)
    return {"plan_name": plan_name, "feature_name": feature_name, "is_enabled": pf.is_enabled}


@router.post("/plan-features/reset")
def reset_plan_features(
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Reset all plan features to defaults. Admin only."""
    db.query(PlanFeature).delete()
    for plan_name, enabled_features in DEFAULT_PLAN_CONFIGS.items():
        for feat in DEFAULT_PLAN_FEATURES:
            pf = PlanFeature(
                plan_name=plan_name,
                feature_name=feat["feature_name"],
                is_enabled=feat["feature_name"] in enabled_features,
                label=feat["label"],
            )
            db.add(pf)
    db.commit()
    return {"status": "reset", "message": "Plan features reset to defaults"}
