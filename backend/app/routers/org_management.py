"""
Organization management router — NEW file
Handles: create org, invite members, manage roles, tenant isolation.

Mount as: app.include_router(org_management.router, prefix="/api/v1/org", tags=["organization"])
"""
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, constr

from app.database import get_db
from app.models import User
from app.models.organization import Organization, OrgInvite, _generate_slug
from app.middleware.auth import get_current_user
from app.services.email_service import send_invite_email

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────


class OrgCreate(BaseModel):
    name: constr(min_length=2, max_length=100)


class OrgUpdate(BaseModel):
    name: Optional[constr(min_length=2, max_length=100)] = None
    description: Optional[constr(max_length=500)] = None
    logo_url: Optional[constr(max_length=500)] = None


class OrgResponse(BaseModel):
    id: int
    name: str
    slug: str
    plan: str
    max_members: int
    owner_id: int
    logo_url: Optional[str] = None
    description: Optional[str] = None
    member_count: int = 0

    class Config:
        from_attributes = True


class MemberResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    org_role: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = "member"  # admin / member


class InviteResponse(BaseModel):
    id: int
    email: str
    role: str
    status: str
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True


class RoleUpdate(BaseModel):
    role: str  # admin / member


# ─── Helpers ──────────────────────────────────────────────────────


def _require_org_admin(user: User) -> Organization:
    """Ensure user belongs to an org and has admin+ role."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="You don't belong to an organization")
    if user.org_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user.organization


def _require_org_owner(user: User) -> Organization:
    """Ensure user is the org owner."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="You don't belong to an organization")
    if user.org_role != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    return user.organization


# ─── CRUD ─────────────────────────────────────────────────────────


@router.post("", response_model=OrgResponse, status_code=201)
async def create_org(
    data: OrgCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new organization. The creator becomes the owner."""
    if user.organization_id:
        raise HTTPException(status_code=400, detail="You already belong to an organization")

    org = Organization(
        name=data.name,
        slug=_generate_slug(data.name),
        owner_id=user.id,
        plan=user.subscription_plan if user.subscription_plan != "free" else "free",
        max_members=_plan_max_members(user.subscription_plan),
    )
    db.add(org)
    db.flush()  # get org.id

    user.organization_id = org.id
    user.org_role = "owner"
    db.commit()
    db.refresh(org)

    return _org_response(org, db)


@router.get("", response_model=OrgResponse)
async def get_org(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get the current user's organization."""
    if not user.organization_id:
        raise HTTPException(status_code=404, detail="You don't belong to an organization")
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return _org_response(org, db)


@router.put("", response_model=OrgResponse)
async def update_org(
    data: OrgUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update organization settings. Requires admin+ role."""
    org = _require_org_admin(user)
    if data.name is not None:
        org.name = data.name
    if data.description is not None:
        org.description = data.description
    if data.logo_url is not None:
        org.logo_url = data.logo_url
    db.commit()
    db.refresh(org)
    return _org_response(org, db)


# ─── Members ─────────────────────────────────────────────────────


@router.get("/members", response_model=List[MemberResponse])
async def list_members(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all members of the current user's org."""
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="No organization")
    members = db.query(User).filter(User.organization_id == user.organization_id).all()
    return [MemberResponse.model_validate(m) for m in members]


@router.put("/members/{user_id}/role", response_model=MemberResponse)
async def update_member_role(
    user_id: int,
    data: RoleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change a member's role. Requires owner role."""
    _require_org_owner(user)

    if data.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'")
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    target = db.query(User).filter(
        User.id == user_id,
        User.organization_id == user.organization_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    target.org_role = data.role
    db.commit()
    db.refresh(target)
    return MemberResponse.model_validate(target)


@router.delete("/members/{user_id}", status_code=204)
async def remove_member(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a member from the org. Requires admin+ role."""
    _require_org_admin(user)

    if user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    target = db.query(User).filter(
        User.id == user_id,
        User.organization_id == user.organization_id,
    ).first()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    target.organization_id = None
    target.org_role = "member"
    db.commit()


# ─── Invitations ─────────────────────────────────────────────────


@router.post("/invite", response_model=InviteResponse, status_code=201)
async def invite_member(
    data: InviteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invite someone to join the org by email. Requires admin+ role."""
    org = _require_org_admin(user)

    # Check member limit
    member_count = db.query(User).filter(User.organization_id == org.id).count()
    if member_count >= org.max_members:
        raise HTTPException(status_code=403, detail="Organization has reached its member limit")

    # Check for existing pending invite
    existing = db.query(OrgInvite).filter(
        OrgInvite.organization_id == org.id,
        OrgInvite.email == data.email,
        OrgInvite.status == "pending",
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Invite already pending for this email")

    # Check if user already a member
    existing_user = db.query(User).filter(
        User.email == data.email,
        User.organization_id == org.id,
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User is already a member")

    invite = OrgInvite(
        organization_id=org.id,
        email=data.email,
        role=data.role,
        invited_by=user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    # Send email
    try:
        send_invite_email(data.email, org.name, user.name or "Someone", invite.token)
    except Exception:
        pass  # SMTP not configured

    return InviteResponse.model_validate(invite)


@router.get("/invites", response_model=List[InviteResponse])
async def list_invites(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List pending invites. Requires admin+ role."""
    _require_org_admin(user)
    invites = db.query(OrgInvite).filter(
        OrgInvite.organization_id == user.organization_id,
        OrgInvite.status == "pending",
    ).all()
    return [InviteResponse.model_validate(i) for i in invites]


@router.post("/invite/{token}/accept")
async def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Accept an organization invite."""
    invite = db.query(OrgInvite).filter(
        OrgInvite.token == token,
        OrgInvite.status == "pending",
    ).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or expired")
    if invite.expires_at < datetime.utcnow():
        invite.status = "expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Invite has expired")
    if invite.email != user.email:
        raise HTTPException(status_code=403, detail="This invite is for a different email")
    if user.organization_id:
        raise HTTPException(status_code=400, detail="You already belong to an organization")

    # Join the org
    user.organization_id = invite.organization_id
    user.org_role = invite.role
    invite.status = "accepted"
    invite.accepted_at = datetime.utcnow()
    db.commit()

    return {"message": "Successfully joined the organization"}


# ─── Helpers ──────────────────────────────────────────────────────


def _plan_max_members(plan: str) -> int:
    """Get max members for a plan."""
    limits = {"free": 1, "pro": 5, "enterprise": 50, "unlimited": 100}
    return limits.get(plan, 1)


def _org_response(org: Organization, db: Session) -> OrgResponse:
    """Build OrgResponse with member count."""
    count = db.query(User).filter(User.organization_id == org.id).count()
    resp = OrgResponse.model_validate(org)
    resp.member_count = count
    return resp
