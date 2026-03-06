from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.config import settings

logger = logging.getLogger(__name__)

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


def get_weather_features(polygon: List[List[float]]) -> Dict[str, float]:
    _ = polygon
    return {
        "et0_week": 34.5,
        "rain_week": 3.2,
    }


def compute_fao56_liters_per_tree(et0_week: float, rain_week: float) -> float:
    net_need_mm = max(et0_week - rain_week, 0)
    return round(net_need_mm * 0.9, 2)


def build_recommendation(liters_per_tree: float) -> str:
    if liters_per_tree >= 25:
        return "URGENT"
    if liters_per_tree >= 10:
        return "IRRIGATE"
    return "SKIP"


def run_pipeline(
    farm_id: str,
    polygon: List[List[float]],
    tree_count: int,
    start_date: str | None = None,
    end_date: str | None = None,
    max_cloud_pct: float = 20,
) -> Dict[str, float | str | int | None]:
    sat = get_satellite_features(
        polygon=polygon,
        start_date=start_date,
        end_date=end_date,
        max_cloud_pct=max_cloud_pct,
    )
    weather = get_weather_features(polygon)

    liters_per_tree = compute_fao56_liters_per_tree(weather["et0_week"], weather["rain_week"])
    total_m3 = round((liters_per_tree * tree_count) / 1000, 3)
    recommendation = build_recommendation(liters_per_tree)

    explanation = (
        f"NDVI is {sat['ndvi_current']} with delta {sat['ndvi_delta']}. "
        f"Weekly ET0 is {weather['et0_week']} and rain is {weather['rain_week']}. "
        f"Recommended action: {recommendation}."
    )

    return {
        "farm_id": farm_id,
        **sat,
        **weather,
        "liters_per_tree": liters_per_tree,
        "total_m3": total_m3,
        "recommendation": recommendation,
        "explanation": explanation,
    }
