import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin, hash_password, verify_password, create_access_token
from app.database import get_db
from app.models import AnalysisCache, AlertRecord, FarmerFeedback, FarmerProfile, User, WaterMapCache
from app.schemas import (
    AdminDashboardResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    AnalysisRunCreateRequest,
    AnalysisRunCreateResponse,
    AnalysisRunDetailResponse,
    AnalysisRunsResponse,
    FeedbackCreateRequest,
    FeedbackOut,
    FeedbackSummaryResponse,
    AuthLoginRequest,
    AuthRegisterRequest,
    AuthTokenResponse,
    CalculateRequest,
    CalculateResponse,
    FarmDetailResponse,
    FarmListItem,
    FarmerOut,
    HealthResponse,
    LatestAnalysisResponse,
    MetricsFarmerResponse,
    MetricsSummaryResponse,
    RegisterRequest,
    RegisterResponse,
    SatelliteIndicesRequest,
    SatelliteIndicesResponse,
    StatusMessageResponse,
    TelegramLinkResponse,
    WaterStressMapResponse,
    UserOut,
)
from app.services import get_satellite_features, get_water_stress_map, run_pipeline

logger = logging.getLogger(__name__)
router = APIRouter()


def _resolve_window(start_date: str | None, end_date: str | None) -> tuple[str, str]:
    """Resolve analysis date window to deterministic YYYY-MM-DD strings."""
    today = datetime.now(tz=timezone.utc).date()
    resolved_end = end_date or today.isoformat()
    resolved_start = start_date or (today - timedelta(days=30)).isoformat()
    return resolved_start, resolved_end


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
        irrigation_efficiency=payload.irrigation_efficiency,
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
    force_refresh: bool = Query(default=False, description="If true, bypass cache and run a fresh analysis"),
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

    window_start, window_end = _resolve_window(start_date=None, end_date=None)
    max_cloud_pct = 20.0

    if not force_refresh:
        cached = (
            db.query(AnalysisCache)
            .filter(
                AnalysisCache.farm_id == farmer.id,
                AnalysisCache.start_date == window_start,
                AnalysisCache.end_date == window_end,
                AnalysisCache.max_cloud_pct == round(max_cloud_pct, 2),
            )
            .order_by(AnalysisCache.created_at.desc())
            .first()
        )
        if cached:
            cached_result = json.loads(cached.result_json)
            cached_result["from_cache"] = True
            cached_result["cached_at"] = cached.created_at.isoformat()
            return CalculateResponse(**cached_result)

    result = run_pipeline(
        farm_id=farmer.id,
        polygon=polygon,
        tree_count=farmer.tree_count,
        tree_age=farmer.tree_age,
        soil_type=farmer.soil_type,
        spacing_m2=farmer.spacing_m2 or 100.0,
        irrigation_efficiency=farmer.irrigation_efficiency or 0.9,
        start_date=window_start,
        end_date=window_end,
        max_cloud_pct=max_cloud_pct,
    )

    cache_row = (
        db.query(AnalysisCache)
        .filter(
            AnalysisCache.farm_id == farmer.id,
            AnalysisCache.start_date == window_start,
            AnalysisCache.end_date == window_end,
            AnalysisCache.max_cloud_pct == round(max_cloud_pct, 2),
        )
        .first()
    )
    if cache_row:
        cache_row.result_json = json.dumps(result, ensure_ascii=True)
        cache_row.created_at = datetime.now(timezone.utc)
    else:
        db.add(
            AnalysisCache(
                farm_id=farmer.id,
                start_date=window_start,
                end_date=window_end,
                max_cloud_pct=round(max_cloud_pct, 2),
                result_json=json.dumps(result, ensure_ascii=True),
            )
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
        ndvi_current=result["ndvi_current"],
        ndvi_delta=result["ndvi_delta"],
        ndmi_current=result["ndmi_current"],
        irrigation_efficiency=result["irrigation_efficiency"],
        delivery_status="SENT",
    )
    db.add(alert)
    farmer.last_alert_at = datetime.now(timezone.utc)
    db.commit()

    result["from_cache"] = False
    result["cached_at"] = None
    return CalculateResponse(**result)


