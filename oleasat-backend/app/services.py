from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FAO-56 Olive Irrigation Constants (Spec §6)
# ---------------------------------------------------------------------------
KC_TABLE: Dict[int, tuple] = {
    # month: (base_kc, phase_label, is_critical_phase)
    1:  (0.65, "Repos végétatif", False),
    2:  (0.65, "Repos végétatif", False),
    3:  (0.70, "Floraison", True),
    4:  (0.70, "Floraison", True),
    5:  (0.70, "Floraison", True),
    6:  (0.65, "Développement du fruit", False),
    7:  (0.65, "Développement du fruit", False),
    8:  (0.65, "Développement du fruit", False),
    9:  (0.70, "Accumulation d'huile", True),
    10: (0.70, "Accumulation d'huile", True),
    11: (0.65, "Repos végétatif", False),
    12: (0.65, "Repos végétatif", False),
}

SOIL_FACTOR: Dict[str, float] = {
    "SANDY": 1.20,
    "MEDIUM": 1.00,
    "CLAY": 0.85,
}

AGE_MODIFIER: Dict[str, float] = {
    "YOUNG": 0.85,
    "ADULT": 1.00,
}

# ---------------------------------------------------------------------------
# Sentinel Hub (sentinelhub-py) – lazy imports & config
# ---------------------------------------------------------------------------
_sh_config = None
_sh_data_collection = None


def _get_sh_config():
    """Build and cache an SHConfig for Sentinel Hub."""
    global _sh_config, _sh_data_collection

    if _sh_config is not None:
        return _sh_config, _sh_data_collection

    try:
        from sentinelhub import DataCollection, SHConfig

        cfg = SHConfig()
        cfg.sh_client_id = settings.sh_client_id or ""
        cfg.sh_client_secret = settings.sh_client_secret or ""
        cfg.sh_base_url = settings.sh_base_url
        cfg.sh_token_url = settings.sh_token_url

        if not cfg.sh_client_id or not cfg.sh_client_secret:
            return None, None

        # Use standard Sentinel-2 L2A collection
        data_collection = DataCollection.SENTINEL2_L2A

        _sh_config = cfg
        _sh_data_collection = data_collection
        return _sh_config, _sh_data_collection
    except Exception as exc:
        logger.warning("Failed to configure sentinelhub: %s", exc)
        return None, None


def _default_dates() -> tuple[str, str]:
    end_date = datetime.now(tz=timezone.utc).date()
    start_date = end_date - timedelta(days=30)
    return start_date.isoformat(), end_date.isoformat()


def _ensure_closed_ring(polygon: List[List[float]]) -> List[List[float]]:
    if len(polygon) < 3:
        raise ValueError("Polygon must contain at least 3 points")
    ring = [point[:] for point in polygon]
    if ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def _mock_satellite_features(polygon: List[List[float]], start_date: str, end_date: str, note: str) -> Dict[str, Any]:
    key = "|".join(f"{p[0]},{p[1]}" for p in polygon)
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    seed_a = int(digest[:8], 16)
    seed_b = int(digest[8:16], 16)
    ndvi_current = round(0.45 + (seed_a % 3500) / 10000, 4)
    ndvi_delta = round(((seed_b % 1400) / 10000) - 0.07, 4)
    ndmi_current = round(max(min(ndvi_current - 0.18, 0.6), -0.4), 4)

    return {
        "ndvi_current": ndvi_current,
        "ndvi_delta": ndvi_delta,
        "ndmi_current": ndmi_current,
        "cloud_pct": 0.0,
        "date_used": end_date,
        "images_used": 0,
        "source": "mock",
        "note": note,
        "window_start": start_date,
        "window_end": end_date,
    }


NDVI_NDMI_EVALSCRIPT = """
//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "B11", "SCL", "dataMask"],
      units: "DN"
    }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "ndmi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(samples) {
  // Mask non-vegetation SCL classes (no data, saturated, cloud shadow, water, cloud med/high, cirrus, snow)
  let dominated = [0, 1, 3, 6, 8, 9, 10];
  let mask = samples.dataMask && !dominated.includes(samples.SCL) ? 1 : 0;

  let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 1e-10);
  let ndmi = (samples.B08 - samples.B11) / (samples.B08 + samples.B11 + 1e-10);

  return {
    ndvi: [ndvi],
    ndmi: [ndmi],
    dataMask: [mask]
  };
}
"""


