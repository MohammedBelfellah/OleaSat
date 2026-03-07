import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin, hash_password, verify_password, create_access_token
from app.database import get_db
from app.models import AlertRecord, FarmerProfile, User
from app.schemas import (
    AdminDashboardResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthTokenResponse,
    CalculateRequest,
    CalculateResponse,
    FarmDetailResponse,
    FarmListItem,
    FarmerOut,
    HealthResponse,
    MetricsFarmerResponse,
    MetricsSummaryResponse,
    RegisterRequest,
    RegisterResponse,
    SatelliteIndicesRequest,
    SatelliteIndicesResponse,
    WaterStressMapResponse,
    UserOut,
)
from app.services import get_satellite_features, get_water_stress_map, run_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()


# ---------- Health ----------

@router.get("/health", response_model=HealthResponse, tags=["Health"],
            summary="System health check")
def health_check(db: Session = Depends(get_db)) -> HealthResponse:
    """Returns system and database connectivity status.

    - `status`: always `ok` if the server is running
    - `db`: `ok` if SQLite is reachable, `error` otherwise
    """
    db_status = "ok"
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
    return HealthResponse(status="ok", db=db_status)


# ---------- Auth ----------

@router.post("/auth/register", response_model=AuthTokenResponse, tags=["Auth"],
             summary="Create a new user account", status_code=201)
def auth_register(
    payload: AuthRegisterRequest,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    """Register a new web-app user (farmer/admin).

    Returns a JWT access token so the frontend can immediately start
    making authenticated requests after sign-up.
    """
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="email_already_registered")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    logger.info("Registered user %s (%s)", user.id, user.email)

    return AuthTokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


@router.post("/auth/login", response_model=AuthTokenResponse, tags=["Auth"],
             summary="Login and receive a JWT token")
