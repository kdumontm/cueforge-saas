from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.database import Base

class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # nullable for anonymous
    type = Column(String, nullable=False)  # bug, feature, other
    message = Column(Text, nullable=False)
    rating = Column(String, nullable=True)  # up, down, null
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
