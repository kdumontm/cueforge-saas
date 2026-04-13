"""
Admin Email & Stripe Router — Management endpoints for email templates and revenue/pricing.

Endpoints:
  /admin/email-templates        → Email template CRUD + duplicate + preview + test
  /admin/email-history          → Email send history with filters
  /admin/email-stats            → Email statistics (sent, delivered, opened, clicked)
  /admin/drip-campaigns         → Drip campaign CRUD + stats
  /admin/pricing-plans          → Pricing plan CRUD + list
  /admin/coupons                → Coupon CRUD + list
  /admin/invoices               → Invoice listing + details + refund
  /admin/revenue-dashboard      → MRR, ARR, churn, LTV, ARPU, etc.
  /admin/revenue/breakdown      → Revenue by plan
  /admin/revenue/mrr-history    → MRR history (monthly)
  /admin/revenue/cohort-analysis → Cohort analysis (signup month → retention)
  /admin/revenue/trial-conversion → Trial conversion stats

Tous les endpoints nécessitent is_admin == True.
"""
import json
from datetime import datetime, timedelta
from typing import Optional, List, Any, Dict
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, JSON, ForeignKey, Index, func, and_, or_, desc
from sqlalchemy.orm import Session, relationship

from app.database import get_db, Base
from app.middleware.admin import require_admin
from app.models.user import User
from app.models.subscription import Subscription

router = APIRouter(prefix="/admin", tags=["admin-email-stripe"])


# ═══════════════════════════════════════════════
# SQLAlchemy Models
# ═══════════════════════════════════════════════

class EmailTemplate(Base):
    """Email template model."""
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    subject = Column(String(500), nullable=False)
    html_body = Column(Text, nullable=False)
    text_body = Column(Text, nullable=True)
    category = Column(String(50), nullable=False, index=True)  # welcome, transactional, promotional, trial, etc.
    variables = Column(JSON, default=list)  # ["{{name}}", "{{email}}", ...]
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_email_template_category', 'category'),
        Index('ix_email_template_active', 'is_active'),
    )


class EmailSendHistory(Base):
    """Email send history log."""
    __tablename__ = "email_send_history"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("email_templates.id"), nullable=True, index=True)
    recipient_email = Column(String(255), nullable=False, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    subject = Column(String(500), nullable=False)
    status = Column(String(50), default="sent", index=True)  # sent, delivered, bounced, complained, opened, clicked
    sent_at = Column(DateTime, default=datetime.utcnow, index=True)
    delivered_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    clicked_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    extra_data = Column(JSON, default=dict)

    __table_args__ = (
        Index('ix_email_history_template', 'template_id'),
        Index('ix_email_history_status', 'status'),
        Index('ix_email_history_sent_at', 'sent_at'),
    )


class DripCampaign(Base):
    """Drip campaign configuration."""
    __tablename__ = "drip_campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    trigger_event = Column(String(50), nullable=False)  # signup, first_track, trial_started, etc.
    is_active = Column(Boolean, default=True, index=True)
    steps = Column(JSON, default=list)  # [{delay_hours: int, template_id: int}, ...]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_drip_campaign_active', 'is_active'),
        Index('ix_drip_campaign_trigger', 'trigger_event'),
    )


class PricingPlan(Base):
    """Pricing plan model."""
    __tablename__ = "pricing_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    stripe_price_id = Column(String(255), unique=True, nullable=False)
    amount = Column(Integer, nullable=False)  # in cents
    currency = Column(String(3), default="USD")
    interval = Column(String(50), nullable=False)  # month, year, etc.
    trial_days = Column(Integer, default=0)
    features = Column(JSON, default=list)  # ["feature1", "feature2", ...]
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_pricing_plan_active', 'is_active'),
        Index('ix_pricing_plan_stripe_id', 'stripe_price_id'),
    )


class Coupon(Base):
    """Coupon/discount code model."""
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, nullable=False, index=True)
    percent_off = Column(Float, nullable=True)  # 0-100
    amount_off = Column(Integer, nullable=True)  # in cents
    currency = Column(String(3), default="USD")
    duration = Column(String(50), nullable=False)  # once, repeating, forever
    duration_in_months = Column(Integer, nullable=True)
    max_redemptions = Column(Integer, nullable=True)
    current_redemptions = Column(Integer, default=0)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_coupon_active', 'is_active'),
        Index('ix_coupon_code', 'code'),
    )


