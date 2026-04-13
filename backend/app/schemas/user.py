from datetime import datetime
from typing import Optional
import re

from pydantic import BaseModel, ConfigDict, field_validator


class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: str
    password: str

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        """
        Validate password strength:
        - Minimum 8 characters
        - At least one uppercase letter
        - At least one digit
        """
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


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
