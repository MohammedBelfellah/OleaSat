from typing import List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class RegisterRequest(BaseModel):
    farmer_name: str = Field(min_length=2)
    phone: str = Field(min_length=6)
    crop_type: str = "olive"
    soil_type: Optional[str] = None
    polygon: List[List[float]] = Field(description="List of [lon, lat] points")


class RegisterResponse(BaseModel):
    farm_id: str
    message: str


class AnalyzeRequest(BaseModel):
    farm_id: str
    polygon: List[List[float]]
    tree_count: int = Field(default=100, ge=1)


class AnalyzeResponse(BaseModel):
    farm_id: str
    ndvi_current: float
    ndvi_delta: float
    et0_week: float
    rain_week: float
    liters_per_tree: float
    total_m3: float
    recommendation: str
    explanation: str
