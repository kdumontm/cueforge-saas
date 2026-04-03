from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: str
    password: str


class UserLogin(BaseModel):
    """Schema for user login. 'identifier' accepts email OR username."""

    identifier: str
    password: str


class UserResponse(BaseModel):
    """Schema for user response."""

    id: int
    email: str
    plan: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """Schema for JWT token response."""

    access_token: str
    token_type: str = "bearer"
