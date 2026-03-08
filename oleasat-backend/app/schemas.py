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


class FeedbackType(str, Enum):
    WORKED = "WORKED"
    TOO_MUCH = "TOO_MUCH"
    TOO_LITTLE = "TOO_LITTLE"
    NOT_APPLIED = "NOT_APPLIED"


class HealthResponse(BaseModel):
    status: str
    db: str = "ok"


# ---------- Auth ----------

class AuthRegisterRequest(BaseModel):
    """Create a new web-app user account."""
    email: str = Field(min_length=5, description="User email")
    password: str = Field(min_length=6, description="Plain-text password (hashed server-side)")
    full_name: Optional[str] = Field(default=None, description="Display name")


class AuthLoginRequest(BaseModel):
    """Login with email + password."""
    email: str
    password: str


class AuthTokenResponse(BaseModel):
    """JWT access token returned after login or register."""
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    full_name: Optional[str] = None
    role: str = "FARMER"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[str] = None


class RegisterRequest(BaseModel):
    farmer_name: str = Field(min_length=2)
    phone: str = Field(min_length=6)
    crop_type: str = "olive"
    tree_age: TreeAge = Field(default=TreeAge.ADULT, description="YOUNG (< 5 years) or ADULT")
    soil_type: SoilType = Field(default=SoilType.MEDIUM, description="SANDY, MEDIUM, or CLAY")
    tree_count: int = Field(default=100, ge=1)
    spacing_m2: float = Field(default=100.0, gt=0, description="Surface area per tree in m²")
    irrigation_efficiency: float = Field(
        default=0.9,
        ge=0.5,
        le=1.0,
        description="Irrigation system efficiency (1.0 ideal, 0.9 typical drip)",
    )
    polygon: List[List[float]] = Field(description="List of [lon, lat] points")


class RegisterResponse(BaseModel):
    farm_id: str
    message: str


class TelegramLinkResponse(BaseModel):
    farmer_id: str
    telegram_link: str
    linked: bool


class StatusMessageResponse(BaseModel):
    status: str
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
    irrigation_efficiency: float
    litres_per_tree_net: float
    total_litres_net: float
    litres_per_tree: float
    total_litres: float
    total_m3: float
    stress_mode: bool
    survival_litres: Optional[float] = None
    # Recommendation
    recommendation: str
    explanation: str
    # Cache metadata
    from_cache: bool = False
    cached_at: Optional[str] = None


class AnalyzeRequest(BaseModel):
    farm_id: str
    polygon: List[List[float]]
    tree_count: int = Field(default=100, ge=1)
    tree_age: TreeAge = Field(default=TreeAge.ADULT, description="YOUNG (< 5 years) or ADULT")
    soil_type: SoilType = Field(default=SoilType.MEDIUM, description="SANDY, MEDIUM, or CLAY")
    spacing_m2: float = Field(default=100.0, gt=0, description="Surface area per tree in m²")
    irrigation_efficiency: float = Field(
        default=0.9,
        ge=0.5,
        le=1.0,
        description="Irrigation system efficiency (1.0 ideal, 0.9 typical drip)",
    )
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
    irrigation_efficiency: float
    litres_per_tree_net: float
    total_litres_net: float
    litres_per_tree: float
    total_litres: float
    total_m3: float
    stress_mode: bool
    survival_litres: Optional[float] = None
    # Recommendation
    recommendation: str
    explanation: str
    # Cache metadata
    from_cache: bool = False
    cached_at: Optional[str] = None


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


class WaterStressMapCell(BaseModel):
    id: str
    polygon: List[List[float]]
    centroid: List[float]
    ndmi: float
    ndvi: float
    stress_score: float = Field(ge=0, le=1)
    stress_level: str
    water_priority: str
    irrigation_factor: float


class WaterStressSummary(BaseModel):
    cells_total: int
    cells_in_polygon: int
    high_stress_cells: int
    medium_stress_cells: int
    low_stress_cells: int
    avg_ndmi: float
    avg_ndvi: float
    avg_stress_score: float


class WaterStressMapResponse(BaseModel):
    farm_id: str
    source: str
    note: Optional[str] = None
    window_start: str
    window_end: str
    max_cloud_pct: float
    grid_width: int
    grid_height: int
    legend: Dict[str, str]
    summary: WaterStressSummary
    cells: List[WaterStressMapCell]
    from_cache: bool = False
    cached_at: Optional[str] = None


class LatestAnalysisResponse(BaseModel):
    farm_id: str
    generated_at: str
    analysis: CalculateResponse


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
    irrigation_efficiency: Optional[float] = None
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


# ---------- Admin Dashboard ----------

class FarmListItem(BaseModel):
    """Compact farm view for list endpoints."""
    id: str
    farmer_name: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    tree_age: Optional[str] = None
    soil_type: Optional[str] = None
    tree_count: Optional[int] = None
    spacing_m2: Optional[float] = None
    irrigation_efficiency: Optional[float] = None
    telegram_linked: bool = False
    created_at: Optional[str] = None
    last_alert_at: Optional[str] = None


class FarmDetailResponse(BaseModel):
    """Full farm detail with last calculation."""
    farm: FarmListItem
    last_alert: Optional[Dict[str, Any]] = None


class AdminDashboardResponse(BaseModel):
    """Admin overview with global insights."""
    total_farmers: int
    active_farmers: int
    total_alerts: int
    alerts_this_week: int
    farmers_with_telegram: int
    avg_litres_per_tree: float
    total_water_m3: float
    stress_alerts_count: int
    urgent_farms: List[FarmListItem]
    recent_alerts: List[Dict[str, Any]]


class FeedbackCreateRequest(BaseModel):
    farmer_id: str
    alert_id: Optional[str] = None
    feedback_type: FeedbackType
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=500)


class FeedbackOut(BaseModel):
    id: str
    farmer_id: str
    alert_id: Optional[str] = None
    feedback_type: FeedbackType
    rating: Optional[int] = None
    comment: Optional[str] = None
    created_at: str


class FeedbackSummaryResponse(BaseModel):
    farmer_id: str
    total_feedback: int
    worked_count: int
    too_much_count: int
    too_little_count: int
    not_applied_count: int
    avg_rating: float
    feedback: List[FeedbackOut]