def auth_login(
    payload: AuthLoginRequest,
    db: Session = Depends(get_db),
) -> AuthTokenResponse:
    """Authenticate with email + password. Returns a JWT access token valid for 24 hours.

    Use the token in the `Authorization: Bearer {token}` header for all protected endpoints.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="invalid_credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="account_deactivated")

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    logger.info("User logged in: %s", user.email)

    return AuthTokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


@router.get("/auth/me", response_model=UserOut, tags=["Auth"],
            summary="Get current user profile")
def auth_me(user=Depends(get_current_user)) -> UserOut:
    """Returns the profile of the currently authenticated user."""
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


# ---------- Register ----------

@router.post("/register", response_model=RegisterResponse, tags=["Farms"],
             summary="Register a new farm",
             status_code=201)
def register_farm(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> RegisterResponse:
    """Creates a new farmer profile in the database.

    Provide the orchard polygon (list of `[lon, lat]` points), tree parameters,
    and farmer contact info. A unique `farm_id` (UUID) is returned — use it
    for `/calculate` and `/metrics/farmer/{id}` calls.

    **Defaults:** tree_age=ADULT, soil_type=MEDIUM, tree_count=100, spacing_m2=100
    """
    polygon_coords = [[p[0], p[1]] for p in payload.polygon]

    # Compute centroid for lat/lon
    lons = [p[0] for p in polygon_coords]
    lats = [p[1] for p in polygon_coords]
    lat = sum(lats) / len(lats)
    lon = sum(lons) / len(lons)

    farmer = FarmerProfile(
        state="ACTIVE",
        owner_id=user.id,
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

@router.post("/calculate", response_model=CalculateResponse, tags=["Irrigation"],
             summary="Calculate irrigation for a registered farmer")
def calculate(
    payload: CalculateRequest,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
) -> CalculateResponse:
    """Looks up the farmer profile from the database, then runs the full pipeline:

    1. **Satellite** — Fetches NDVI/NDMI from Sentinel Hub (last 30 days)
    2. **Weather** — 7-day ET₀ + rainfall forecast from Open-Meteo
    3. **FAO-56** — Computes IR, litres/tree, total volume, stress mode
    4. **Alert log** — Saves an AlertRecord to the database

    Returns `404` if the farmer_id doesn't exist.  
    Returns `422` if the profile is incomplete (missing polygon, age, soil, or tree_count).
    """
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

@router.post("/analyze", response_model=AnalyzeResponse, tags=["Irrigation"],
             summary="Analyze irrigation (direct parameters, no DB)")
def analyze_farm(payload: AnalyzeRequest, _user=Depends(get_current_user)) -> AnalyzeResponse:
    """Same pipeline as `/calculate` but you pass all parameters directly.
    No database lookup or persistence — useful for testing and one-off queries.

    Optional: `start_date` / `end_date` (YYYY-MM-DD) to control the satellite window.
    """
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

@router.post("/satellite/indices", response_model=SatelliteIndicesResponse, tags=["Satellite"],
             summary="Get NDVI & NDMI vegetation indices")
def satellite_indices(payload: SatelliteIndicesRequest, _user=Depends(get_current_user)) -> SatelliteIndicesResponse:
    """Queries Sentinel Hub Statistical API for Sentinel-2 L2A imagery over the given polygon.

    Returns:
    - **NDVI** (Normalized Difference Vegetation Index): plant health indicator
    - **NDMI** (Normalized Difference Moisture Index): canopy water content
    - **ndvi_delta**: change from previous acquisition (trend detection)
    - Cloud-masked using the Scene Classification Layer (SCL)

    If Sentinel Hub is not configured, returns deterministic mock values (`source: mock`).
    """
    result = get_satellite_features(
        polygon=payload.polygon,
        start_date=payload.start_date,
        end_date=payload.end_date,
        max_cloud_pct=payload.max_cloud_pct,
    )
    return SatelliteIndicesResponse(**result)


@router.get("/farms/{farm_id}/water-map", response_model=WaterStressMapResponse, tags=["Satellite"],
            summary="Get spatial water stress map for a farm")
def farm_water_map(
    farm_id: str,
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    max_cloud_pct: float = Query(default=20, ge=0, le=100),
    grid_size: int = Query(default=20, ge=8, le=40, description="Target map resolution in cells"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> WaterStressMapResponse:
    """Returns a per-cell spatial water stress map for map visualization.

    - Uses Sentinel Hub raster data (NDMI/NDVI) clipped to the farm polygon
    - Supports date-range filtering (`start_date`, `end_date`)
    - Returns GeoJSON-like cell polygons + stress levels (HIGH/MEDIUM/LOW)

    Access control:
    - ADMIN can query any farm
    - FARMER can query only their own farms
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farm_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farmer.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    if not farmer.polygon_json:
        raise HTTPException(status_code=422, detail={"error": "incomplete_profile", "missing_fields": ["polygon"]})

    polygon = json.loads(farmer.polygon_json)
    result = get_water_stress_map(
        polygon=polygon,
        start_date=start_date,
        end_date=end_date,
        max_cloud_pct=max_cloud_pct,
        grid_size=grid_size,
    )

    return WaterStressMapResponse(
        farm_id=farm_id,
        **result,
    )


# ---------- Metrics (Spec §5.3) ----------

@router.get("/metrics/summary", response_model=MetricsSummaryResponse, tags=["Metrics"],
            summary="Dashboard aggregate statistics")
def metrics_summary(db: Session = Depends(get_db), _user=Depends(get_current_user)) -> MetricsSummaryResponse:
    """Returns aggregate counts for monitoring dashboards:

    - `farmers_active` — number of farmers with state = ACTIVE
    - `alerts_sent_this_week` — alert records created in the last 7 days
    - `avg_litres_per_tree` — global average litres/tree across all alerts
    """
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


@router.get("/metrics/farmer/{farmer_id}", response_model=MetricsFarmerResponse, tags=["Metrics"],
            summary="Full alert history for one farmer")
def metrics_farmer(
    farmer_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
) -> MetricsFarmerResponse:
    """Returns the farmer profile and a chronological list of all AlertRecords
    (newest first). Each alert includes ET₀, rainfall, Kc, litres/tree,
    stress mode, and delivery status.

    Returns `404` if the farmer_id doesn't exist.
    """
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


# ---------- Telegram deep-link ----------

@router.get("/telegram-link/{farmer_id}", tags=["Telegram"],
            summary="Generate Telegram deep-link for a farmer")
