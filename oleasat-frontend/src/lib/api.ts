export type HealthResponse = {
  status: string;
  db: string;
};

const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

export const API_BASE_URL = (configuredBaseUrl || "http://localhost:8001/api/v1").replace(
  /\/$/,
  "",
);

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health request failed (${response.status})`);
  }

  return (await response.json()) as HealthResponse;
}
