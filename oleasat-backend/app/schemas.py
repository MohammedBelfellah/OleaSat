from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TreeAge(str, Enum):
    YOUNG = "YOUNG"
    ADULT = "ADULT"


class SoilType(str, Enum):
    SANDY = "SANDY"
    MEDIUM = "MEDIUM"
    CLAY = "CLAY"


class HealthResponse(BaseModel):
    status: str
    db: str = "ok"


class RegisterRequest(BaseModel):
    farmer_name: str = Field(min_length=2)
    phone: str = Field(min_length=6)
    crop_type: str = "olive"
    tree_age: TreeAge = Field(default=TreeAge.ADULT, description="YOUNG (< 5 years) or ADULT")
    soil_type: SoilType = Field(default=SoilType.MEDIUM, description="SANDY, MEDIUM, or CLAY")
    tree_count: int = Field(default=100, ge=1)
    spacing_m2: float = Field(default=100.0, gt=0, description="Surface area per tree in m²")
    polygon: List[List[float]] = Field(description="List of [lon, lat] points")


class RegisterResponse(BaseModel):
    farm_id: str
    message: str


class CalculateRequest(BaseModel):
    """Spec §5.2 — calculate by farmer_id (profile looked up from DB)."""
    farmer_id: str


class CalculateResponse(BaseModel):
    farm_id: str
    # Satellite
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
    # FAO-56
    et0_week: float
    rain_week: float
    p_eff: float
    kc_applied: float
    ir_mm: float
    phase_label: str
    is_critical_phase: bool
    soil_factor: float
    litres_per_tree: float
    total_litres: float
    total_m3: float
    stress_mode: bool
    survival_litres: Optional[float] = None
    # Recommendation
    recommendation: str
    explanation: str


class AnalyzeRequest(BaseModel):
    farm_id: str
    polygon: List[List[float]]
    tree_count: int = Field(default=100, ge=1)
    tree_age: TreeAge = Field(default=TreeAge.ADULT, description="YOUNG (< 5 years) or ADULT")
    soil_type: SoilType = Field(default=SoilType.MEDIUM, description="SANDY, MEDIUM, or CLAY")
    spacing_m2: float = Field(default=100.0, gt=0, description="Surface area per tree in m²")
    start_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    end_date: Optional[str] = Field(default=None, description="YYYY-MM-DD")
    max_cloud_pct: float = Field(default=20, ge=0, le=100)


class AnalyzeResponse(BaseModel):
    farm_id: str
    # Satellite
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
    # FAO-56
    et0_week: float
    rain_week: float
    p_eff: float
    kc_applied: float
    ir_mm: float
    phase_label: str
    is_critical_phase: bool
    soil_factor: float
    litres_per_tree: float
    total_litres: float
    total_m3: float
    stress_mode: bool
    survival_litres: Optional[float] = None
    # Recommendation
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


# ---------- Metrics (Spec §5.3) ----------

class FarmerOut(BaseModel):
    id: str
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    tree_age: Optional[str] = None
    soil_type: Optional[str] = None
    tree_count: Optional[int] = None
    spacing_m2: Optional[float] = None
    created_at: Optional[str] = None
    last_alert_at: Optional[str] = None


class MetricsSummaryResponse(BaseModel):
    """Spec §5.3 — GET /metrics/summary."""
    farmers_active: int
    alerts_sent_this_week: int
    avg_litres_per_tree: float


class MetricsFarmerResponse(BaseModel):
    """Spec §5.3 — GET /metrics/farmer/{id}."""
    farmer: FarmerOut
    alerts: List[Dict[str, Any]]
