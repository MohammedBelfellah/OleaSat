"use client";

import { useEffect } from "react";

import { LatLngBounds } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

type LonLat = [number, number];

type ParcelDrawMapProps = {
  points: LonLat[];
  onAddPoint: (point: LonLat) => void;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [31.7917, -7.0926];
const DEFAULT_ZOOM = 6;

function toLatLng(point: LonLat): [number, number] {
  return [point[1], point[0]];
}

function ClickCollector({ onAddPoint }: { onAddPoint: (point: LonLat) => void }) {
  useMapEvents({
    click(event) {
      onAddPoint([event.latlng.lng, event.latlng.lat]);
    },
  });

  return null;
}

function FitToPoints({ points }: { points: LonLat[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const bounds = new LatLngBounds(points.map((point) => toLatLng(point)));
    map.fitBounds(bounds.pad(0.25));
  }, [map, points]);

  return null;
}

export default function ParcelDrawMap({ points, onAddPoint, className }: ParcelDrawMapProps) {
  const positions = points.map((point) => toLatLng(point));

  return (
    <MapContainer className={className} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <ClickCollector onAddPoint={onAddPoint} />
      <FitToPoints points={points} />

      {positions.length >= 2 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: "#5d7f3f", weight: 2, opacity: 0.9 }}
        />
      )}

      {positions.length >= 3 && (
        <Polygon
          positions={positions}
          pathOptions={{ color: "#5d7f3f", weight: 2, fillColor: "#8caf66", fillOpacity: 0.24 }}
        />
      )}

      {positions.map((position, index) => (
        <CircleMarker
          key={`${position[0]}-${position[1]}-${index}`}
          center={position}
          radius={6}
          pathOptions={{ color: "#284118", fillColor: "#8bb765", fillOpacity: 0.95, weight: 2 }}
        />
      ))}
    </MapContainer>
  );
}
