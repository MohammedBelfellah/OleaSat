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