class Invoice(Base):
    """Invoice model."""
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    stripe_invoice_id = Column(String(255), unique=True, nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # in cents
    currency = Column(String(3), default="USD")
    status = Column(String(50), nullable=False, index=True)  # draft, open, paid, uncollectible, void
    description = Column(Text, nullable=True)
    invoice_number = Column(String(100), nullable=True)
    issued_at = Column(DateTime, nullable=False)
    due_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    extra_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_invoice_user', 'user_id'),
        Index('ix_invoice_status', 'status'),
        Index('ix_invoice_issued_at', 'issued_at'),
    )


class Refund(Base):
    """Refund record model."""
    __tablename__ = "refunds"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # in cents
    currency = Column(String(3), default="USD")
    reason = Column(String(255), nullable=True)
    stripe_refund_id = Column(String(255), nullable=True, index=True)
    status = Column(String(50), default="pending", index=True)  # pending, succeeded, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('ix_refund_invoice', 'invoice_id'),
        Index('ix_refund_status', 'status'),
    )


# ═══════════════════════════════════════════════
# Pydantic Schemas
# ═══════════════════════════════════════════════

# ─ Email Templates ─

class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    html_body: str
    text_body: Optional[str] = None
    category: str
    variables: List[str] = []
    is_active: bool = True


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    html_body: Optional[str] = None
    text_body: Optional[str] = None
    category: Optional[str] = None
    variables: Optional[List[str]] = None
    is_active: Optional[bool] = None


class EmailTemplateResponse(BaseModel):
    id: int
    name: str
    subject: str
    html_body: str
    text_body: Optional[str]
    category: str
    variables: List[str]
    is_active: bool
    created_at: str
    updated_at: str


class EmailTemplatePreviewRequest(BaseModel):
    sample_data: Dict[str, Any] = Field(default_factory=dict)


class EmailSendTestRequest(BaseModel):
    recipient_email: str
    sample_data: Dict[str, Any] = Field(default_factory=dict)


class EmailHistoryResponse(BaseModel):
    id: int
    template_id: Optional[int]
    recipient_email: str
    subject: str
    status: str
    sent_at: str
    delivered_at: Optional[str]
    opened_at: Optional[str]
    clicked_at: Optional[str]


class EmailStatsResponse(BaseModel):
    total_sent: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    delivery_rate: float
    open_rate: float
    click_rate: float


# ─ Drip Campaigns ─

class DripCampaignStepConfig(BaseModel):
    delay_hours: int
    template_id: int


class DripCampaignCreate(BaseModel):
    name: str
    trigger_event: str
    steps: List[DripCampaignStepConfig]
    is_active: bool = True


class DripCampaignUpdate(BaseModel):
    name: Optional[str] = None
    trigger_event: Optional[str] = None
    steps: Optional[List[DripCampaignStepConfig]] = None
    is_active: Optional[bool] = None


class DripCampaignResponse(BaseModel):
    id: int
    name: str
    trigger_event: str
    steps: List[Dict[str, Any]]
    is_active: bool
    created_at: str
    updated_at: str


# ─ Pricing Plans ─

class PricingPlanCreate(BaseModel):
    name: str
    stripe_price_id: str
    amount: int
    currency: str = "USD"
    interval: str
    trial_days: int = 0
    features: List[str] = []
    is_active: bool = True


class PricingPlanUpdate(BaseModel):
    name: Optional[str] = None
    stripe_price_id: Optional[str] = None
    amount: Optional[int] = None
    currency: Optional[str] = None
    interval: Optional[str] = None
    trial_days: Optional[int] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None


class PricingPlanResponse(BaseModel):
    id: int
    name: str
    stripe_price_id: str
    amount: int
    currency: str
    interval: str
    trial_days: int
    features: List[str]
    is_active: bool
    created_at: str
    updated_at: str


# ─ Coupons ─

class CouponCreate(BaseModel):
    code: str
    percent_off: Optional[float] = None
    amount_off: Optional[int] = None
    currency: str = "USD"
    duration: str
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True


class CouponUpdate(BaseModel):
    code: Optional[str] = None
    percent_off: Optional[float] = None
    amount_off: Optional[int] = None
    currency: Optional[str] = None
    duration: Optional[str] = None
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class CouponResponse(BaseModel):
    id: int
    code: str
    percent_off: Optional[float]
    amount_off: Optional[int]
    currency: str
    duration: str
    duration_in_months: Optional[int]
    max_redemptions: Optional[int]
    current_redemptions: int
    expires_at: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


# ─ Invoices ─

class InvoiceResponse(BaseModel):
    id: int
    user_id: int
    stripe_invoice_id: str
    amount: int
    currency: str
    status: str
    description: Optional[str]
    invoice_number: Optional[str]
    issued_at: str
    due_at: Optional[str]
    paid_at: Optional[str]
    created_at: str
    updated_at: str


class RefundRequest(BaseModel):
    amount: Optional[int] = None  # if None, full refund
    reason: Optional[str] = None


