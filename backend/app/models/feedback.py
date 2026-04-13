from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Index
from app.database import Base

class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable for anonymous
    type = Column(String, nullable=False)  # bug, feature, other
    message = Column(Text, nullable=False)
    rating = Column(String, nullable=True)  # up, down, null
    status = Column(String, default="new", nullable=False)  # new, read, in_progress, done, rejected
    admin_response = Column(Text, nullable=True)  # Admin's response to the feedback
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index('ix_feedback_created_at', 'created_at'),
        Index('ix_feedback_status', 'status'),
    )
