"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import styles from "./page.module.css";
import { ApiError, type RegisterFarmRequest, registerFarm } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const SAMPLE_POLYGON: number[][] = [
  [-3.8895, 37.7798],
  [-3.8634, 37.7898],
  [-3.8453, 37.7714],
  [-3.8521, 37.7446],
  [-3.8824, 37.7439],
];

const INITIAL_FORM: RegisterFarmRequest = {
  farmer_name: "Oliveira Nord",
  phone: "+212600000000",
  crop_type: "olive",
  tree_age: "ADULT",
  soil_type: "MEDIUM",
  tree_count: 120,
  spacing_m2: 100,
  irrigation_efficiency: 0.9,
  polygon: SAMPLE_POLYGON,
};

function prettyPolygon(points: number[][]): string {
  return JSON.stringify(points, null, 2);
}

function parsePolygonInput(raw: string): number[][] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error("Polygon must be an array of at least 3 [lon, lat] points.");
  }

  const points = parsed.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error("Each point must be [longitude, latitude].");
    }

    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error("Polygon coordinates must be numbers.");
    }
    return [lon, lat];
  });

  return points;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail === "Invalid or expired token") {
      return "Session expired. Login again and retry farm registration.";
    }
    if (error.detail.includes("incomplete_profile")) {
      return "Backend reported an incomplete profile payload. Verify polygon and numeric fields.";
    }
    return `${error.detail} (HTTP ${error.status})`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected farm registration error";
}

export default function FarmRegistrationPage() {
  const [farmerName, setFarmerName] = useState(INITIAL_FORM.farmer_name);
  const [phone, setPhone] = useState(INITIAL_FORM.phone);
  const [cropType, setCropType] = useState(INITIAL_FORM.crop_type);
  const [treeAge, setTreeAge] = useState<RegisterFarmRequest["tree_age"]>(INITIAL_FORM.tree_age);
  const [soilType, setSoilType] = useState<RegisterFarmRequest["soil_type"]>(INITIAL_FORM.soil_type);
  const [treeCount, setTreeCount] = useState(String(INITIAL_FORM.tree_count));
  const [spacingM2, setSpacingM2] = useState(String(INITIAL_FORM.spacing_m2));
  const [irrigationEfficiency, setIrrigationEfficiency] = useState(String(INITIAL_FORM.irrigation_efficiency));
  const [polygonText, setPolygonText] = useState(prettyPolygon(INITIAL_FORM.polygon));

  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [farmId, setFarmId] = useState<string | null>(null);

  const pointCount = useMemo(() => {
    try {
      return parsePolygonInput(polygonText).length;
    } catch {
      return 0;
    }
  }, [polygonText]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFarmId(null);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No access token found. Login first before creating a farm.");
      }

      const payload: RegisterFarmRequest = {
        farmer_name: farmerName.trim(),
        phone: phone.trim(),
        crop_type: cropType.trim() || "olive",
        tree_age: treeAge,
        soil_type: soilType,
        tree_count: Number(treeCount),
        spacing_m2: Number(spacingM2),
        irrigation_efficiency: Number(irrigationEfficiency),
        polygon: parsePolygonInput(polygonText),
      };

      if (!payload.farmer_name || payload.farmer_name.length < 2) {
        throw new Error("Farmer name must contain at least 2 characters.");
      }
      if (!payload.phone || payload.phone.length < 6) {
        throw new Error("Phone must contain at least 6 characters.");
      }
      if (!Number.isInteger(payload.tree_count) || payload.tree_count < 1) {
        throw new Error("Tree count must be an integer greater than or equal to 1.");
      }
      if (!Number.isFinite(payload.spacing_m2) || payload.spacing_m2 <= 0) {
        throw new Error("Spacing must be a positive number.");
      }
      if (!Number.isFinite(payload.irrigation_efficiency) || payload.irrigation_efficiency < 0.5 || payload.irrigation_efficiency > 1) {
        throw new Error("Irrigation efficiency must be between 0.5 and 1.0.");
      }

      const response = await registerFarm(token, payload);
      setFarmId(response.farm_id);
      setSuccessMessage(response.message || "Farm registered successfully.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <section className={styles.sidebar}>
          <header className={styles.sidebarHeader}>
            <p className={styles.kicker}>Step 3</p>
            <h1>Register A New Farm</h1>
            <p>
              This screen sends your farm parameters and polygon directly to <code>POST /api/v1/register</code>.
            </p>
          </header>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label htmlFor="farmer-name">Farmer name</label>
              <input
                id="farmer-name"
                value={farmerName}
                onChange={(event) => setFarmerName(event.target.value)}
                required
                minLength={2}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className={styles.twoCols}>
              <div className={styles.field}>
                <label htmlFor="crop-type">Crop type</label>
                <input
                  id="crop-type"
                  value={cropType}
                  onChange={(event) => setCropType(event.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="tree-count">Tree count</label>
                <input
                  id="tree-count"
                  type="number"
                  min={1}
                  step={1}
                  value={treeCount}
                  onChange={(event) => setTreeCount(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.twoCols}>
              <div className={styles.field}>
                <label htmlFor="tree-age">Tree age</label>
                <select
                  id="tree-age"
                  value={treeAge}
                  onChange={(event) => setTreeAge(event.target.value as RegisterFarmRequest["tree_age"])}
                >
                  <option value="ADULT">ADULT</option>
                  <option value="YOUNG">YOUNG</option>
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="soil-type">Soil type</label>
                <select
                  id="soil-type"
                  value={soilType}
                  onChange={(event) => setSoilType(event.target.value as RegisterFarmRequest["soil_type"])}
                >
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="SANDY">SANDY</option>
                  <option value="CLAY">CLAY</option>
                </select>
              </div>
            </div>

            <div className={styles.twoCols}>
              <div className={styles.field}>
                <label htmlFor="spacing">Spacing (m2)</label>
                <input
                  id="spacing"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={spacingM2}
                  onChange={(event) => setSpacingM2(event.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="efficiency">Irrigation efficiency</label>
                <input
                  id="efficiency"
                  type="number"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={irrigationEfficiency}
                  onChange={(event) => setIrrigationEfficiency(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="polygon">Polygon coordinates (JSON array of [lon, lat])</label>
              <textarea
                id="polygon"
                value={polygonText}
                onChange={(event) => setPolygonText(event.target.value)}
                rows={9}
                spellCheck={false}
                required
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.primaryButton} disabled={pending} type="submit">
                {pending ? "Registering farm..." : "Confirm and register"}
              </button>
              <button
                className={styles.secondaryButton}
                onClick={() => setPolygonText(prettyPolygon(SAMPLE_POLYGON))}
                type="button"
              >
                Use sample polygon
              </button>
            </div>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}
            {successMessage && <p className={styles.success}>{successMessage}</p>}
            {farmId && (
              <p className={styles.meta}>
                Created farm ID: <code>{farmId}</code>
              </p>
            )}
          </form>

          <div className={styles.links}>
            <Link href="/auth/me">Back to profile</Link>
            <Link href="/">Home</Link>
          </div>
        </section>

        <section className={styles.mapMock}>
          <header className={styles.mapHeader}>
            <p>Parcel Draft</p>
            <span>{pointCount} points</span>
          </header>

          <div className={styles.mapCanvas}>
            <div className={styles.hex}></div>
            <div className={styles.hexOutline}></div>
            <div className={styles.pin}></div>
            <div className={styles.bottomHint}>
              Map drawing integration can be added next with Leaflet or Google Maps.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
