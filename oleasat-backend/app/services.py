from __future__ import annotations

import hashlib
import logging
import math
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import requests

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

NDMI_MAP_EVALSCRIPT = """
//VERSION=3
function setup() {
    return {
        input: [{
            bands: ["B04", "B08", "B11", "SCL", "dataMask"],
            units: "DN"
        }],
        output: {
            bands: 3,
            sampleType: "FLOAT32"
        }
    };
}

function evaluatePixel(samples) {
    // Mask noData + cloud + cloud shadow + water + snow
    let dominated = [0, 1, 3, 6, 8, 9, 10];
    let valid = samples.dataMask && !dominated.includes(samples.SCL) ? 1 : 0;

    if (valid === 0) {
        return [0, 0, 0];
    }

    let ndmi = (samples.B08 - samples.B11) / (samples.B08 + samples.B11 + 1e-10);
    let ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04 + 1e-10);

    return [ndmi, ndvi, 1];
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


def _stress_from_ndmi(ndmi: float) -> Dict[str, Any]:
    """Convert NDMI into a stress level and irrigation multiplier."""
    if ndmi < 0.05:
        level = "HIGH"
        factor = 1.25
    elif ndmi < 0.18:
        level = "MEDIUM"
        factor = 1.10
    else:
        level = "LOW"
        factor = 0.90

    score = max(0.0, min(1.0, (0.25 - ndmi) / 0.5))
    return {
        "stress_level": level,
        "water_priority": level,
        "irrigation_factor": factor,
        "stress_score": round(score, 4),
    }


def _grid_size_from_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float, grid_size: int) -> tuple[int, int]:
    """Compute raster width/height preserving bbox aspect ratio."""
    lon_span = max(max_lon - min_lon, 1e-6)
    lat_span = max(max_lat - min_lat, 1e-6)

    if lon_span >= lat_span:
        width = grid_size
        height = max(6, int(round(grid_size * (lat_span / lon_span))))
    else:
        height = grid_size
        width = max(6, int(round(grid_size * (lon_span / lat_span))))

    return width, height


def _mock_water_stress_map(
    polygon: List[List[float]],
    start_date: str,
    end_date: str,
    max_cloud_pct: float,
    grid_size: int,
    note: str,
) -> Dict[str, Any]:
    """Deterministic mock spatial map used when Sentinel Hub is unavailable."""
    ring = _ensure_closed_ring(polygon)
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)

    width, height = _grid_size_from_bbox(min_lon, min_lat, max_lon, max_lat, grid_size)

    try:
        from shapely.geometry import Point, Polygon as ShapelyPolygon

        poly = ShapelyPolygon(ring)
        lon_step = (max_lon - min_lon) / width
        lat_step = (max_lat - min_lat) / height

        cells: List[Dict[str, Any]] = []
        for row in range(height):
            for col in range(width):
                cx = min_lon + (col + 0.5) * lon_step
                cy = max_lat - (row + 0.5) * lat_step

                if not poly.covers(Point(cx, cy)):
                    continue

                digest = hashlib.sha256(f"{start_date}|{end_date}|{row}|{col}|{cx:.6f}|{cy:.6f}".encode("utf-8")).hexdigest()
                seed = int(digest[:8], 16)

                ndmi = -0.12 + (seed % 6200) / 10000
                ndvi = max(min(ndmi + 0.26, 0.85), 0.1)
                stress = _stress_from_ndmi(ndmi)

                x0 = min_lon + col * lon_step
                x1 = x0 + lon_step
                y1 = max_lat - row * lat_step
                y0 = y1 - lat_step

                cells.append({
                    "id": f"r{row}_c{col}",
                    "polygon": [
                        [round(x0, 6), round(y0, 6)],
                        [round(x1, 6), round(y0, 6)],
                        [round(x1, 6), round(y1, 6)],
                        [round(x0, 6), round(y1, 6)],
                        [round(x0, 6), round(y0, 6)],
                    ],
                    "centroid": [round(cx, 6), round(cy, 6)],
                    "ndmi": round(float(ndmi), 4),
                    "ndvi": round(float(ndvi), 4),
                    **stress,
                })

        if not cells:
            return {
                "source": "mock",
                "note": f"No valid in-polygon cells. {note}",
                "window_start": start_date,
                "window_end": end_date,
                "max_cloud_pct": round(float(max_cloud_pct), 2),
                "grid_width": width,
                "grid_height": height,
                "legend": {
                    "HIGH": "Red = high water stress, irrigate first",
                    "MEDIUM": "Orange = medium stress",
                    "LOW": "Green = low stress",
                },
                "summary": {
                    "cells_total": width * height,
                    "cells_in_polygon": 0,
                    "high_stress_cells": 0,
                    "medium_stress_cells": 0,
                    "low_stress_cells": 0,
                    "avg_ndmi": 0.0,
                    "avg_ndvi": 0.0,
                    "avg_stress_score": 0.0,
                },
                "cells": [],
            }

        high = sum(1 for c in cells if c["stress_level"] == "HIGH")
        medium = sum(1 for c in cells if c["stress_level"] == "MEDIUM")
        low = sum(1 for c in cells if c["stress_level"] == "LOW")

        avg_ndmi = sum(c["ndmi"] for c in cells) / len(cells)
        avg_ndvi = sum(c["ndvi"] for c in cells) / len(cells)
        avg_stress = sum(c["stress_score"] for c in cells) / len(cells)

        return {
            "source": "mock",
            "note": note,
            "window_start": start_date,
            "window_end": end_date,
            "max_cloud_pct": round(float(max_cloud_pct), 2),
            "grid_width": width,
            "grid_height": height,
            "legend": {
                "HIGH": "Red = high water stress, irrigate first",
                "MEDIUM": "Orange = medium stress",
                "LOW": "Green = low stress",
            },
            "summary": {
                "cells_total": width * height,
                "cells_in_polygon": len(cells),
                "high_stress_cells": high,
                "medium_stress_cells": medium,
                "low_stress_cells": low,
                "avg_ndmi": round(avg_ndmi, 4),
                "avg_ndvi": round(avg_ndvi, 4),
                "avg_stress_score": round(avg_stress, 4),
            },
            "cells": cells,
        }
    except Exception as exc:
        logger.warning("Mock water stress map failed: %s", exc)
        return {
            "source": "mock",
            "note": f"Mock map failed: {exc}",
            "window_start": start_date,
            "window_end": end_date,
            "max_cloud_pct": round(float(max_cloud_pct), 2),
            "grid_width": 0,
            "grid_height": 0,
            "legend": {
                "HIGH": "Red = high water stress, irrigate first",
                "MEDIUM": "Orange = medium stress",
                "LOW": "Green = low stress",
            },
            "summary": {
                "cells_total": 0,
                "cells_in_polygon": 0,
                "high_stress_cells": 0,
                "medium_stress_cells": 0,
                "low_stress_cells": 0,
                "avg_ndmi": 0.0,
                "avg_ndvi": 0.0,
                "avg_stress_score": 0.0,
            },
            "cells": [],
        }


def get_water_stress_map(
    polygon: List[List[float]],
    start_date: str | None = None,
    end_date: str | None = None,
    max_cloud_pct: float = 20,
    grid_size: int = 20,
) -> Dict[str, Any]:
    """Return a spatial NDMI/NDVI stress map over the farm area.

    Output is designed for frontend map rendering (Leaflet/Mapbox) with
    per-cell polygons and stress classes.
    """
    resolved_start, resolved_end = _default_dates()
    start_date = start_date or resolved_start
    end_date = end_date or resolved_end
    grid_size = max(8, min(40, int(grid_size)))

    ring = _ensure_closed_ring(polygon)
    lons = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    width, height = _grid_size_from_bbox(min_lon, min_lat, max_lon, max_lat, grid_size)

    sh_config, data_collection = _get_sh_config()
    if sh_config is None:
        return _mock_water_stress_map(
            ring,
            start_date,
            end_date,
            max_cloud_pct,
            grid_size,
            "Sentinel Hub not configured; returning deterministic mock map",
        )

    try:
        from shapely.geometry import Point, Polygon as ShapelyPolygon
        from sentinelhub import BBox, CRS, MimeType, SentinelHubRequest

        poly = ShapelyPolygon(ring)
        bbox = BBox(bbox=[min_lon, min_lat, max_lon, max_lat], crs=CRS.WGS84)

        request = SentinelHubRequest(
            evalscript=NDMI_MAP_EVALSCRIPT,
            input_data=[
                SentinelHubRequest.input_data(
                    data_collection=data_collection,
                    time_interval=(start_date, end_date),
                    maxcc=max_cloud_pct / 100,
                )
            ],
            responses=[SentinelHubRequest.output_response("default", MimeType.TIFF)],
            bbox=bbox,
            size=(width, height),
            config=sh_config,
        )

        image = request.get_data()[0]

        if image is None or len(image) == 0:
            return _mock_water_stress_map(
                ring,
                start_date,
                end_date,
                max_cloud_pct,
                grid_size,
                "Sentinel Hub returned empty image",
            )

        h = len(image)
        w = len(image[0]) if h else 0
        if h == 0 or w == 0:
            return _mock_water_stress_map(
                ring,
                start_date,
                end_date,
                max_cloud_pct,
                grid_size,
                "Sentinel Hub returned invalid image dimensions",
            )

        lon_step = (max_lon - min_lon) / w
        lat_step = (max_lat - min_lat) / h

        cells: List[Dict[str, Any]] = []
        for row in range(h):
            for col in range(w):
                pixel = image[row][col]
                ndmi = float(pixel[0])
                ndvi = float(pixel[1])
                mask = float(pixel[2])

                if mask < 0.5 or math.isnan(ndmi) or math.isnan(ndvi):
                    continue

                cx = min_lon + (col + 0.5) * lon_step
                cy = max_lat - (row + 0.5) * lat_step
                if not poly.covers(Point(cx, cy)):
                    continue

                x0 = min_lon + col * lon_step
                x1 = x0 + lon_step
                y1 = max_lat - row * lat_step
                y0 = y1 - lat_step

                stress = _stress_from_ndmi(ndmi)

                cells.append({
                    "id": f"r{row}_c{col}",
                    "polygon": [
                        [round(x0, 6), round(y0, 6)],
                        [round(x1, 6), round(y0, 6)],
                        [round(x1, 6), round(y1, 6)],
                        [round(x0, 6), round(y1, 6)],
                        [round(x0, 6), round(y0, 6)],
                    ],
                    "centroid": [round(cx, 6), round(cy, 6)],
                    "ndmi": round(ndmi, 4),
                    "ndvi": round(ndvi, 4),
                    **stress,
                })

        if not cells:
            return _mock_water_stress_map(
                ring,
                start_date,
                end_date,
                max_cloud_pct,
                grid_size,
                "No valid pixels after masking clouds and clipping polygon",
            )

        high = sum(1 for c in cells if c["stress_level"] == "HIGH")
        medium = sum(1 for c in cells if c["stress_level"] == "MEDIUM")
        low = sum(1 for c in cells if c["stress_level"] == "LOW")
        avg_ndmi = sum(c["ndmi"] for c in cells) / len(cells)
        avg_ndvi = sum(c["ndvi"] for c in cells) / len(cells)
        avg_stress = sum(c["stress_score"] for c in cells) / len(cells)

        return {
            "source": "sentinel_hub",
            "note": None,
            "window_start": start_date,
            "window_end": end_date,
            "max_cloud_pct": round(float(max_cloud_pct), 2),
            "grid_width": w,
            "grid_height": h,
            "legend": {
                "HIGH": "Red = high water stress, irrigate first",
                "MEDIUM": "Orange = medium stress",
                "LOW": "Green = low stress",
            },
            "summary": {
                "cells_total": w * h,
                "cells_in_polygon": len(cells),
                "high_stress_cells": high,
                "medium_stress_cells": medium,
                "low_stress_cells": low,
                "avg_ndmi": round(avg_ndmi, 4),
                "avg_ndvi": round(avg_ndvi, 4),
                "avg_stress_score": round(avg_stress, 4),
            },
            "cells": cells,
        }
    except Exception as exc:
        logger.error("Water stress map query failed: %s", exc)
        return _mock_water_stress_map(
            ring,
            start_date,
            end_date,
            max_cloud_pct,
            grid_size,
            f"Sentinel Hub map query failed: {exc}",
        )


# ---------------------------------------------------------------------------
# Weather data – Open-Meteo client (Spec §3.3)
# ---------------------------------------------------------------------------

# In-memory cache: key = (round(lat,2), round(lon,2), iso_date) → (timestamp, data)
_weather_cache: Dict[Tuple[float, float, str], Tuple[float, Dict[str, Any]]] = {}
_WEATHER_CACHE_TTL = 6 * 3600  # 6 hours in seconds

# Seasonal fallback ET₀ averages (mm/day) by month for Morocco (semi-arid)
# Used when Open-Meteo is persistently unreachable
_SEASONAL_ET0_FALLBACK: Dict[int, float] = {
    1: 1.8, 2: 2.5, 3: 3.5, 4: 4.5, 5: 5.5, 6: 6.5,
    7: 7.0, 8: 6.5, 9: 5.0, 10: 3.5, 11: 2.5, 12: 1.8,
}


def _polygon_centroid(polygon: List[List[float]]) -> tuple[float, float]:
    """Return (lat, lon) centroid of a polygon."""
    lons = [p[0] for p in polygon]
    lats = [p[1] for p in polygon]
    return sum(lats) / len(lats), sum(lons) / len(lons)


def _fetch_open_meteo(lat: float, lon: float) -> Dict[str, Any]:
    """Call Open-Meteo API with retry on 5xx (3 attempts, exponential backoff, max ~8s)."""
    url = settings.open_meteo_base_url
    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "daily": "et0_fao_evapotranspiration,precipitation_sum",
        "forecast_days": 7,
        "timezone": "Africa/Casablanca",
    }

    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            resp = requests.get(url, params=params, timeout=10)
            if resp.status_code < 500:
                resp.raise_for_status()
                return resp.json()
            # 5xx → retry
            last_exc = Exception(f"Open-Meteo returned {resp.status_code}")
        except requests.RequestException as exc:
            last_exc = exc

        # Exponential backoff: 1s, 2s, 4s (total ≤ 7s)
        if attempt < 2:
            time.sleep(2 ** attempt)

    raise last_exc or Exception("Open-Meteo request failed after 3 attempts")


def _weather_fallback() -> Dict[str, Any]:
    """Return hardcoded seasonal average when Open-Meteo is unreachable."""
    month = datetime.now(tz=timezone.utc).month
    et0_day = _SEASONAL_ET0_FALLBACK.get(month, 4.0)
    return {
        "et0_daily": [et0_day] * 7,
        "rain_daily": [0.0] * 7,
        "source_weather": "fallback_seasonal",
    }


def get_weather_features(polygon: List[List[float]]) -> Dict[str, Any]:
    """Fetch 7-day ET₀ and rainfall from Open-Meteo (Spec §3.3).

    - Caches per (lat_2dp, lon_2dp, date) for 6 hours.
    - Retries 5xx 3× with exponential backoff.
    - Falls back to seasonal average on persistent failure.
    """
    lat, lon = _polygon_centroid(polygon)
    today_iso = datetime.now(tz=timezone.utc).date().isoformat()
    cache_key = (round(lat, 2), round(lon, 2), today_iso)

    # Check cache
    if cache_key in _weather_cache:
        cached_ts, cached_data = _weather_cache[cache_key]
        if time.time() - cached_ts < _WEATHER_CACHE_TTL:
            logger.debug("Weather cache hit for %s", cache_key)
            return cached_data

    try:
        raw = _fetch_open_meteo(lat, lon)
        daily = raw.get("daily", {})
        et0_daily = daily.get("et0_fao_evapotranspiration", [])
        rain_daily = daily.get("precipitation_sum", [])

        # Pad to 7 days if API returns fewer
        et0_daily = (et0_daily + [0.0] * 7)[:7]
        rain_daily = (rain_daily + [0.0] * 7)[:7]

        # Replace None values with 0.0
        et0_daily = [v if v is not None else 0.0 for v in et0_daily]
        rain_daily = [v if v is not None else 0.0 for v in rain_daily]

        result = {
            "et0_daily": et0_daily,
            "rain_daily": rain_daily,
            "source_weather": "open_meteo",
        }

        # Store in cache
        _weather_cache[cache_key] = (time.time(), result)
        logger.info("Open-Meteo OK for (%.2f, %.2f): ET₀=%s rain=%s",
                    lat, lon, et0_daily, rain_daily)
        return result

    except Exception as exc:
        logger.error("Open-Meteo failed for (%.4f, %.4f): %s — using seasonal fallback", lat, lon, exc)
        fallback = _weather_fallback()
        _weather_cache[cache_key] = (time.time(), fallback)
        return fallback


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