def telegram_link(
    farmer_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
) -> dict:
    """Returns a `https://t.me/OleaSat_bot?start={farmer_id}` deep-link URL.

    The farmer opens this link on their phone → Telegram opens → the bot
    receives `/start {farmer_id}` → binds the chat to the farmer profile.

    Returns `404` if the farmer_id doesn't exist.
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    link = f"https://t.me/OleaSat_bot?start={farmer_id}"
    return {
        "farmer_id": farmer_id,
        "telegram_link": link,
        "linked": farmer.telegram_chat_id is not None,
    }


# ---------- Farms (list / detail / delete) ----------

def _farm_to_list_item(f: FarmerProfile) -> FarmListItem:
    """Convert a FarmerProfile ORM object to a FarmListItem schema."""
    return FarmListItem(
        id=f.id,
        farmer_name=f.farmer_name,
        phone=f.phone,
        state=f.state,
        latitude=f.latitude,
        longitude=f.longitude,
        tree_age=f.tree_age,
        soil_type=f.soil_type,
        tree_count=f.tree_count,
        spacing_m2=f.spacing_m2,
        telegram_linked=f.telegram_chat_id is not None,
        created_at=f.created_at.isoformat() if f.created_at else None,
        last_alert_at=f.last_alert_at.isoformat() if f.last_alert_at else None,
    )


@router.get("/farms", response_model=list[FarmListItem], tags=["Farms"],
            summary="List my farms (or all farms if ADMIN)")
def list_farms(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> list[FarmListItem]:
    """Returns the list of farms owned by the current user.

    **ADMIN** users see ALL farms in the system.
    **FARMER** users see only the farms they registered.
    """
    if user.role == "ADMIN":
        farms = db.query(FarmerProfile).order_by(FarmerProfile.created_at.desc()).all()
    else:
        farms = (
            db.query(FarmerProfile)
            .filter(FarmerProfile.owner_id == user.id)
            .order_by(FarmerProfile.created_at.desc())
            .all()
        )
    return [_farm_to_list_item(f) for f in farms]


@router.get("/farms/{farm_id}", response_model=FarmDetailResponse, tags=["Farms"],
            summary="Get farm detail with last alert")
def get_farm_detail(
    farm_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> FarmDetailResponse:
    """Returns full farm details plus the most recent alert record.

    **ADMIN** can view any farm. **FARMER** can only view their own farms.
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farm_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    # Enforce ownership for non-admins
    if user.role != "ADMIN" and farmer.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    last_alert = (
        db.query(AlertRecord)
        .filter(AlertRecord.farmer_id == farm_id)
        .order_by(AlertRecord.sent_at.desc())
        .first()
    )

    alert_dict = None
    if last_alert:
        alert_dict = {
            "id": last_alert.id,
            "sent_at": last_alert.sent_at.isoformat(),
            "et0_weekly_mm": last_alert.et0_weekly_mm,
            "rain_weekly_mm": last_alert.rain_weekly_mm,
            "kc_applied": last_alert.kc_applied,
            "litres_per_tree": last_alert.litres_per_tree,
            "total_litres": last_alert.total_litres,
            "stress_mode": last_alert.stress_mode,
            "delivery_status": last_alert.delivery_status,
        }

    return FarmDetailResponse(
        farm=_farm_to_list_item(farmer),
        last_alert=alert_dict,
    )


@router.delete("/farms/{farm_id}", tags=["Farms"],
               summary="Delete a farm and its alert history")