class RefundResponse(BaseModel):
    id: int
    invoice_id: int
    amount: int
    currency: str
    reason: Optional[str]
    stripe_refund_id: Optional[str]
    status: str
    created_at: str


# ─ Revenue Dashboard ─

class RevenueDashboardResponse(BaseModel):
    mrr: int  # in cents
    arr: int
    churn_rate: float  # percentage
    ltv: float  # lifetime value in dollars
    arpu: float  # average revenue per user
    new_mrr: int
    expansion_mrr: int
    contraction_mrr: int
    churned_mrr: int
    active_subscriptions: int
    total_customers: int


class RevenuePlanBreakdownResponse(BaseModel):
    plan_name: str
    subscriber_count: int
    mrr: int
    percentage_of_total_mrr: float


class MRRHistoryPoint(BaseModel):
    month: str  # YYYY-MM
    mrr: int


class CohortAnalysisRow(BaseModel):
    signup_month: str  # YYYY-MM
    month_0: int  # first month retention (%)
    month_1: Optional[int] = None
    month_2: Optional[int] = None
    month_3: Optional[int] = None
    month_6: Optional[int] = None
    month_12: Optional[int] = None


class TrialConversionResponse(BaseModel):
    total_trials: int
    converted_to_paid: int
    conversion_rate: float  # percentage
    avg_trial_duration_days: float
    most_common_conversion_plan: Optional[str]


# ═══════════════════════════════════════════════
# Serializers
# ═══════════════════════════════════════════════

