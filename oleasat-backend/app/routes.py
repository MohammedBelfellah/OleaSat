from fastapi import APIRouter

from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.services import run_pipeline

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
    )
    return AnalyzeResponse(**result)