def delete_farm(
    farm_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> dict:
    """Deletes a farm profile and all its alert records.

    **ADMIN** can delete any farm. **FARMER** can only delete their own farms.
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farm_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farmer.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    db.delete(farmer)  # cascade deletes alerts
    db.commit()
    logger.info("Deleted farm %s by user %s", farm_id, user.id)
    return {"status": "ok", "message": f"Farm {farm_id} deleted"}


# ---------- Admin Dashboard ----------

@router.get("/admin/dashboard", response_model=AdminDashboardResponse, tags=["Admin"],
            summary="Admin overview — global insights")
def admin_dashboard(
    db: Session = Depends(get_db),
    user=Depends(require_admin),
) -> AdminDashboardResponse:
    """Returns a high-level overview of the entire system for the admin dashboard.

    **Requires ADMIN role.**

    Includes: totals, averages, stress count, urgent farms, recent alerts.
    """
    from sqlalchemy import func

    total_farmers = db.query(FarmerProfile).count()
    active_farmers = db.query(FarmerProfile).filter(FarmerProfile.state == "ACTIVE").count()
    total_alerts = db.query(AlertRecord).count()

    week_ago = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0) - timedelta(days=7)
    alerts_this_week = db.query(AlertRecord).filter(AlertRecord.sent_at >= week_ago).count()

    farmers_with_telegram = db.query(FarmerProfile).filter(
        FarmerProfile.telegram_chat_id.isnot(None)
    ).count()

    avg_litres = db.query(func.avg(AlertRecord.litres_per_tree)).scalar() or 0.0
    total_water = db.query(func.sum(AlertRecord.total_litres)).scalar() or 0.0
    stress_count = db.query(AlertRecord).filter(AlertRecord.stress_mode.is_(True)).count()

    # Urgent farms = most recent alert has high litres (>= 25) or stress
    # Get latest alert per farmer using a subquery
    from sqlalchemy import desc
    latest_alerts = (
        db.query(AlertRecord)
        .order_by(AlertRecord.sent_at.desc())
        .all()
    )
    seen_farmers = set()
    urgent_farm_ids = []
    for a in latest_alerts:
        if a.farmer_id not in seen_farmers:
            seen_farmers.add(a.farmer_id)
            if a.stress_mode or a.litres_per_tree >= 25:
                urgent_farm_ids.append(a.farmer_id)

    urgent_farms = []
    if urgent_farm_ids:
        urgent_profiles = db.query(FarmerProfile).filter(
            FarmerProfile.id.in_(urgent_farm_ids)
        ).all()
        urgent_farms = [_farm_to_list_item(f) for f in urgent_profiles]

    # Recent alerts (last 10)
    recent = (
        db.query(AlertRecord)
        .order_by(AlertRecord.sent_at.desc())
        .limit(10)
        .all()
    )
    recent_alerts = []
    for a in recent:
        farmer = db.query(FarmerProfile).filter(FarmerProfile.id == a.farmer_id).first()
        recent_alerts.append({
            "id": a.id,
            "farmer_id": a.farmer_id,
            "farmer_name": farmer.farmer_name if farmer else "Unknown",
            "sent_at": a.sent_at.isoformat(),
            "litres_per_tree": a.litres_per_tree,
            "total_litres": a.total_litres,
            "stress_mode": a.stress_mode,
            "delivery_status": a.delivery_status,
        })

    return AdminDashboardResponse(
        total_farmers=total_farmers,
        active_farmers=active_farmers,
        total_alerts=total_alerts,
        alerts_this_week=alerts_this_week,
        farmers_with_telegram=farmers_with_telegram,
        avg_litres_per_tree=round(float(avg_litres), 2),
        total_water_m3=round(float(total_water) / 1000, 2),
        stress_alerts_count=stress_count,
        urgent_farms=urgent_farms,
        recent_alerts=recent_alerts,
    )


@router.get("/admin/farmers", response_model=list[FarmListItem], tags=["Admin"],
            summary="List all farmers in the system")
def admin_list_all_farmers(
    db: Session = Depends(get_db),
    user=Depends(require_admin),
) -> list[FarmListItem]:
    """Returns every farmer profile in the system.

    **Requires ADMIN role.**
    """
    farms = db.query(FarmerProfile).order_by(FarmerProfile.created_at.desc()).all()
    return [_farm_to_list_item(f) for f in farms]


# ---------- Manual trigger (admin / testing) ----------

@router.post("/admin/trigger-weekly", tags=["Admin"],
             summary="Manually trigger the weekly irrigation job")
async def trigger_weekly(user=Depends(require_admin)) -> dict:
    """Manually runs the weekly scheduler job for all active farmers
    with a linked Telegram account. Useful for testing and demos.

    **Requires ADMIN role.**
    """
    from app.scheduler import trigger_manual_run
    return await trigger_manual_run()