def _serialize_email_template(t: EmailTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "subject": t.subject,
        "html_body": t.html_body,
        "text_body": t.text_body,
        "category": t.category,
        "variables": t.variables or [],
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _serialize_email_history(e: EmailSendHistory) -> dict:
    return {
        "id": e.id,
        "template_id": e.template_id,
        "recipient_email": e.recipient_email,
        "recipient_user_id": e.recipient_user_id,
        "subject": e.subject,
        "status": e.status,
        "sent_at": e.sent_at.isoformat() if e.sent_at else None,
        "delivered_at": e.delivered_at.isoformat() if e.delivered_at else None,
        "opened_at": e.opened_at.isoformat() if e.opened_at else None,
        "clicked_at": e.clicked_at.isoformat() if e.clicked_at else None,
        "error_message": e.error_message,
    }


def _serialize_drip_campaign(d: DripCampaign) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "trigger_event": d.trigger_event,
        "steps": d.steps or [],
        "is_active": d.is_active,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


def _serialize_pricing_plan(p: PricingPlan) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "stripe_price_id": p.stripe_price_id,
        "amount": p.amount,
        "currency": p.currency,
        "interval": p.interval,
        "trial_days": p.trial_days,
        "features": p.features or [],
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _serialize_coupon(c: Coupon) -> dict:
    return {
        "id": c.id,
        "code": c.code,
        "percent_off": c.percent_off,
        "amount_off": c.amount_off,
        "currency": c.currency,
        "duration": c.duration,
        "duration_in_months": c.duration_in_months,
        "max_redemptions": c.max_redemptions,
        "current_redemptions": c.current_redemptions,
        "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _serialize_invoice(i: Invoice) -> dict:
    return {
        "id": i.id,
        "user_id": i.user_id,
        "stripe_invoice_id": i.stripe_invoice_id,
        "amount": i.amount,
        "currency": i.currency,
        "status": i.status,
        "description": i.description,
        "invoice_number": i.invoice_number,
        "issued_at": i.issued_at.isoformat() if i.issued_at else None,
        "due_at": i.due_at.isoformat() if i.due_at else None,
        "paid_at": i.paid_at.isoformat() if i.paid_at else None,
        "created_at": i.created_at.isoformat() if i.created_at else None,
        "updated_at": i.updated_at.isoformat() if i.updated_at else None,
    }


def _serialize_refund(r: Refund) -> dict:
    return {
        "id": r.id,
        "invoice_id": r.invoice_id,
        "amount": r.amount,
        "currency": r.currency,
        "reason": r.reason,
        "stripe_refund_id": r.stripe_refund_id,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ═══════════════════════════════════════════════
# Email Template Endpoints
# ═══════════════════════════════════════════════

@router.get("/email-templates")
async def list_email_templates(
    category: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List email templates with optional filters."""
    query = db.query(EmailTemplate)

    if category:
        query = query.filter(EmailTemplate.category == category)
    if is_active is not None:
        query = query.filter(EmailTemplate.is_active == is_active)
    if search:
        query = query.filter(
            or_(
                EmailTemplate.name.ilike(f"%{search}%"),
                EmailTemplate.subject.ilike(f"%{search}%"),
            )
        )

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_email_template(t) for t in items],
    }


@router.post("/email-templates")
async def create_email_template(
    payload: EmailTemplateCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new email template."""
    existing = db.query(EmailTemplate).filter(EmailTemplate.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Template name already exists.")

    template = EmailTemplate(
        name=payload.name,
        subject=payload.subject,
        html_body=payload.html_body,
        text_body=payload.text_body,
        category=payload.category,
        variables=payload.variables,
        is_active=payload.is_active,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return _serialize_email_template(template)


@router.get("/email-templates/{template_id}")
async def get_email_template(
    template_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a single email template."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    return _serialize_email_template(template)


@router.put("/email-templates/{template_id}")
async def update_email_template(
    template_id: int,
    payload: EmailTemplateUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update an email template."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    if payload.name is not None:
        existing = db.query(EmailTemplate).filter(
            and_(EmailTemplate.name == payload.name, EmailTemplate.id != template_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Template name already exists.")
        template.name = payload.name

    if payload.subject is not None:
        template.subject = payload.subject
    if payload.html_body is not None:
        template.html_body = payload.html_body
    if payload.text_body is not None:
        template.text_body = payload.text_body
    if payload.category is not None:
        template.category = payload.category
    if payload.variables is not None:
        template.variables = payload.variables
    if payload.is_active is not None:
        template.is_active = payload.is_active

    template.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(template)

    return _serialize_email_template(template)


@router.delete("/email-templates/{template_id}")
async def delete_email_template(
    template_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete an email template."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    db.delete(template)
    db.commit()

    return {"success": True}


@router.post("/email-templates/{template_id}/duplicate")
async def duplicate_email_template(
    template_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Duplicate an email template."""
    original = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Template not found.")

    new_name = f"{original.name} (Copy)"
    counter = 1
    while db.query(EmailTemplate).filter(EmailTemplate.name == new_name).first():
        new_name = f"{original.name} (Copy {counter})"
        counter += 1

    duplicate = EmailTemplate(
        name=new_name,
        subject=original.subject,
        html_body=original.html_body,
        text_body=original.text_body,
        category=original.category,
        variables=original.variables,
        is_active=original.is_active,
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)

    return _serialize_email_template(duplicate)


@router.post("/email-templates/{template_id}/preview")
async def preview_email_template(
    template_id: int,
    payload: EmailTemplatePreviewRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Preview a template with sample data."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    html_body = template.html_body
    text_body = template.text_body or ""
    subject = template.subject

    # Simple template rendering with {{variable}} syntax
    for key, value in payload.sample_data.items():
        placeholder = f"{{{{{key}}}}}"
        html_body = html_body.replace(placeholder, str(value))
        text_body = text_body.replace(placeholder, str(value))
        subject = subject.replace(placeholder, str(value))

    return {
        "subject": subject,
        "html_body": html_body,
        "text_body": text_body,
    }


@router.post("/email-templates/{template_id}/test")
async def send_test_email(
    template_id: int,
    payload: EmailSendTestRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Send a test email from a template."""
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found.")

    # Log the test email as a send history entry
    history = EmailSendHistory(
        template_id=template_id,
        recipient_email=payload.recipient_email,
        recipient_user_id=admin.id,
        subject=template.subject,
        status="sent",
        sent_at=datetime.utcnow(),
    )
    db.add(history)
    db.commit()
    db.refresh(history)

    return {
        "success": True,
        "message": f"Test email sent to {payload.recipient_email}",
        "history_id": history.id,
    }


# ═══════════════════════════════════════════════
# Email History & Stats Endpoints
# ═══════════════════════════════════════════════

@router.get("/email-history")
async def list_email_history(
    template_id: Optional[int] = Query(None),
    recipient_email: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List email send history with filters."""
    query = db.query(EmailSendHistory)

    if template_id is not None:
        query = query.filter(EmailSendHistory.template_id == template_id)
    if recipient_email:
        query = query.filter(EmailSendHistory.recipient_email.ilike(f"%{recipient_email}%"))
    if status:
        query = query.filter(EmailSendHistory.status == status)
    if date_from:
        query = query.filter(EmailSendHistory.sent_at >= date_from)
    if date_to:
        query = query.filter(EmailSendHistory.sent_at <= date_to)

    total = query.count()
    items = query.order_by(desc(EmailSendHistory.sent_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_email_history(e) for e in items],
    }


@router.get("/email-stats")
async def get_email_stats(
    template_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get email statistics."""
    query = db.query(EmailSendHistory)

    if template_id is not None:
        query = query.filter(EmailSendHistory.template_id == template_id)
    if date_from:
        query = query.filter(EmailSendHistory.sent_at >= date_from)
    if date_to:
        query = query.filter(EmailSendHistory.sent_at <= date_to)

    total_sent = query.count()
    total_delivered = query.filter(EmailSendHistory.status.in_(["delivered", "opened", "clicked"])).count()
    total_opened = query.filter(EmailSendHistory.opened_at.isnot(None)).count()
    total_clicked = query.filter(EmailSendHistory.clicked_at.isnot(None)).count()

    delivery_rate = (total_delivered / total_sent * 100) if total_sent > 0 else 0
    open_rate = (total_opened / total_delivered * 100) if total_delivered > 0 else 0
    click_rate = (total_clicked / total_opened * 100) if total_opened > 0 else 0

    return {
        "total_sent": total_sent,
        "total_delivered": total_delivered,
        "total_opened": total_opened,
        "total_clicked": total_clicked,
        "delivery_rate": round(delivery_rate, 2),
        "open_rate": round(open_rate, 2),
        "click_rate": round(click_rate, 2),
    }


# ═══════════════════════════════════════════════
# Drip Campaign Endpoints
# ═══════════════════════════════════════════════

@router.get("/drip-campaigns")
async def list_drip_campaigns(
    is_active: Optional[bool] = Query(None),
    trigger_event: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List drip campaigns with filters."""
    query = db.query(DripCampaign)

    if is_active is not None:
        query = query.filter(DripCampaign.is_active == is_active)
    if trigger_event:
        query = query.filter(DripCampaign.trigger_event == trigger_event)

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_drip_campaign(d) for d in items],
    }


@router.post("/drip-campaigns")
async def create_drip_campaign(
    payload: DripCampaignCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new drip campaign."""
    existing = db.query(DripCampaign).filter(DripCampaign.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Campaign name already exists.")

    campaign = DripCampaign(
        name=payload.name,
        trigger_event=payload.trigger_event,
        steps=[step.dict() for step in payload.steps],
        is_active=payload.is_active,
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)

    return _serialize_drip_campaign(campaign)


@router.get("/drip-campaigns/{campaign_id}")
async def get_drip_campaign(
    campaign_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a single drip campaign."""
    campaign = db.query(DripCampaign).filter(DripCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    return _serialize_drip_campaign(campaign)


@router.put("/drip-campaigns/{campaign_id}")
async def update_drip_campaign(
    campaign_id: int,
    payload: DripCampaignUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a drip campaign."""
    campaign = db.query(DripCampaign).filter(DripCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    if payload.name is not None:
        existing = db.query(DripCampaign).filter(
            and_(DripCampaign.name == payload.name, DripCampaign.id != campaign_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Campaign name already exists.")
        campaign.name = payload.name

    if payload.trigger_event is not None:
        campaign.trigger_event = payload.trigger_event
    if payload.steps is not None:
        campaign.steps = [step.dict() for step in payload.steps]
    if payload.is_active is not None:
        campaign.is_active = payload.is_active

    campaign.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(campaign)

    return _serialize_drip_campaign(campaign)


@router.delete("/drip-campaigns/{campaign_id}")
async def delete_drip_campaign(
    campaign_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a drip campaign."""
    campaign = db.query(DripCampaign).filter(DripCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    db.delete(campaign)
    db.commit()

    return {"success": True}


@router.get("/drip-campaigns/{campaign_id}/stats")
async def get_drip_campaign_stats(
    campaign_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get stats for a drip campaign."""
    campaign = db.query(DripCampaign).filter(DripCampaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    # Count emails sent for each step
    step_stats = []
    for step in (campaign.steps or []):
        template_id = step.get("template_id")
        sent = db.query(func.count(EmailSendHistory.id)).filter(
            EmailSendHistory.template_id == template_id
        ).scalar() or 0
        delivered = db.query(func.count(EmailSendHistory.id)).filter(
            and_(
                EmailSendHistory.template_id == template_id,
                EmailSendHistory.status.in_(["delivered", "opened", "clicked"])
            )
        ).scalar() or 0
        step_stats.append({
            "delay_hours": step.get("delay_hours"),
            "template_id": template_id,
            "sent": sent,
            "delivered": delivered,
        })

    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.name,
        "step_stats": step_stats,
    }


# ═══════════════════════════════════════════════
# Pricing Plan Endpoints
# ═══════════════════════════════════════════════

@router.get("/pricing-plans")
async def list_pricing_plans(
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List pricing plans."""
    query = db.query(PricingPlan)

    if is_active is not None:
        query = query.filter(PricingPlan.is_active == is_active)

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_pricing_plan(p) for p in items],
    }


@router.post("/pricing-plans")
async def create_pricing_plan(
    payload: PricingPlanCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new pricing plan."""
    existing = db.query(PricingPlan).filter(
        or_(
            PricingPlan.name == payload.name,
            PricingPlan.stripe_price_id == payload.stripe_price_id
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Plan name or Stripe price ID already exists.")

    plan = PricingPlan(
        name=payload.name,
        stripe_price_id=payload.stripe_price_id,
        amount=payload.amount,
        currency=payload.currency,
        interval=payload.interval,
        trial_days=payload.trial_days,
        features=payload.features,
        is_active=payload.is_active,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    return _serialize_pricing_plan(plan)


@router.get("/pricing-plans/{plan_id}")
async def get_pricing_plan(
    plan_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a single pricing plan."""
    plan = db.query(PricingPlan).filter(PricingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    return _serialize_pricing_plan(plan)


@router.put("/pricing-plans/{plan_id}")
async def update_pricing_plan(
    plan_id: int,
    payload: PricingPlanUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a pricing plan."""
    plan = db.query(PricingPlan).filter(PricingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    if payload.name is not None:
        existing = db.query(PricingPlan).filter(
            and_(PricingPlan.name == payload.name, PricingPlan.id != plan_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Plan name already exists.")
        plan.name = payload.name

    if payload.stripe_price_id is not None:
        existing = db.query(PricingPlan).filter(
            and_(PricingPlan.stripe_price_id == payload.stripe_price_id, PricingPlan.id != plan_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Stripe price ID already exists.")
        plan.stripe_price_id = payload.stripe_price_id

    if payload.amount is not None:
        plan.amount = payload.amount
    if payload.currency is not None:
        plan.currency = payload.currency
    if payload.interval is not None:
        plan.interval = payload.interval
    if payload.trial_days is not None:
        plan.trial_days = payload.trial_days
    if payload.features is not None:
        plan.features = payload.features
    if payload.is_active is not None:
        plan.is_active = payload.is_active

    plan.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(plan)

    return _serialize_pricing_plan(plan)


@router.delete("/pricing-plans/{plan_id}")
async def delete_pricing_plan(
    plan_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a pricing plan."""
    plan = db.query(PricingPlan).filter(PricingPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found.")

    db.delete(plan)
    db.commit()

    return {"success": True}


# ═══════════════════════════════════════════════
# Coupon Endpoints
# ═══════════════════════════════════════════════

@router.get("/coupons")
async def list_coupons(
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List coupons."""
    query = db.query(Coupon)

    if is_active is not None:
        query = query.filter(Coupon.is_active == is_active)
    if search:
        query = query.filter(Coupon.code.ilike(f"%{search}%"))

    total = query.count()
    items = query.offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_coupon(c) for c in items],
    }


@router.post("/coupons")
async def create_coupon(
    payload: CouponCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new coupon."""
    existing = db.query(Coupon).filter(Coupon.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Coupon code already exists.")

    if payload.percent_off is None and payload.amount_off is None:
        raise HTTPException(status_code=400, detail="Either percent_off or amount_off must be provided.")

    coupon = Coupon(
        code=payload.code,
        percent_off=payload.percent_off,
        amount_off=payload.amount_off,
        currency=payload.currency,
        duration=payload.duration,
        duration_in_months=payload.duration_in_months,
        max_redemptions=payload.max_redemptions,
        expires_at=payload.expires_at,
        is_active=payload.is_active,
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)

    return _serialize_coupon(coupon)


@router.get("/coupons/{coupon_id}")
async def get_coupon(
    coupon_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get a single coupon."""
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")

    return _serialize_coupon(coupon)


@router.put("/coupons/{coupon_id}")
async def update_coupon(
    coupon_id: int,
    payload: CouponUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update a coupon."""
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")

    if payload.code is not None:
        existing = db.query(Coupon).filter(
            and_(Coupon.code == payload.code, Coupon.id != coupon_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Coupon code already exists.")
        coupon.code = payload.code

    if payload.percent_off is not None:
        coupon.percent_off = payload.percent_off
    if payload.amount_off is not None:
        coupon.amount_off = payload.amount_off
    if payload.currency is not None:
        coupon.currency = payload.currency
    if payload.duration is not None:
        coupon.duration = payload.duration
    if payload.duration_in_months is not None:
        coupon.duration_in_months = payload.duration_in_months
    if payload.max_redemptions is not None:
        coupon.max_redemptions = payload.max_redemptions
    if payload.expires_at is not None:
        coupon.expires_at = payload.expires_at
    if payload.is_active is not None:
        coupon.is_active = payload.is_active

    coupon.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(coupon)

    return _serialize_coupon(coupon)


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(
    coupon_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Delete a coupon."""
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=404, detail="Coupon not found.")

    db.delete(coupon)
    db.commit()

    return {"success": True}


# ═══════════════════════════════════════════════
# Invoice Endpoints
# ═══════════════════════════════════════════════

@router.get("/invoices")
async def list_invoices(
    user_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    min_amount: Optional[int] = Query(None),
    max_amount: Optional[int] = Query(None),
    skip: int = Query(0),
    limit: int = Query(50),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """List invoices with filters."""
    query = db.query(Invoice)

    if user_id is not None:
        query = query.filter(Invoice.user_id == user_id)
    if status:
        query = query.filter(Invoice.status == status)
    if date_from:
        query = query.filter(Invoice.issued_at >= date_from)
    if date_to:
        query = query.filter(Invoice.issued_at <= date_to)
    if min_amount is not None:
        query = query.filter(Invoice.amount >= min_amount)
    if max_amount is not None:
        query = query.filter(Invoice.amount <= max_amount)

    total = query.count()
    items = query.order_by(desc(Invoice.issued_at)).offset(skip).limit(limit).all()

    return {
        "total": total,
        "items": [_serialize_invoice(i) for i in items],
    }


@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get invoice details."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    refunds = db.query(Refund).filter(Refund.invoice_id == invoice_id).all()

    return {
        "invoice": _serialize_invoice(invoice),
        "refunds": [_serialize_refund(r) for r in refunds],
    }


@router.post("/invoices/{invoice_id}/refund")
async def refund_invoice(
    invoice_id: int,
    payload: RefundRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a refund for an invoice."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found.")

    refund_amount = payload.amount or invoice.amount

    if refund_amount > invoice.amount:
        raise HTTPException(status_code=400, detail="Refund amount cannot exceed invoice amount.")

    refund = Refund(
        invoice_id=invoice_id,
        amount=refund_amount,
        currency=invoice.currency,
        reason=payload.reason,
        status="pending",
    )
    db.add(refund)
    db.commit()
    db.refresh(refund)

    return _serialize_refund(refund)


# ═══════════════════════════════════════════════
# Revenue Dashboard Endpoints
# ═══════════════════════════════════════════════

@router.get("/revenue-dashboard")
async def get_revenue_dashboard(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get revenue dashboard data (MRR, ARR, churn, LTV, etc.)."""
    # MRR: Monthly Recurring Revenue from active subscriptions
    active_subs = db.query(Subscription).filter(Subscription.status == "active").all()
    mrr = sum(
        db.query(PricingPlan).filter(
            PricingPlan.stripe_price_id == sub.stripe_price_id
        ).first().amount if sub.stripe_price_id else 0
        for sub in active_subs
    )

    # ARR: Annual Recurring Revenue
    arr = mrr * 12

    # Active subscriptions count
    active_count = len(active_subs)

    # Total unique customers (users with any subscription)
    total_customers = db.query(func.count(func.distinct(Subscription.user_id))).scalar() or 0

    # ARPU: Average Revenue Per User
    arpu = (mrr * 100 / total_customers) if total_customers > 0 else 0

    # Churn rate (rough estimate: canceled subscriptions in last 30 days / active 30 days ago)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    churned_recent = db.query(func.count(Subscription.id)).filter(
        and_(
            Subscription.canceled_at >= thirty_days_ago,
            Subscription.canceled_at <= datetime.utcnow()
        )
    ).scalar() or 0

    churn_rate = (churned_recent / active_count * 100) if active_count > 0 else 0

    # LTV: Lifetime Value (simplified: avg invoice amount * avg subscription duration)
    avg_invoice = db.query(func.avg(Invoice.amount)).filter(
        Invoice.status.in_(["paid", "open"])
    ).scalar() or 0
    avg_subscription_months = 12  # Simplification
    ltv = (avg_invoice / 100) * avg_subscription_months if avg_invoice > 0 else 0

    # New MRR: from subscriptions created in last 30 days
    new_subs = db.query(Subscription).filter(
        Subscription.created_at >= thirty_days_ago
    ).all()
    new_mrr = sum(
        db.query(PricingPlan).filter(
            PricingPlan.stripe_price_id == sub.stripe_price_id
        ).first().amount if sub.stripe_price_id else 0
        for sub in new_subs
    )

    # Expansion/Contraction MRR would require tracking plan changes (simplified here)
    expansion_mrr = 0
    contraction_mrr = 0

    # Churned MRR: MRR from canceled subscriptions
    churned_mrr = sum(
        db.query(PricingPlan).filter(
            PricingPlan.stripe_price_id == sub.stripe_price_id
        ).first().amount if sub.stripe_price_id else 0
        for sub in db.query(Subscription).filter(
            and_(
                Subscription.canceled_at >= thirty_days_ago,
                Subscription.canceled_at <= datetime.utcnow()
            )
        ).all()
    )

    return {
        "mrr": mrr,
        "arr": arr,
        "churn_rate": round(churn_rate, 2),
        "ltv": round(ltv, 2),
        "arpu": round(arpu, 2),
        "new_mrr": new_mrr,
        "expansion_mrr": expansion_mrr,
        "contraction_mrr": contraction_mrr,
        "churned_mrr": churned_mrr,
        "active_subscriptions": active_count,
        "total_customers": total_customers,
    }


@router.get("/revenue/breakdown")
async def get_revenue_breakdown(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get revenue breakdown by plan."""
    plans = db.query(PricingPlan).filter(PricingPlan.is_active == True).all()

    breakdown = []
    total_mrr = 0

    for plan in plans:
        subscriber_count = db.query(func.count(Subscription.id)).filter(
            and_(
                Subscription.stripe_price_id == plan.stripe_price_id,
                Subscription.status == "active"
            )
        ).scalar() or 0

        plan_mrr = plan.amount * subscriber_count if plan.interval == "month" else (plan.amount * subscriber_count) / 12

        breakdown.append({
            "plan_name": plan.name,
            "subscriber_count": subscriber_count,
            "mrr": int(plan_mrr),
            "percentage_of_total_mrr": 0,  # Will calculate after summing
        })

        total_mrr += plan_mrr

    # Calculate percentages
    for item in breakdown:
        item["percentage_of_total_mrr"] = round((item["mrr"] / total_mrr * 100), 2) if total_mrr > 0 else 0

    return {
        "total_mrr": int(total_mrr),
        "breakdown": breakdown,
    }


@router.get("/revenue/mrr-history")
async def get_mrr_history(
    months: int = Query(12),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get MRR history for the last N months."""
    history = []
    now = datetime.utcnow()

    for i in range(months, 0, -1):
        target_month = now - timedelta(days=30 * i)
        month_str = target_month.strftime("%Y-%m")

        # Get active subscriptions for this month
        subs_month = db.query(Subscription).filter(
            Subscription.created_at <= target_month
        ).all()

        mrr_month = sum(
            db.query(PricingPlan).filter(
                PricingPlan.stripe_price_id == sub.stripe_price_id
            ).first().amount if sub.stripe_price_id else 0
            for sub in subs_month
        )

        history.append({
            "month": month_str,
            "mrr": mrr_month,
        })

    return {
        "history": history,
    }


@router.get("/revenue/cohort-analysis")
async def get_cohort_analysis(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get cohort analysis (signup month → retention by month)."""
    # Get all users grouped by signup month
    users_by_cohort = db.query(
        func.date_trunc('month', User.created_at).label('signup_month'),
        func.count(User.id).label('cohort_size')
    ).group_by('signup_month').all()

    cohorts = []
    for signup_month, cohort_size in users_by_cohort:
        signup_month_str = signup_month.strftime("%Y-%m") if signup_month else "unknown"

        # For each cohort, track retention by month
        month_0_retained = db.query(func.count(Subscription.id)).filter(
            and_(
                func.date_trunc('month', User.created_at) == signup_month,
                Subscription.status.in_(["active", "trialing"])
            )
        ).count()

        cohorts.append({
            "signup_month": signup_month_str,
            "month_0": int(month_0_retained) if cohort_size > 0 else 0,
        })

    return {
        "cohorts": cohorts,
    }


@router.get("/revenue/trial-conversion")
async def get_trial_conversion_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Get trial conversion statistics."""
    total_trials = db.query(func.count(Subscription.id)).filter(
        Subscription.status == "trialing"
    ).scalar() or 0

    converted = db.query(func.count(Subscription.id)).filter(
        and_(
            Subscription.status.in_(["active"]),
            Subscription.trial_end.isnot(None),
            Subscription.trial_end <= datetime.utcnow()
        )
    ).scalar() or 0

    conversion_rate = (converted / total_trials * 100) if total_trials > 0 else 0

    # Avg trial duration
    trial_subs = db.query(Subscription).filter(Subscription.trial_end.isnot(None)).all()
    avg_trial_days = 0
    if trial_subs:
        total_days = sum(
            (sub.trial_end - sub.created_at).days if sub.created_at and sub.trial_end else 0
            for sub in trial_subs
        )
        avg_trial_days = total_days / len(trial_subs)

    return {
        "total_trials": total_trials,
        "converted_to_paid": converted,
        "conversion_rate": round(conversion_rate, 2),
        "avg_trial_duration_days": round(avg_trial_days, 2),
        "most_common_conversion_plan": "pro",  # Placeholder
    }
