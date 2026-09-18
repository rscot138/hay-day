export type UnitSystem = "imperial" | "metric";

function inBox(lat: number, lng: number, swLat: number, swLng: number, neLat: number, neLng: number) {
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
}

export function defaultUnitSystem(latitude: number, longitude: number): UnitSystem {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "imperial";
  const inUsa =
    inBox(latitude, longitude, 24.4, -125.0, 49.6, -66.9) ||
    inBox(latitude, longitude, 54.0, -168.5, 71.6, -129.9) ||
    inBox(latitude, longitude, 18.5, -160.4, 28.5, -154.5) ||
    inBox(latitude, longitude, 17.8, -67.3, 18.6, -65.2);
  return inUsa ? "imperial" : "metric";
}

export function formatTemperature(fahrenheit: number, units: UnitSystem): string {
  return units === "metric"
    ? `${Math.round(((fahrenheit - 32) * 5) / 9)}\u00b0C`
    : `${Math.round(fahrenheit)}\u00b0F`;
}

export function formatRain(inches: number, units: UnitSystem): string {
  return units === "metric" ? `${(inches * 25.4).toFixed(1)} mm` : `${inches.toFixed(2)} in`;
}