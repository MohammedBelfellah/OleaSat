import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AlertRecord, FarmerProfile
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CalculateRequest,
    CalculateResponse,
    FarmerOut,
    HealthResponse,
    MetricsFarmerResponse,
    MetricsSummaryResponse,
    RegisterRequest,
    RegisterResponse,
    SatelliteIndicesRequest,
    SatelliteIndicesResponse,
)
from app.services import get_satellite_features, run_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------- Health ----------

@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    """Health check — verifies DB connectivity (Spec §5.3)."""
    db_status = "ok"
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
    return HealthResponse(status="ok", db=db_status)


# ---------- Register ----------

@router.post("/register", response_model=RegisterResponse)
def register_farm(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> RegisterResponse:
    """Register a new farm — persists to DB (Spec §4.1)."""
    polygon_coords = [[p[0], p[1]] for p in payload.polygon]

    # Compute centroid for lat/lon
    lons = [p[0] for p in polygon_coords]
    lats = [p[1] for p in polygon_coords]
    lat = sum(lats) / len(lats)
    lon = sum(lons) / len(lons)

    farmer = FarmerProfile(
        state="ACTIVE",
        farmer_name=payload.farmer_name,
        phone=payload.phone,
        crop_type=payload.crop_type,
        latitude=round(lat, 4),
        longitude=round(lon, 4),
        polygon_json=json.dumps(polygon_coords),
        tree_age=payload.tree_age.value,
        soil_type=payload.soil_type.value,
        tree_count=payload.tree_count,
        spacing_m2=payload.spacing_m2,
    )
    db.add(farmer)
    db.commit()
    db.refresh(farmer)

    logger.info("Registered farmer %s at (%.4f, %.4f)", farmer.id, lat, lon)
    return RegisterResponse(farm_id=farmer.id, message="Farm registered successfully")


# ---------- Calculate (by farmer_id) ----------

@router.post("/calculate", response_model=CalculateResponse)
def calculate(
    payload: CalculateRequest,
    db: Session = Depends(get_db),
) -> CalculateResponse:
    """Calculate irrigation for a registered farmer (Spec §5.2)."""
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == payload.farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    # Check profile completeness
    missing = []
    if farmer.polygon_json is None:
        missing.append("polygon")
    if farmer.tree_age is None:
        missing.append("tree_age")
    if farmer.soil_type is None:
        missing.append("soil_type")
    if farmer.tree_count is None:
        missing.append("tree_count")
    if missing:
        raise HTTPException(status_code=422, detail={"error": "incomplete_profile", "missing_fields": missing})

    polygon = json.loads(farmer.polygon_json)

    result = run_pipeline(
        farm_id=farmer.id,
        polygon=polygon,
        tree_count=farmer.tree_count,
        tree_age=farmer.tree_age,
        soil_type=farmer.soil_type,
        spacing_m2=farmer.spacing_m2 or 100.0,
    )

    # Log alert record
    alert = AlertRecord(
        farmer_id=farmer.id,
        et0_weekly_mm=result["et0_week"],
        rain_weekly_mm=result["rain_week"],
        kc_applied=result["kc_applied"],
        litres_per_tree=result["litres_per_tree"],
        total_litres=result["total_litres"],
        stress_mode=result["stress_mode"],
        delivery_status="SENT",
    )
    db.add(alert)
    farmer.last_alert_at = datetime.now(timezone.utc)
    db.commit()

    return CalculateResponse(**result)


# ---------- Analyze (direct, no DB lookup) ----------

@router.post("/analyze", response_model=AnalyzeResponse)
def analyze_farm(payload: AnalyzeRequest) -> AnalyzeResponse:
    """Run full pipeline with explicit parameters (no DB lookup needed)."""
    result = run_pipeline(
        farm_id=payload.farm_id,
        polygon=payload.polygon,
        tree_count=payload.tree_count,
        tree_age=payload.tree_age.value,
        soil_type=payload.soil_type.value,
        spacing_m2=payload.spacing_m2,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_cloud_pct=payload.max_cloud_pct,
    )
    return AnalyzeResponse(**result)


# ---------- Satellite indices ----------

@router.post("/satellite/indices", response_model=SatelliteIndicesResponse)
def satellite_indices(payload: SatelliteIndicesRequest) -> SatelliteIndicesResponse:
    result = get_satellite_features(
        polygon=payload.polygon,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_cloud_pct=payload.max_cloud_pct,
    )
    return SatelliteIndicesResponse(**result)


# ---------- Metrics (Spec §5.3) ----------

@router.get("/metrics/summary", response_model=MetricsSummaryResponse)
def metrics_summary(db: Session = Depends(get_db)) -> MetricsSummaryResponse:
    """Aggregate counts for dashboard (Spec §5.3)."""
    from sqlalchemy import func

    farmers_active = db.query(FarmerProfile).filter(FarmerProfile.state == "ACTIVE").count()

    # Alerts sent this week (last 7 days)
    week_ago = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0) - timedelta(days=7)
    alerts_this_week = db.query(AlertRecord).filter(AlertRecord.sent_at >= week_ago).count()

    avg_litres = db.query(func.avg(AlertRecord.litres_per_tree)).scalar() or 0.0

    return MetricsSummaryResponse(
        farmers_active=farmers_active,
        alerts_sent_this_week=alerts_this_week,
        avg_litres_per_tree=round(float(avg_litres), 2),
    )


@router.get("/metrics/farmer/{farmer_id}", response_model=MetricsFarmerResponse)
def metrics_farmer(
    farmer_id: str,
    db: Session = Depends(get_db),
) -> MetricsFarmerResponse:
    """Full alert history for one farmer (Spec §5.3)."""
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    alerts = (
        db.query(AlertRecord)
        .filter(AlertRecord.farmer_id == farmer_id)
        .order_by(AlertRecord.sent_at.desc())
        .all()
    )

    return MetricsFarmerResponse(
        farmer=FarmerOut(
            id=farmer.id,
            state=farmer.state,
            latitude=farmer.latitude,
            longitude=farmer.longitude,
            tree_age=farmer.tree_age,
            soil_type=farmer.soil_type,
            tree_count=farmer.tree_count,
            spacing_m2=farmer.spacing_m2,
            created_at=farmer.created_at.isoformat() if farmer.created_at else None,
            last_alert_at=farmer.last_alert_at.isoformat() if farmer.last_alert_at else None,
        ),
        alerts=[
            {
                "id": a.id,
                "sent_at": a.sent_at.isoformat(),
                "et0_weekly_mm": a.et0_weekly_mm,
                "rain_weekly_mm": a.rain_weekly_mm,
                "kc_applied": a.kc_applied,
                "litres_per_tree": a.litres_per_tree,
                "total_litres": a.total_litres,
                "stress_mode": a.stress_mode,
                "delivery_status": a.delivery_status,
            }
            for a in alerts
        ],
    )