def get_satellite_features(
    polygon: List[List[float]],
    start_date: str | None = None,
    end_date: str | None = None,
    max_cloud_pct: float = 20,
) -> Dict[str, Any]:
    resolved_start, resolved_end = _default_dates()
    start_date = start_date or resolved_start
    end_date = end_date or resolved_end

    ring = _ensure_closed_ring(polygon)

    sh_config, data_collection = _get_sh_config()
    if sh_config is None:
        return _mock_satellite_features(
            ring, start_date, end_date,
            "Sentinel Hub not configured; using fallback values",
        )

    try:
        from shapely.geometry import Polygon as ShapelyPolygon
        from sentinelhub import CRS, Geometry, SentinelHubStatistical

        geometry = Geometry(ShapelyPolygon(ring), crs=CRS.WGS84)

        aggregation = SentinelHubStatistical.aggregation(
            evalscript=NDVI_NDMI_EVALSCRIPT,
            time_interval=(start_date, end_date),
            aggregation_interval="P1D",
            resolution=(10, 10),
        )

        input_data = SentinelHubStatistical.input_data(
            data_collection,
            maxcc=max_cloud_pct / 100,
        )

        request = SentinelHubStatistical(
            aggregation=aggregation,
            input_data=[input_data],
            geometry=geometry,
            config=sh_config,
        )

        stats = request.get_data()[0]

        intervals = stats.get("data", [])
        if not intervals:
            return _mock_satellite_features(
                ring, start_date, end_date,
                "No Sentinel-2 images found in date window",
            )

        # Filter out intervals where all pixels are noData
        valid_intervals = []
        for interval in intervals:
            outputs = interval.get("outputs", {})
            ndvi_b0 = outputs.get("ndvi", {}).get("bands", {}).get("B0", {}).get("stats", {})
            sample_count = ndvi_b0.get("sampleCount", 0)
            no_data_count = ndvi_b0.get("noDataCount", 0)
            if sample_count > no_data_count:
                valid_intervals.append(interval)

        if not valid_intervals:
            return _mock_satellite_features(
                ring, start_date, end_date,
                "All acquisitions fully masked (cloud / noData)",
            )

        # Latest valid acquisition
        latest = valid_intervals[-1]
        latest_outputs = latest.get("outputs", {})
        ndvi_stats = latest_outputs.get("ndvi", {}).get("bands", {}).get("B0", {}).get("stats", {})
        ndmi_stats = latest_outputs.get("ndmi", {}).get("bands", {}).get("B0", {}).get("stats", {})

        ndvi_current = ndvi_stats.get("mean")
        ndmi_current = ndmi_stats.get("mean")

        if ndvi_current is None or ndmi_current is None:
            return _mock_satellite_features(
                ring, start_date, end_date,
                "Statistical API returned empty values",
            )

        # NDVI delta from previous valid acquisition
        ndvi_previous = ndvi_current
        if len(valid_intervals) > 1:
            prev_outputs = valid_intervals[-2].get("outputs", {})
            prev_ndvi = (
                prev_outputs.get("ndvi", {}).get("bands", {}).get("B0", {}).get("stats", {}).get("mean")
            )
            if prev_ndvi is not None:
                ndvi_previous = prev_ndvi

        date_used = latest.get("interval", {}).get("from", end_date)[:10]

        return {
            "ndvi_current": round(float(ndvi_current), 4),
            "ndvi_delta": round(float(ndvi_current) - float(ndvi_previous), 4),
            "ndmi_current": round(float(ndmi_current), 4),
            "cloud_pct": round(max_cloud_pct, 2),
            "date_used": date_used,
            "images_used": len(valid_intervals),
            "source": "sentinel_hub",
            "note": None,
            "window_start": start_date,
            "window_end": end_date,
        }
    except Exception as exc:
        logger.error("Sentinel Hub query failed: %s", exc)
        return _mock_satellite_features(
            ring, start_date, end_date,
            f"Sentinel Hub query failed: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Weather data (STUB – Task 2 will connect to Open-Meteo)
# ---------------------------------------------------------------------------

def _polygon_centroid(polygon: List[List[float]]) -> tuple[float, float]:
    """Return (lat, lon) centroid of a polygon."""
    lons = [p[0] for p in polygon]
    lats = [p[1] for p in polygon]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def get_weather_features(polygon: List[List[float]]) -> Dict[str, Any]:
    """Fetch 7-day ET₀ and rainfall forecast.

    TODO (Task 2): Replace with real Open-Meteo API call using
    lat/lon from _polygon_centroid(polygon).
    """
    _ = polygon
    return {
        "et0_daily": [5.0, 4.8, 5.2, 5.1, 4.9, 5.3, 4.2],   # mm/day × 7
        "rain_daily": [0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 1.2],   # mm/day × 7
    }


# ---------------------------------------------------------------------------
# FAO-56 Engine (Spec §6)
# ---------------------------------------------------------------------------

def compute_effective_rainfall(rain_daily: List[float]) -> float:
    """P_eff: only rain > 5 mm/day counts, at 80% efficiency (FAO heuristic)."""
    p_eff = 0.0
    for r in rain_daily:
        if r > 5.0:
            p_eff += r * 0.8
    return p_eff


def compute_fao56(
    et0_daily: List[float],
    rain_daily: List[float],
    month: int,
    tree_age: str = "ADULT",
    soil_type: str = "MEDIUM",
    spacing_m2: float = 100.0,
    tree_count: int = 100,
) -> Dict[str, Any]:
    """Full FAO-56 irrigation calculation for olives (Spec §6)."""
    # Weekly totals
    et0_week = sum(et0_daily)
    rain_week = sum(rain_daily)

    # Kc adjusted for month and tree age
    base_kc, phase_label, is_critical = KC_TABLE.get(month, (0.65, "Repos végétatif", False))
    age_mod = AGE_MODIFIER.get(tree_age.upper(), 1.0)
    kc_adj = base_kc * age_mod

    # Effective rainfall (§6.4)
    p_eff = compute_effective_rainfall(rain_daily)

    # Soil retention factor (§6.3)
    soil_f = SOIL_FACTOR.get(soil_type.upper(), 1.0)

    # Core formula: IR = (ET₀_week × Kc) − P_eff  (§6.1)
    ir_mm = max((et0_week * kc_adj) - p_eff, 0.0)

    # Volume per tree: IR_mm × spacing_m² × soil_factor
    litres_per_tree = ir_mm * spacing_m2 * soil_f

    # Total plot volume
    total_litres = litres_per_tree * tree_count
    total_m3 = total_litres / 1000.0

    # Stress mode detection (§6.5)
    stress_mode = et0_week > 45.0 and p_eff < 2.0
    survival_litres = round(litres_per_tree * 0.35, 2) if stress_mode else None

    return {
        "et0_week": round(et0_week, 2),
        "rain_week": round(rain_week, 2),
        "p_eff": round(p_eff, 2),
        "kc_applied": round(kc_adj, 3),
        "ir_mm": round(ir_mm, 2),
        "phase_label": phase_label,
        "is_critical_phase": is_critical,
        "soil_factor": soil_f,
        "litres_per_tree": round(litres_per_tree, 2),
        "total_litres": round(total_litres, 2),
        "total_m3": round(total_m3, 3),
        "stress_mode": stress_mode,
        "survival_litres": survival_litres,
    }


def build_recommendation(litres_per_tree: float, stress_mode: bool) -> tuple[str, str]:
    """Return (recommendation_code, explanation) based on irrigation need."""
    if stress_mode:
        return (
            "URGENT",
            "Mode sécheresse détecté (ET₀ > 45mm, pluie efficace < 2mm). "
            "Irrigation de survie minimale requise pour protéger la récolte.",
        )
    if litres_per_tree >= 25:
        return "URGENT", "Besoin d'irrigation urgent cette semaine."
    if litres_per_tree >= 10:
        return "IRRIGATE", "Irrigation recommandée cette semaine."
    return "SKIP", "Pas d'irrigation nécessaire cette semaine."


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def run_pipeline(
    farm_id: str,
    polygon: List[List[float]],
    tree_count: int = 100,
    tree_age: str = "ADULT",
    soil_type: str = "MEDIUM",
    spacing_m2: float = 100.0,
    start_date: str | None = None,
    end_date: str | None = None,
    max_cloud_pct: float = 20,
) -> Dict[str, Any]:
    """Orchestrate satellite + weather + FAO-56 + recommendation."""
    # 1. Satellite features (NDVI / NDMI via Sentinel Hub)
    sat = get_satellite_features(
        polygon=polygon,
        start_date=start_date,
        end_date=end_date,
        max_cloud_pct=max_cloud_pct,
    )

    # 2. Weather forecast (7-day daily arrays)
    weather = get_weather_features(polygon)

    # 3. FAO-56 irrigation calculation
    month = datetime.now(tz=timezone.utc).month
    fao = compute_fao56(
        et0_daily=weather["et0_daily"],
        rain_daily=weather["rain_daily"],
        month=month,
        tree_age=tree_age,
        soil_type=soil_type,
        spacing_m2=spacing_m2,
        tree_count=tree_count,
    )

    # 4. Recommendation
    recommendation, explanation = build_recommendation(
        fao["litres_per_tree"], fao["stress_mode"],
    )

    # Enrich explanation with satellite context
    explanation = (
        f"NDVI={sat['ndvi_current']} (Δ{sat['ndvi_delta']}), "
        f"NDMI={sat['ndmi_current']}. "
        f"Phase: {fao['phase_label']} (Kc={fao['kc_applied']}). "
        f"ET₀={fao['et0_week']}mm, Pluie={fao['rain_week']}mm, "
        f"P_eff={fao['p_eff']}mm. "
        f"IR={fao['ir_mm']}mm → {fao['litres_per_tree']}L/arbre. "
        f"{explanation}"
    )

    return {
        "farm_id": farm_id,
        **sat,
        **fao,
        "recommendation": recommendation,
        "explanation": explanation,
    }
