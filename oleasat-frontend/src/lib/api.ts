export type HealthResponse = {
  status: string;
  db: string;
};

export type AuthRegisterRequest = {
  email: string;
  password: string;
  full_name?: string;
};

export type AuthLoginRequest = {
  email: string;
  password: string;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  full_name?: string | null;
  role: string;
};

export type UserOut = {
  id: string;
  email: string;
  full_name?: string | null;
  role: string;
  is_active: boolean;
  created_at?: string | null;
};

export type TreeAge = "YOUNG" | "ADULT";
export type SoilType = "SANDY" | "MEDIUM" | "CLAY";

export type RegisterFarmRequest = {
  farmer_name: string;
  phone: string;
  crop_type: string;
  tree_age: TreeAge;
  soil_type: SoilType;
  tree_count: number;
  spacing_m2: number;
  irrigation_efficiency: number;
  polygon: number[][];
};

export type RegisterFarmResponse = {
  farm_id: string;
  message: string;
};

export type MetricsSummaryResponse = {
  farmers_active: number;
  alerts_sent_this_week: number;
  avg_litres_per_tree: number;
};

export type FarmListItem = {
  id: string;
  farmer_name?: string | null;
  phone?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tree_age?: string | null;
  soil_type?: string | null;
  tree_count?: number | null;
  spacing_m2?: number | null;
  irrigation_efficiency?: number | null;
  telegram_linked: boolean;
  created_at?: string | null;
  last_alert_at?: string | null;
};

export type AlertSnapshot = {
  id: string;
  sent_at: string;
  et0_weekly_mm: number;
  rain_weekly_mm: number;
  kc_applied: number;
  litres_per_tree: number;
  total_litres: number;
  stress_mode: boolean;
  ndvi_current?: number | null;
  ndvi_delta?: number | null;
  ndmi_current?: number | null;
  irrigation_efficiency?: number | null;
  delivery_status: string;
};

export type FarmDetailResponse = {
  farm: FarmListItem;
  last_alert?: AlertSnapshot | null;
};

export type MetricsFarmerResponse = {
  farmer: {
    id: string;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    tree_age?: string | null;
    soil_type?: string | null;
    tree_count?: number | null;
    spacing_m2?: number | null;
    irrigation_efficiency?: number | null;
    created_at?: string | null;
    last_alert_at?: string | null;
  };
  alerts: AlertSnapshot[];
};

export type CalculateResponse = {
  farm_id: string;
  ndvi_current: number;
  ndvi_delta: number;
  ndmi_current: number;
  cloud_pct: number;
  date_used: string;
  images_used: number;
  source: string;
  note?: string | null;
  window_start: string;
  window_end: string;
  et0_week: number;
  rain_week: number;
  p_eff: number;
  kc_applied: number;
  ir_mm: number;
  phase_label: string;
  is_critical_phase: boolean;
  soil_factor: number;
  irrigation_efficiency: number;
  litres_per_tree_net: number;
  total_litres_net: number;
  litres_per_tree: number;
  total_litres: number;
  total_m3: number;
  stress_mode: boolean;
  survival_litres?: number | null;
  recommendation: string;
  explanation: string;
  from_cache?: boolean;
  cached_at?: string | null;
};

export type LatestFarmAnalysisResponse = {
  farm_id: string;
  generated_at: string;
  analysis: CalculateResponse;
};

export type WaterStressMapCell = {
  id: string;
  polygon: number[][];
  centroid: number[];
  ndmi: number;
  ndvi: number;
  stress_score: number;
  stress_level: string;
  water_priority: string;
  irrigation_factor: number;
};

export type WaterStressSummary = {
  cells_total: number;
  cells_in_polygon: number;
  high_stress_cells: number;
  medium_stress_cells: number;
  low_stress_cells: number;
  avg_ndmi: number;
  avg_ndvi: number;
  avg_stress_score: number;
};

