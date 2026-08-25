"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";

const DEFAULT_CENTER: [number, number] = [39.0, -96.0];
const DEFAULT_ZOOM = 5;

const pinIcon = new L.DivIcon({
  className: "",
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#2b6b3f"/>
    <circle cx="14" cy="14" r="6" fill="#f6f7ee"/>
  </svg>`
});

function ClickHandler({ onPosition }: { onPosition: (pos: [number, number]) => void }) {
  useMapEvents({
    click(e) {
      onPosition([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}

function FlyTo({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, Math.max(map.getZoom(), 12));
  }, [position, map]);
  return null;
}

export default function MapPicker({
  initialLat,
  initialLng,
  onConfirm,
}: {
  initialLat?: number | null;
  initialLng?: number | null;
  onConfirm: (lat: number, lng: number) => void;
}) {
  const hasInitial =
    typeof initialLat === "number" &&
    typeof initialLng === "number" &&
    Number.isFinite(initialLat) &&
    Number.isFinite(initialLng);

  const center: [number, number] = hasInitial ? [initialLat!, initialLng!] : DEFAULT_CENTER;
  const zoom = hasInitial ? 12 : DEFAULT_ZOOM;

  const [marker, setMarker] = useState<[number, number] | null>(hasInitial ? center : null);

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border/60" style={{ height: 280 }}>
        <MapContainer
          center={center}
          zoom={zoom}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPosition={setMarker} />
          <FlyTo position={marker} />
          {marker ? <Marker position={marker} icon={pinIcon} /> : null}
        </MapContainer>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Tap anywhere on the map to drop a pin, then confirm below.
      </p>

      <Button
        disabled={!marker}
        onClick={() => marker && onConfirm(marker[0], marker[1])}
        className="w-full"
      >
        {marker ? `Use this location` : "Drop a pin first"}
      </Button>
    </div>
  );
}
