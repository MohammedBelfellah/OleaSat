"""SQLAlchemy ORM models (Spec §4)."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    Integer,
    String,
    Text,
    ForeignKey,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    """Web app user account (admin / farmer)."""

    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    role = Column(
        Enum("ADMIN", "FARMER", name="user_role_enum"),
        nullable=False,
        default="FARMER",
    )
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"


class FarmerProfile(Base):
    """Farmer profile — stores onboarding data and orchard parameters (§4.1)."""

    __tablename__ = "farmer_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    telegram_chat_id = Column(String(64), unique=True, nullable=True, index=True)
    state = Column(
        Enum(
            "UNREGISTERED",
            "AWAITING_LOCATION",
            "AWAITING_AGE",
            "AWAITING_SOIL",
            "AWAITING_TREE_COUNT",
            "ACTIVE",
            name="farmer_state",
        ),
        nullable=False,
        default="UNREGISTERED",
    )

    # Owner (web-app user who registered this farm)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)

    # Parcel location
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    region_label = Column(String(100), nullable=True)

    # Polygon (stored as JSON text for SQLite compatibility)
    polygon_json = Column(Text, nullable=True)

    # Orchard parameters
    tree_age = Column(
        Enum("YOUNG", "ADULT", name="tree_age_enum"),
        nullable=True,
    )
    soil_type = Column(
        Enum("SANDY", "MEDIUM", "CLAY", name="soil_type_enum"),
        nullable=True,
    )
    tree_count = Column(Integer, nullable=True)
    spacing_m2 = Column(Float, nullable=True, default=100.0)
    irrigation_efficiency = Column(Float, nullable=False, default=0.90)

    # Preferences
    language = Column(
        Enum("FR", "AR", "DARIJA", name="language_enum"),
        nullable=False,
        default="FR",
    )

    # API registration fields
    farmer_name = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    crop_type = Column(String(50), nullable=True, default="olive")

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_alert_at = Column(DateTime, nullable=True)
    alert_failed = Column(Boolean, nullable=False, default=False)

    # Relationships
    alerts = relationship("AlertRecord", back_populates="farmer", cascade="all, delete-orphan")
    feedback_entries = relationship("FarmerFeedback", back_populates="farmer", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<FarmerProfile id={self.id} state={self.state}>"


class AlertRecord(Base):
    """Append-only alert history — one row per weekly recommendation sent (§4.2)."""

    __tablename__ = "alert_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    farmer_id = Column(String(36), ForeignKey("farmer_profiles.id"), nullable=False, index=True)

    sent_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    # Calculation inputs
    et0_weekly_mm = Column(Float, nullable=False)
    rain_weekly_mm = Column(Float, nullable=False)
    kc_applied = Column(Float, nullable=False)

    # Results
    litres_per_tree = Column(Float, nullable=False)
    total_litres = Column(Float, nullable=False)
    stress_mode = Column(Boolean, nullable=False, default=False)
    ndvi_current = Column(Float, nullable=True)
    ndvi_delta = Column(Float, nullable=True)
    ndmi_current = Column(Float, nullable=True)
    irrigation_efficiency = Column(Float, nullable=True)

    # Delivery
    delivery_status = Column(
        Enum("SENT", "FAILED", "RETRIED", name="delivery_status_enum"),
        nullable=False,
        default="SENT",
    )

    # Relationship
    farmer = relationship("FarmerProfile", back_populates="alerts")
    feedback_entries = relationship("FarmerFeedback", back_populates="alert")

    def __repr__(self) -> str:
        return f"<AlertRecord id={self.id} farmer={self.farmer_id} litres={self.litres_per_tree}>"


class FarmerFeedback(Base):
    """Farmer feedback loop entries for improving recommendation quality."""

    __tablename__ = "farmer_feedback"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    farmer_id = Column(String(36), ForeignKey("farmer_profiles.id"), nullable=False, index=True)
    alert_id = Column(String(36), ForeignKey("alert_records.id"), nullable=True, index=True)

    feedback_type = Column(
        Enum("WORKED", "TOO_MUCH", "TOO_LITTLE", "NOT_APPLIED", name="feedback_type_enum"),
        nullable=False,
    )
    rating = Column(Integer, nullable=True)
    comment = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    farmer = relationship("FarmerProfile", back_populates="feedback_entries")
    alert = relationship("AlertRecord", back_populates="feedback_entries")

    def __repr__(self) -> str:
        return f"<FarmerFeedback id={self.id} farmer={self.farmer_id} type={self.feedback_type}>"
