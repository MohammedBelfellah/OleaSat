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
    start_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    max_cloud_pct: float = Field(default=20, ge=0, le=100)


class AnalyzeResponse(BaseModel):
    farm_id: str
    ndvi_current: float
    ndvi_delta: float
    ndmi_current: float
    cloud_pct: float
    date_used: str
    images_used: int
    source: str
    note: Optional[str] = None
    window_start: str
    window_end: str
    et0_week: float
    rain_week: float
    liters_per_tree: float
    total_m3: float
    recommendation: str
    explanation: str


class SatelliteIndicesRequest(BaseModel):
    polygon: List[List[float]]
    start_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    max_cloud_pct: float = Field(default=20, ge=0, le=100)


class SatelliteIndicesResponse(BaseModel):
    ndvi_current: float
    ndvi_delta: float
    ndmi_current: float
    cloud_pct: float
    date_used: str
    images_used: int
    source: str
    note: Optional[str] = None
    window_start: str
    window_end: str
