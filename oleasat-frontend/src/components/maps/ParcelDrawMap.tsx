"use client";

import { useEffect } from "react";

import { DivIcon, LatLngBounds } from "leaflet";
import {
  MapContainer,
  Marker,
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
  onMovePoint?: (index: number, point: LonLat) => void;
  className?: string;
};

const DEFAULT_CENTER: [number, number] = [35.2, -5.3];
const DEFAULT_ZOOM = 7;
const vertexIcon = new DivIcon({
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
  html: '<span style="display:block;width:14px;height:14px;border-radius:999px;border:2px solid #284118;background:#8bb765;"></span>',
});

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

export default function ParcelDrawMap({ points, onAddPoint, onMovePoint, className }: ParcelDrawMapProps) {
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
        <Marker
          key={`${position[0]}-${position[1]}-${index}`}
          position={position}
          icon={vertexIcon}
          draggable={Boolean(onMovePoint)}
          eventHandlers={
            onMovePoint
              ? {
                  dragend(event) {
                    const marker = event.target;
                    const next = marker.getLatLng();
                    onMovePoint(index, [next.lng, next.lat]);
                  },
                }
              : undefined
          }
        />
      ))}
    </MapContainer>
  );
}
