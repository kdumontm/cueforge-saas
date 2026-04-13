"""Router admin — Dashboard / stats rapides."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.cms import Page, MediaAsset
from app.middleware.admin import require_admin

router = APIRouter(prefix="/admin", tags=["admin-dashboard"])


@router.get("/dashboard")
async def admin_dashboard(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Stats rapides pour le dashboard admin."""
    from app.models.organization import Organization

    total_users = db.query(User).count()
    verified_users = db.query(User).filter(User.email_verified == True).count()
    admin_users = db.query(User).filter(User.is_admin == True).count()
    total_orgs = db.query(Organization).count()
    total_pages = db.query(Page).count()
    published_pages = db.query(Page).filter(Page.is_published == True).count()
    total_media = db.query(MediaAsset).count()

    plans = {}
    for plan_name in ("free", "pro", "unlimited", "enterprise"):
        plans[plan_name] = db.query(User).filter(User.subscription_plan == plan_name).count()

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "admins": admin_users,
            "by_plan": plans,
        },
        "organizations": total_orgs,
        "pages": {
            "total": total_pages,
            "published": published_pages,
        },
        "media": total_media,
    }
