from typing import Dict, List


def get_satellite_features(polygon: List[List[float]]) -> Dict[str, float]:
    _ = polygon
    return {
        "ndvi_current": 0.62,
        "ndvi_delta": -0.04,
    }


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


def run_pipeline(farm_id: str, polygon: List[List[float]], tree_count: int) -> Dict[str, float | str]:
    sat = get_satellite_features(polygon)
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
