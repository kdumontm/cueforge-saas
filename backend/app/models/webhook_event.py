"""
WebhookEvent — table d'idempotence pour les webhooks Stripe.

Empêche le traitement en double d'un même événement Stripe.
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, Index

from app.database import Base


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String(255), nullable=False, unique=True)
    event_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_webhook_events_event_id", "event_id", unique=True),
    )