export type WaterStressMapResponse = {
  farm_id: string;
  source: string;
  note?: string | null;
  window_start: string;
  window_end: string;
  max_cloud_pct: number;
  grid_width: number;
  grid_height: number;
  legend: Record<string, string>;
  summary: WaterStressSummary;
  cells: WaterStressMapCell[];
  from_cache?: boolean;
  cached_at?: string | null;
};

export type WaterMapQuery = {
  start_date?: string;
  end_date?: string;
  max_cloud_pct?: number;
  grid_size?: number;
  force_refresh?: boolean;
};

type ApiErrorPayload = {
  detail?: unknown;
};

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:8001/api/v1").replace(
  /\/$/,
  "",
);

async function asApiError(response: Response): Promise<ApiError> {
  let detail = `Request failed (${response.status})`;

  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (payload.detail !== undefined) {
      if (typeof payload.detail === "string") {
        detail = payload.detail;
      } else {
        detail = JSON.stringify(payload.detail);
      }
    }
  } catch {
    // Keep default detail for non-JSON responses.
  }

  return new ApiError(response.status, detail);
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }
  
  return (await response.json()) as HealthResponse;
}

export async function authRegister(
  payload: AuthRegisterRequest,
  signal?: AbortSignal,
): Promise<AuthTokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as AuthTokenResponse;
}

export async function authLogin(
  payload: AuthLoginRequest,
  signal?: AbortSignal,
): Promise<AuthTokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as AuthTokenResponse;
}

export async function authMe(token: string, signal?: AbortSignal): Promise<UserOut> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as UserOut;
}

export async function registerFarm(
  token: string,
  payload: RegisterFarmRequest,
  signal?: AbortSignal,
): Promise<RegisterFarmResponse> {
  const response = await fetch(`${API_BASE_URL}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as RegisterFarmResponse;
}

export async function fetchMetricsSummary(
  token: string,
  signal?: AbortSignal,
): Promise<MetricsSummaryResponse> {
  const response = await fetch(`${API_BASE_URL}/metrics/summary`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as MetricsSummaryResponse;
}

export async function fetchMetricsFarmer(
  token: string,
  farmerId: string,
  signal?: AbortSignal,
): Promise<MetricsFarmerResponse> {
  const response = await fetch(`${API_BASE_URL}/metrics/farmer/${farmerId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as MetricsFarmerResponse;
}

export async function fetchFarms(token: string, signal?: AbortSignal): Promise<FarmListItem[]> {
  const response = await fetch(`${API_BASE_URL}/farms`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as FarmListItem[];
}

export async function fetchFarmDetail(
  token: string,
  farmId: string,
  signal?: AbortSignal,
): Promise<FarmDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/farms/${farmId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as FarmDetailResponse;
}

export async function calculateIrrigation(
  token: string,
  farmerId: string,
  options?: { forceRefresh?: boolean; signal?: AbortSignal },
): Promise<CalculateResponse> {
  const params = new URLSearchParams();
  if (options?.forceRefresh) {
    params.set("force_refresh", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/calculate${suffix}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    body: JSON.stringify({ farmer_id: farmerId }),
    signal: options?.signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as CalculateResponse;
}

export async function fetchLatestFarmAnalysis(
  token: string,
  farmId: string,
  signal?: AbortSignal,
): Promise<LatestFarmAnalysisResponse> {
  const response = await fetch(`${API_BASE_URL}/farms/${farmId}/latest-analysis`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as LatestFarmAnalysisResponse;
}

export async function fetchFarmWaterMap(
  token: string,
  farmId: string,
  query?: WaterMapQuery,
  signal?: AbortSignal,
): Promise<WaterStressMapResponse> {
  const params = new URLSearchParams();

  if (query?.start_date) params.set("start_date", query.start_date);
  if (query?.end_date) params.set("end_date", query.end_date);
  if (query?.max_cloud_pct !== undefined) params.set("max_cloud_pct", String(query.max_cloud_pct));
  if (query?.grid_size !== undefined) params.set("grid_size", String(query.grid_size));
  if (query?.force_refresh) params.set("force_refresh", "true");

  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/farms/${farmId}/water-map${suffix}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw await asApiError(response);
  }

  return (await response.json()) as WaterStressMapResponse;
}
