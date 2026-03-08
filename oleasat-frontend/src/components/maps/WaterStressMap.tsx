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

export default function WaterStressMap({ cells, className }: WaterStressMapProps) {
  const center = cells.length > 0 ? toLatLng(cells[0].centroid) : DEFAULT_CENTER;

  return (
    <MapContainer className={className} center={center} zoom={DEFAULT_ZOOM} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
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
  );
}
