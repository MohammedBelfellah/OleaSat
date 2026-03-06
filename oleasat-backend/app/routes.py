from fastapi import APIRouter

from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    RegisterRequest,
    RegisterResponse,
    SatelliteIndicesRequest,
    SatelliteIndicesResponse,
)
from app.services import get_satellite_features, run_pipeline

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/register", response_model=RegisterResponse)
def register_farm(payload: RegisterRequest) -> RegisterResponse:
    farm_id = f"farm-{abs(hash(payload.farmer_name + payload.phone)) % 100000}"
    return RegisterResponse(farm_id=farm_id, message="Farm registered successfully")


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_farm(payload: AnalyzeRequest) -> AnalyzeResponse:
    result = run_pipeline(
        farm_id=payload.farm_id,
        polygon=payload.polygon,
        tree_count=payload.tree_count,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_cloud_pct=payload.max_cloud_pct,
    )
    return AnalyzeResponse(**result)


@router.post("/satellite/indices", response_model=SatelliteIndicesResponse)
def satellite_indices(payload: SatelliteIndicesRequest) -> SatelliteIndicesResponse:
    result = get_satellite_features(
        polygon=payload.polygon,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_cloud_pct=payload.max_cloud_pct,
    )
    return SatelliteIndicesResponse(**result)
