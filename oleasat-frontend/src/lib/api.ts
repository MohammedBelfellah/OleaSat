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

export type StatusMessageResponse = {
  status: string;
  message: string;
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

export type TelegramLinkResponse = {
  farmer_id: string;
  telegram_link: string;
  linked: boolean;
};

export type TelegramOwnerLinkResponse = {
  owner_id: string;
  telegram_link: string;
  linked: boolean;
  farms_count: number;
};

export type TelegramDirectMessageRequest = {
  farmer_id: string;
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

export type AnalyzeRequest = {
  farm_id: string;
  polygon: number[][];
  tree_count?: number;
  tree_age?: TreeAge;
  soil_type?: SoilType;
  spacing_m2?: number;
  irrigation_efficiency?: number;
  start_date?: string;
  end_date?: string;
  max_cloud_pct?: number;
};

export type AnalyzeResponse = CalculateResponse;

export type SatelliteIndicesRequest = {
  polygon: number[][];
  start_date?: string;
  end_date?: string;
  max_cloud_pct?: number;
};

export type SatelliteIndicesResponse = {
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
};

export type LatestFarmAnalysisResponse = {
  farm_id: string;
  generated_at: string;
  analysis: CalculateResponse;
};

export type AnalysisRunItem = {
  id: string;
  farm_id: string;
  farmer_name?: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  recommendation?: string | null;
  litres_per_tree?: number | null;
  total_m3?: number | null;
  stress_mode?: boolean | null;
  has_water_map: boolean;
};

export type AnalysisRunsResponse = {
  runs: AnalysisRunItem[];
};

export type AnalysisRunCreateRequest = {
  farm_id: string;
  start_date?: string;
  end_date?: string;
};

export type AnalysisRunCreateResponse = {
  status: "created" | "existing";
  message: string;
  analysis_id: string;
  farm_id: string;
  start_date: string;
  end_date: string;
};

export type AnalysisRunDetailResponse = {
  id: string;
  farm_id: string;
  farmer_name?: string | null;
  start_date: string;
  end_date: string;
  created_at: string;
  analysis: CalculateResponse;
  water_map: WaterStressMapResponse;
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

export type FeedbackType = "WORKED" | "TOO_MUCH" | "TOO_LITTLE" | "NOT_APPLIED";

export type FeedbackCreateRequest = {
  farmer_id: string;
  alert_id?: string;
  feedback_type: FeedbackType;
  rating?: number;
  comment?: string;
};

export type FeedbackOut = {
  id: string;
  farmer_id: string;
  alert_id?: string | null;
  feedback_type: FeedbackType;
  rating?: number | null;
  comment?: string | null;
  created_at: string;
};

export type FeedbackSummaryResponse = {
  farmer_id: string;
  total_feedback: number;
  worked_count: number;
  too_much_count: number;
  too_little_count: number;
  not_applied_count: number;
  avg_rating: number;
  feedback: FeedbackOut[];
};

export type AdminDashboardResponse = {
  total_farmers: number;
  active_farmers: number;
  total_alerts: number;
  alerts_this_week: number;
  farmers_with_telegram: number;
  avg_litres_per_tree: number;
  total_water_m3: number;
  stress_alerts_count: number;
  urgent_farms: FarmListItem[];
  recent_alerts: Array<{
    id: string;
    farmer_id: string;
    farmer_name: string;
    sent_at: string;
    litres_per_tree: number;
    total_litres: number;
    stress_mode: boolean;
    delivery_status: string;
  }>;
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

export async function deleteFarm(
  token: string,
  farmId: string,
  signal?: AbortSignal,
): Promise<StatusMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/farms/${farmId}`, {
    method: "DELETE",
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

  return (await response.json()) as StatusMessageResponse;
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

export async function fetchAnalysisRuns(
  token: string,
  query?: { farm_id?: string },
  signal?: AbortSignal,
): Promise<AnalysisRunsResponse> {
  const params = new URLSearchParams();
  if (query?.farm_id) params.set("farm_id", query.farm_id);
  const suffix = params.toString() ? `?${params.toString()}` : "";

  const response = await fetch(`${API_BASE_URL}/analysis/runs${suffix}`, {
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

  return (await response.json()) as AnalysisRunsResponse;
}

export async function fetchAnalysisRunDetail(
  token: string,
  analysisId: string,
  signal?: AbortSignal,
): Promise<AnalysisRunDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/analysis/runs/${analysisId}`, {
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

  return (await response.json()) as AnalysisRunDetailResponse;
}

export async function createAnalysisRun(
  token: string,
  payload: AnalysisRunCreateRequest,
  signal?: AbortSignal,
): Promise<AnalysisRunCreateResponse> {
  const response = await fetch(`${API_BASE_URL}/analysis/runs`, {
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

  return (await response.json()) as AnalysisRunCreateResponse;
}

export async function analyzeDirect(
  token: string,
  payload: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
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

  return (await response.json()) as AnalyzeResponse;
}

export async function fetchSatelliteIndices(
  token: string,
  payload: SatelliteIndicesRequest,
  signal?: AbortSignal,
): Promise<SatelliteIndicesResponse> {
  const response = await fetch(`${API_BASE_URL}/satellite/indices`, {
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

  return (await response.json()) as SatelliteIndicesResponse;
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

export async function fetchTelegramLink(
  token: string,
  farmerId: string,
  signal?: AbortSignal,
): Promise<TelegramLinkResponse> {
  const response = await fetch(`${API_BASE_URL}/telegram-link/${farmerId}`, {
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

  return (await response.json()) as TelegramLinkResponse;
}

export async function fetchTelegramLinkMe(
  token: string,
  signal?: AbortSignal,
): Promise<TelegramOwnerLinkResponse> {
  const response = await fetch(`${API_BASE_URL}/telegram-link/me`, {
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

  return (await response.json()) as TelegramOwnerLinkResponse;
}

export async function submitFeedback(
  token: string,
  payload: FeedbackCreateRequest,
  signal?: AbortSignal,
): Promise<FeedbackOut> {
  const response = await fetch(`${API_BASE_URL}/feedback`, {
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

  return (await response.json()) as FeedbackOut;
}

export async function fetchFeedbackSummary(
  token: string,
  farmerId: string,
  signal?: AbortSignal,
): Promise<FeedbackSummaryResponse> {
  const response = await fetch(`${API_BASE_URL}/feedback/farmer/${farmerId}`, {
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

  return (await response.json()) as FeedbackSummaryResponse;
}

export async function fetchAdminDashboard(
  token: string,
  signal?: AbortSignal,
): Promise<AdminDashboardResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
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

  return (await response.json()) as AdminDashboardResponse;
}

export async function fetchAdminFarmers(
  token: string,
  signal?: AbortSignal,
): Promise<FarmListItem[]> {
  const response = await fetch(`${API_BASE_URL}/admin/farmers`, {
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

export async function triggerWeeklyJob(
  token: string,
  signal?: AbortSignal,
): Promise<StatusMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/trigger-weekly`, {
    method: "POST",
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

  return (await response.json()) as StatusMessageResponse;
}

export async function sendAdminTelegramUpdate(
  token: string,
  payload: TelegramDirectMessageRequest,
  signal?: AbortSignal,
): Promise<StatusMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/admin/telegram/send`, {
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

  return (await response.json()) as StatusMessageResponse;
}
