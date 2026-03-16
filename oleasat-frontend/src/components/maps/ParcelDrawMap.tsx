"use client";

import { useEffect, useRef } from "react";

import L, { DivIcon, LatLngBounds } from "leaflet";
import "leaflet-draw";
import {
  FeatureGroup,
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
  onAddPoint?: (point: LonLat) => void;
  onMovePoint?: (index: number, point: LonLat) => void;
  onChange?: (points: LonLat[]) => void;
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

function fromLayer(layer: L.Layer): LonLat[] {
  if (!(layer instanceof L.Polygon)) {
    return [];
  }

  const latLngs = layer.getLatLngs();
  // Handle both simple polygons [LatLng...] and multi-ring polygons [[LatLng...]]
  const ring = Array.isArray(latLngs[0]) ? (latLngs[0] as L.LatLng[]) : (latLngs as L.LatLng[]);

  return ring.map((point) => [Number(point.lng.toFixed(6)), Number(point.lat.toFixed(6))]);
}

function DrawToolbar({ points, onChange }: { points: LonLat[]; onChange: (points: LonLat[]) => void }) {
  const map = useMap();
  const featureGroupRef = useRef<L.FeatureGroup | null>(null);
  const lastSerializedRef = useRef("");
  const drawnLayerRef = useRef<L.Layer | null>(null);
  const controlRef = useRef<L.Control.Draw | null>(null);

  useEffect(() => {
    const featureGroup = featureGroupRef.current;
    if (!featureGroup) return;

    const control = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          shapeOptions: {
            color: "#d9721f",
            weight: 2,
            fillColor: "#f09a44",
            fillOpacity: 0.22,
          },
        },
        rectangle: {
          shapeOptions: {
            color: "#d9721f",
            weight: 2,
            fillColor: "#f09a44",
            fillOpacity: 0.18,
          },
        },
        polyline: false,
        marker: false,
        circle: false,
        circlemarker: false,
      },
      edit: {
        featureGroup,
        remove: true,
      },
    });
    controlRef.current = control;

    const syncLayer = (layer: L.Layer) => {
      const next = fromLayer(layer);
      lastSerializedRef.current = JSON.stringify(next);
      onChange(next);
    };

    const onCreated = (event: L.DrawEvents.Created) => {
      drawnLayerRef.current = event.layer;
      featureGroup.addLayer(event.layer);
      syncLayer(event.layer);
    };

    const onEdited = (event: L.DrawEvents.Edited) => {
      const [layer] = event.layers.getLayers();
      if (layer) {
        syncLayer(layer);
        return;
      }

      lastSerializedRef.current = "[]";
      onChange([]);
    };

    const onDeleted = () => {
      drawnLayerRef.current = null;
      lastSerializedRef.current = "[]";
      onChange([]);
    };

    map.addControl(control);
    map.on(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn);
    map.on(L.Draw.Event.EDITED, onEdited as L.LeafletEventHandlerFn);
    map.on(L.Draw.Event.DELETED, onDeleted as L.LeafletEventHandlerFn);

    return () => {
      map.off(L.Draw.Event.CREATED, onCreated as L.LeafletEventHandlerFn);
      map.off(L.Draw.Event.EDITED, onEdited as L.LeafletEventHandlerFn);
      map.off(L.Draw.Event.DELETED, onDeleted as L.LeafletEventHandlerFn);
      if (controlRef.current) {
        map.removeControl(controlRef.current);
      }
    };
  }, [map, onChange]);

  useEffect(() => {
    const featureGroup = featureGroupRef.current;
    if (!featureGroup) return;

    const serialized = JSON.stringify(points);
    if (serialized === lastSerializedRef.current) {
      return;
    }

    // If we have a drawn layer, don't clear it - the draw tool manages it
    if (drawnLayerRef.current) {
      return;
    }

    // Only create visual layers if not using the draw tool
    featureGroup.clearLayers();
    if (points.length >= 3) {
      const polygon = L.polygon(points.map((point) => toLatLng(point)), {
        color: "#d9721f",
        weight: 2,
        fillColor: "#f09a44",
        fillOpacity: 0.22,
      });
      featureGroup.addLayer(polygon);
    }

    lastSerializedRef.current = serialized;
  }, [points]);

  return <FeatureGroup ref={featureGroupRef} />;
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

export default function ParcelDrawMap({ points, onAddPoint, onMovePoint, onChange, className }: ParcelDrawMapProps) {
  const positions = points.map((point) => toLatLng(point));
  const mapClassName = className ? `parcel-draw-map ${className}` : "parcel-draw-map";

  return (
    <MapContainer className={mapClassName} center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="OleaSat"
      />

      <FitToPoints points={points} />

      {onChange ? (
        <DrawToolbar points={points} onChange={onChange} />
      ) : (
        <>
          {onAddPoint && <ClickCollector onAddPoint={onAddPoint} />}

          {positions.length >= 2 && (
            <Polyline positions={positions} pathOptions={{ color: "#5d7f3f", weight: 2, opacity: 0.9 }} />
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
        </>
      )}
    </MapContainer>
  );
}
