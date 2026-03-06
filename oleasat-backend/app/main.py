import os

from fastapi import FastAPI

from app.database import engine
from app.models import Base
from app.routes import router

# Ensure data directory exists for SQLite
os.makedirs("data", exist_ok=True)

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="OleaSat Backend", version="0.1.0")
app.include_router(router, prefix="/api/v1")
