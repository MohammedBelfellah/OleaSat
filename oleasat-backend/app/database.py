"""Database engine and session factory (Spec §4)."""

from sqlalchemy import text
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def apply_runtime_migrations() -> None:
    """Apply lightweight non-breaking SQLite migrations for existing DBs.

    This keeps hackathon setup simple without Alembic while allowing schema
    evolution for newly added columns.
    """
    if "sqlite" not in settings.database_url:
        return

    with engine.begin() as conn:
        # farmer_profiles.irrigation_efficiency
        farmer_columns = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info('farmer_profiles')")).fetchall()
        }
        if "irrigation_efficiency" not in farmer_columns:
            conn.execute(text("ALTER TABLE farmer_profiles ADD COLUMN irrigation_efficiency FLOAT DEFAULT 0.9"))
            conn.execute(text("UPDATE farmer_profiles SET irrigation_efficiency = 0.9 WHERE irrigation_efficiency IS NULL"))

        # alert_records NDVI/NDMI history + efficiency snapshot
        alert_columns = {
            row[1]
            for row in conn.execute(text("PRAGMA table_info('alert_records')")).fetchall()
        }

        if "ndvi_current" not in alert_columns:
            conn.execute(text("ALTER TABLE alert_records ADD COLUMN ndvi_current FLOAT"))
        if "ndvi_delta" not in alert_columns:
            conn.execute(text("ALTER TABLE alert_records ADD COLUMN ndvi_delta FLOAT"))
        if "ndmi_current" not in alert_columns:
            conn.execute(text("ALTER TABLE alert_records ADD COLUMN ndmi_current FLOAT"))
        if "irrigation_efficiency" not in alert_columns:
            conn.execute(text("ALTER TABLE alert_records ADD COLUMN irrigation_efficiency FLOAT"))


def get_db():
    """FastAPI dependency — yields a DB session and auto-closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
