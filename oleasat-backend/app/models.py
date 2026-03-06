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

    # Preferences
    language = Column(
        Enum("FR", "AR", name="language_enum"),
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

    # Delivery
    delivery_status = Column(
        Enum("SENT", "FAILED", "RETRIED", name="delivery_status_enum"),
        nullable=False,
        default="SENT",
    )

    # Relationship
    farmer = relationship("FarmerProfile", back_populates="alerts")

    def __repr__(self) -> str:
        return f"<AlertRecord id={self.id} farmer={self.farmer_id} litres={self.litres_per_tree}>"
