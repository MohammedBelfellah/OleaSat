"use client";

import { useEffect } from "react";

import { LatLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";

import type { WaterStressMapCell } from "@/lib/api";

type WaterStressMapProps = {
  cells: WaterStressMapCell[];
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [31.7917, -7.0926];
const DEFAULT_ZOOM = 6;

function toLatLng(point: number[]): [number, number] {
  return [point[1], point[0]];
}

function stressColor(stressLevel: string): string {
  const level = stressLevel.toUpperCase();
  if (level.includes("HIGH")) return "#d84f3f";
  if (level.includes("MEDIUM")) return "#e3a625";
  return "#76a94d";
}

function FitToCells({ cells }: { cells: WaterStressMapCell[] }) {
  const map = useMap();

  useEffect(() => {
    if (cells.length === 0) return;

    const allPoints = cells.flatMap((cell) => cell.polygon).map((point) => toLatLng(point));
    if (allPoints.length === 0) return;

    const bounds = new LatLngBounds(allPoints);
    map.fitBounds(bounds.pad(0.2));
  }, [cells, map]);

  return null;
}

function WaterStressLegend() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 20,
        right: 20,
        backgroundColor: "white",
        border: "1px solid #ccc",
        borderRadius: 8,
        padding: 12,
        zIndex: 400,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        fontSize: 12,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8, color: "#333" }}>Water Stress Level</div>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#d84f3f",
              borderRadius: 2,
            }}
          />
          <span style={{ color: "#555" }}>High Stress</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#e3a625",
              borderRadius: 2,
            }}
          />
          <span style={{ color: "#555" }}>Medium Stress</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 16,
              height: 16,
              backgroundColor: "#76a94d",
              borderRadius: 2,
            }}
          />
          <span style={{ color: "#555" }}>Low Stress</span>
        </div>
      </div>
    </div>
  );
}

export default function WaterStressMap({ cells, className }: WaterStressMapProps) {
  const center = cells.length > 0 ? toLatLng(cells[0].centroid) : DEFAULT_CENTER;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapContainer className={className} center={center} zoom={DEFAULT_ZOOM} scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="OleaSat"
        />

        <FitToCells cells={cells} />

        {cells.map((cell) => {
          const color = stressColor(cell.stress_level);
          return (
            <Polygon
              key={cell.id}
              positions={cell.polygon.map((point) => toLatLng(point))}
              pathOptions={{ color, fillColor: color, fillOpacity: 0.35, weight: 1.2 }}
            >
              <Tooltip sticky>
                <div>
                  <div>{cell.stress_level}</div>
                  <div>NDMI: {cell.ndmi.toFixed(2)}</div>
                  <div>Priority: {cell.water_priority}</div>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {cells.map((cell) => (
          <CircleMarker
            key={`${cell.id}-centroid`}
            center={toLatLng(cell.centroid)}
            radius={3}
            pathOptions={{ color: "#1f2f17", fillColor: "#e8f4d8", fillOpacity: 0.95, weight: 1 }}
          />
        ))}
      </MapContainer>
      <WaterStressLegend />
    </div>
  );
}