@router.get(
    "/farms/{farm_id}/latest-analysis",
    response_model=LatestAnalysisResponse,
    tags=["Irrigation"],
    summary="Get latest saved analysis for a farm",
)
def get_latest_analysis(
    farm_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> LatestAnalysisResponse:
    """Return the most recent persisted analysis without re-calling providers.

    Frontend can use this endpoint to render `/analysis` quickly and only run
    a fresh analysis when the user explicitly requests it.
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farm_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farmer.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    cached = (
        db.query(AnalysisCache)
        .filter(AnalysisCache.farm_id == farm_id)
        .order_by(AnalysisCache.created_at.desc())
        .first()
    )
    if not cached:
        raise HTTPException(status_code=404, detail="no_saved_analysis")

    analysis_data = json.loads(cached.result_json)
    analysis_data["from_cache"] = True
    analysis_data["cached_at"] = cached.created_at.isoformat()

    return LatestAnalysisResponse(
        farm_id=farm_id,
        generated_at=cached.created_at.isoformat(),
        analysis=CalculateResponse(**analysis_data),
    )


@router.get(
    "/analysis/runs",
    response_model=AnalysisRunsResponse,
    tags=["Irrigation"],
    summary="List saved analysis runs from DB",
)
def list_analysis_runs(
    farm_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> AnalysisRunsResponse:
    """List saved analyses (no Sentinel call).

    - FARMER: only their farms
    - ADMIN: all farms
    """
    farms_query = db.query(FarmerProfile)
    if user.role != "ADMIN":
        farms_query = farms_query.filter(FarmerProfile.owner_id == user.id)

    farms = farms_query.all()
    farms_by_id = {farm.id: farm for farm in farms}

    if farm_id:
        if farm_id not in farms_by_id:
            farm_exists = db.query(FarmerProfile).filter(FarmerProfile.id == farm_id).first()
            if not farm_exists:
                raise HTTPException(status_code=404, detail="farmer_not_found")
            raise HTTPException(status_code=403, detail="not_your_farm")

    query = db.query(AnalysisCache)
    if farm_id:
        query = query.filter(AnalysisCache.farm_id == farm_id)
    else:
        allowed_ids = list(farms_by_id.keys())
        if not allowed_ids:
            return AnalysisRunsResponse(runs=[])
        query = query.filter(AnalysisCache.farm_id.in_(allowed_ids))

    rows = query.order_by(AnalysisCache.created_at.desc()).all()

    runs = []
    for row in rows:
        farm = farms_by_id.get(row.farm_id)
        if not farm:
            continue

        result = json.loads(row.result_json)
        has_map = (
            db.query(WaterMapCache)
            .filter(
                WaterMapCache.farm_id == row.farm_id,
                WaterMapCache.start_date == row.start_date,
                WaterMapCache.end_date == row.end_date,
            )
            .first()
            is not None
        )

        runs.append(
            {
                "id": row.id,
                "farm_id": row.farm_id,
                "farmer_name": farm.farmer_name,
                "start_date": row.start_date,
                "end_date": row.end_date,
                "created_at": row.created_at.isoformat(),
                "recommendation": result.get("recommendation"),
                "litres_per_tree": result.get("litres_per_tree"),
                "total_m3": result.get("total_m3"),
                "stress_mode": result.get("stress_mode"),
                "has_water_map": has_map,
            }
        )

    return AnalysisRunsResponse(runs=runs)


@router.get(
    "/analysis/runs/{analysis_id}",
    response_model=AnalysisRunDetailResponse,
    tags=["Irrigation"],
    summary="Get one saved analysis run with saved water map",
)
def get_analysis_run_detail(
    analysis_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> AnalysisRunDetailResponse:
    """Return one saved analysis + saved water map from DB only."""
    row = db.query(AnalysisCache).filter(AnalysisCache.id == analysis_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="analysis_not_found")

    farm = db.query(FarmerProfile).filter(FarmerProfile.id == row.farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farm.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    map_row = (
        db.query(WaterMapCache)
        .filter(
            WaterMapCache.farm_id == row.farm_id,
            WaterMapCache.start_date == row.start_date,
            WaterMapCache.end_date == row.end_date,
        )
        .order_by(WaterMapCache.created_at.desc())
        .first()
    )
    if not map_row:
        raise HTTPException(status_code=404, detail="water_map_not_found")

    analysis_data = json.loads(row.result_json)
    analysis_data["from_cache"] = True
    analysis_data["cached_at"] = row.created_at.isoformat()

    map_data = json.loads(map_row.result_json)

    return AnalysisRunDetailResponse(
        id=row.id,
        farm_id=row.farm_id,
        farmer_name=farm.farmer_name,
        start_date=row.start_date,
        end_date=row.end_date,
        created_at=row.created_at.isoformat(),
        analysis=CalculateResponse(**analysis_data),
        water_map=WaterStressMapResponse(
            farm_id=row.farm_id,
            from_cache=True,
            cached_at=map_row.created_at.isoformat(),
            **map_data,
        ),
    )


@router.post(
    "/analysis/runs",
    response_model=AnalysisRunCreateResponse,
    tags=["Irrigation"],
    summary="Create a new analysis run or return existing one",
)
def create_analysis_run(
    payload: AnalysisRunCreateRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> AnalysisRunCreateResponse:
    """Create analysis for farm/date range with duplicate guard.

    Duplicate key rule: farm_id + start_date + end_date.
    If duplicate exists, no new Sentinel request is made and existing run id is returned.
    """
    farm = db.query(FarmerProfile).filter(FarmerProfile.id == payload.farm_id).first()
    if not farm:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farm.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    window_start, window_end = _resolve_window(payload.start_date, payload.end_date)

    existing = (
        db.query(AnalysisCache)
        .filter(
            AnalysisCache.farm_id == payload.farm_id,
            AnalysisCache.start_date == window_start,
            AnalysisCache.end_date == window_end,
        )
        .order_by(AnalysisCache.created_at.desc())
        .first()
    )
    if existing:
        return AnalysisRunCreateResponse(
            status="existing",
            message="Analysis already exists for this farm and date range.",
            analysis_id=existing.id,
            farm_id=payload.farm_id,
            start_date=window_start,
            end_date=window_end,
        )

    missing = []
    if farm.polygon_json is None:
        missing.append("polygon")
    if farm.tree_age is None:
        missing.append("tree_age")
    if farm.soil_type is None:
        missing.append("soil_type")
    if farm.tree_count is None:
        missing.append("tree_count")
    if missing:
        raise HTTPException(status_code=422, detail={"error": "incomplete_profile", "missing_fields": missing})

    polygon = json.loads(farm.polygon_json)

    analysis_result = run_pipeline(
        farm_id=farm.id,
        polygon=polygon,
        tree_count=farm.tree_count,
        tree_age=farm.tree_age,
        soil_type=farm.soil_type,
        spacing_m2=farm.spacing_m2 or 100.0,
        irrigation_efficiency=farm.irrigation_efficiency or 0.9,
        start_date=window_start,
        end_date=window_end,
        max_cloud_pct=20.0,
    )

    analysis_row = AnalysisCache(
        farm_id=farm.id,
        start_date=window_start,
        end_date=window_end,
        max_cloud_pct=20.0,
        result_json=json.dumps(analysis_result, ensure_ascii=True),
    )
    db.add(analysis_row)
    db.flush()

    map_result = get_water_stress_map(
        polygon=polygon,
        start_date=window_start,
        end_date=window_end,
        max_cloud_pct=20.0,
        grid_size=20,
    )
    db.add(
        WaterMapCache(
            farm_id=farm.id,
            start_date=window_start,
            end_date=window_end,
            grid_size=20,
            max_cloud_pct=20.0,
            result_json=json.dumps(map_result, ensure_ascii=True),
        )
    )

    alert = AlertRecord(
        farmer_id=farm.id,
        et0_weekly_mm=analysis_result["et0_week"],
        rain_weekly_mm=analysis_result["rain_week"],
        kc_applied=analysis_result["kc_applied"],
        litres_per_tree=analysis_result["litres_per_tree"],
        total_litres=analysis_result["total_litres"],
        stress_mode=analysis_result["stress_mode"],
        ndvi_current=analysis_result["ndvi_current"],
        ndvi_delta=analysis_result["ndvi_delta"],
        ndmi_current=analysis_result["ndmi_current"],
        irrigation_efficiency=analysis_result["irrigation_efficiency"],
        delivery_status="SENT",
    )
    db.add(alert)
    farm.last_alert_at = datetime.now(timezone.utc)

    db.commit()

    return AnalysisRunCreateResponse(
        status="created",
        message="Analysis created successfully.",
        analysis_id=analysis_row.id,
        farm_id=farm.id,
        start_date=window_start,
        end_date=window_end,
    )


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
        irrigation_efficiency=payload.irrigation_efficiency,
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
    force_refresh: bool = Query(default=False, description="If true, bypass cache and run a fresh map query"),
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
    window_start, window_end = _resolve_window(start_date=start_date, end_date=end_date)
    cloud_key = round(float(max_cloud_pct), 2)
    grid_key = int(grid_size)

    if not force_refresh:
        cached = (
            db.query(WaterMapCache)
            .filter(
                WaterMapCache.farm_id == farm_id,
                WaterMapCache.start_date == window_start,
                WaterMapCache.end_date == window_end,
                WaterMapCache.grid_size == grid_key,
                WaterMapCache.max_cloud_pct == cloud_key,
            )
            .order_by(WaterMapCache.created_at.desc())
            .first()
        )
        if cached:
            cached_result = json.loads(cached.result_json)
            return WaterStressMapResponse(
                farm_id=farm_id,
                from_cache=True,
                cached_at=cached.created_at.isoformat(),
                **cached_result,
            )

    result = get_water_stress_map(
        polygon=polygon,
        start_date=window_start,
        end_date=window_end,
        max_cloud_pct=max_cloud_pct,
        grid_size=grid_size,
    )

    cache_row = (
        db.query(WaterMapCache)
        .filter(
            WaterMapCache.farm_id == farm_id,
            WaterMapCache.start_date == window_start,
            WaterMapCache.end_date == window_end,
            WaterMapCache.grid_size == grid_key,
            WaterMapCache.max_cloud_pct == cloud_key,
        )
        .first()
    )
    if cache_row:
        cache_row.result_json = json.dumps(result, ensure_ascii=True)
        cache_row.created_at = datetime.now(timezone.utc)
    else:
        db.add(
            WaterMapCache(
                farm_id=farm_id,
                start_date=window_start,
                end_date=window_end,
                grid_size=grid_key,
                max_cloud_pct=cloud_key,
                result_json=json.dumps(result, ensure_ascii=True),
            )
        )
    db.commit()

    return WaterStressMapResponse(
        farm_id=farm_id,
        from_cache=False,
        cached_at=None,
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
            irrigation_efficiency=farmer.irrigation_efficiency,
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
                "ndvi_current": a.ndvi_current,
                "ndvi_delta": a.ndvi_delta,
                "ndmi_current": a.ndmi_current,
                "irrigation_efficiency": a.irrigation_efficiency,
                "delivery_status": a.delivery_status,
            }
            for a in alerts
        ],
    )


@router.post("/feedback", response_model=FeedbackOut, tags=["Metrics"],
             summary="Submit farmer feedback on irrigation recommendation")
def submit_feedback(
    payload: FeedbackCreateRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> FeedbackOut:
    """Create a feedback entry to improve recommendation quality.

    Feedback types:
    - `WORKED`: recommendation was accurate
    - `TOO_MUCH`: recommendation suggested too much water
    - `TOO_LITTLE`: recommendation suggested too little water
    - `NOT_APPLIED`: farmer did not apply recommendation
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == payload.farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farmer.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    if payload.alert_id:
        alert = (
            db.query(AlertRecord)
            .filter(AlertRecord.id == payload.alert_id, AlertRecord.farmer_id == payload.farmer_id)
            .first()
        )
        if not alert:
            raise HTTPException(status_code=404, detail="alert_not_found")

    feedback = FarmerFeedback(
        farmer_id=payload.farmer_id,
        alert_id=payload.alert_id,
        feedback_type=payload.feedback_type.value,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return FeedbackOut(
        id=feedback.id,
        farmer_id=feedback.farmer_id,
        alert_id=feedback.alert_id,
        feedback_type=feedback.feedback_type,
        rating=feedback.rating,
        comment=feedback.comment,
        created_at=feedback.created_at.isoformat(),
    )


@router.get("/feedback/farmer/{farmer_id}", response_model=FeedbackSummaryResponse, tags=["Metrics"],
            summary="Get farmer feedback history and summary")
def get_farmer_feedback(
    farmer_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> FeedbackSummaryResponse:
    """Returns feedback loop history and aggregate counts for one farmer."""
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    if user.role != "ADMIN" and farmer.owner_id != user.id:
        raise HTTPException(status_code=403, detail="not_your_farm")

    entries = (
        db.query(FarmerFeedback)
        .filter(FarmerFeedback.farmer_id == farmer_id)
        .order_by(FarmerFeedback.created_at.desc())
        .limit(200)
        .all()
    )

    worked = sum(1 for entry in entries if entry.feedback_type == "WORKED")
    too_much = sum(1 for entry in entries if entry.feedback_type == "TOO_MUCH")
    too_little = sum(1 for entry in entries if entry.feedback_type == "TOO_LITTLE")
    not_applied = sum(1 for entry in entries if entry.feedback_type == "NOT_APPLIED")

    ratings = [entry.rating for entry in entries if entry.rating is not None]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

    return FeedbackSummaryResponse(
        farmer_id=farmer_id,
        total_feedback=len(entries),
        worked_count=worked,
        too_much_count=too_much,
        too_little_count=too_little,
        not_applied_count=not_applied,
        avg_rating=avg_rating,
        feedback=[
            FeedbackOut(
                id=entry.id,
                farmer_id=entry.farmer_id,
                alert_id=entry.alert_id,
                feedback_type=entry.feedback_type,
                rating=entry.rating,
                comment=entry.comment,
                created_at=entry.created_at.isoformat(),
            )
            for entry in entries
        ],
    )


# ---------- Telegram deep-link ----------

@router.get("/telegram-link/{farmer_id}", response_model=TelegramLinkResponse, tags=["Telegram"],
            summary="Generate Telegram deep-link for a farmer")
def telegram_link(
    farmer_id: str,
    db: Session = Depends(get_db),
    _user=Depends(get_current_user),
) -> TelegramLinkResponse:
    """Returns a `https://t.me/OleaSat_bot?start={farmer_id}` deep-link URL.

    The farmer opens this link on their phone → Telegram opens → the bot
    receives `/start {farmer_id}` → binds the chat to the farmer profile.

    Returns `404` if the farmer_id doesn't exist.
    """
    farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="farmer_not_found")

    link = f"https://t.me/OleaSat_bot?start={farmer_id}"
    return TelegramLinkResponse(
        farmer_id=farmer_id,
        telegram_link=link,
        linked=farmer.telegram_chat_id is not None,
    )


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
        irrigation_efficiency=f.irrigation_efficiency,
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
            "ndvi_current": last_alert.ndvi_current,
            "ndvi_delta": last_alert.ndvi_delta,
            "ndmi_current": last_alert.ndmi_current,
            "irrigation_efficiency": last_alert.irrigation_efficiency,
            "delivery_status": last_alert.delivery_status,
        }

    return FarmDetailResponse(
        farm=_farm_to_list_item(farmer),
        last_alert=alert_dict,
    )


@router.delete("/farms/{farm_id}", response_model=StatusMessageResponse, tags=["Farms"],
               summary="Delete a farm and its alert history")
def delete_farm(
    farm_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
) -> StatusMessageResponse:
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
    return StatusMessageResponse(status="ok", message=f"Farm {farm_id} deleted")


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

@router.post("/admin/trigger-weekly", response_model=StatusMessageResponse, tags=["Admin"],
             summary="Manually trigger the weekly irrigation job")
async def trigger_weekly(user=Depends(require_admin)) -> StatusMessageResponse:
    """Manually runs the weekly scheduler job for all active farmers
    with a linked Telegram account. Useful for testing and demos.

    **Requires ADMIN role.**
    """
    from app.scheduler import trigger_manual_run
    result = await trigger_manual_run()
    return StatusMessageResponse(**result)
