import { HourlyWeather, WeatherSummary } from "@/app/types/hay";

type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly: {
    time: string[];
    precipitation_probability: number[];
    precipitation: number[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    wind_speed_10m: number[];
    cloud_cover: number[];
  };
};

const cache = new Map<string, { expiresAt: number; data: WeatherSummary }>();

export async function fetchWeather(latitude: number, longitude: number) {
  const lat = Number(latitude.toFixed(4));
  const lon = Number(longitude.toFixed(4));
  const key = `${lat},${lon}`;
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      "precipitation_probability",
      "precipitation",
      "temperature_2m",
      "relative_humidity_2m",
      "wind_speed_10m",
      "cloud_cover"
    ].join(","),
    past_days: "1",
    forecast_days: "14",
    wind_speed_unit: "mph",
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
    timezone: "auto"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 900 }
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo returned ${response.status}`);
  }

  const raw = (await response.json()) as OpenMeteoResponse;
  const normalized = normalizeWeather(raw, lat, lon);
  cache.set(key, {
    expiresAt: Date.now() + 15 * 60 * 1000,
    data: normalized
  });
  return normalized;
}

function normalizeWeather(raw: OpenMeteoResponse, latitude: number, longitude: number): WeatherSummary {
  const now = new Date();
  const hourly: HourlyWeather[] = raw.hourly.time.map((time, index) => {
    const cloudCover = raw.hourly.cloud_cover[index] ?? 100;
    const humidity = raw.hourly.relative_humidity_2m[index] ?? 100;
    const temp = raw.hourly.temperature_2m[index] ?? 50;
    const wind = raw.hourly.wind_speed_10m[index] ?? 0;
    const hour = new Date(time).getHours();
    const daylight = hour >= 7 && hour <= 19;
    const sunFactor = daylight ? Math.max(0, 1 - cloudCover / 100) : 0;
    const dryingHour = daylight && sunFactor > 0.35 && humidity < 72 && wind >= 4;
    const dewRisk = (hour <= 8 || hour >= 20) && humidity >= 88 && temp <= 68;

    return {
      time,
      precipitationProbability: raw.hourly.precipitation_probability[index] ?? 0,
      precipitationAmount: raw.hourly.precipitation[index] ?? 0,
      temperature: temp,
      relativeHumidity: humidity,
      windSpeed: wind,
      cloudCover,
      sunFactor,
      dryingHour,
      dewRisk
    };
  });

  const past24 = hourly.filter((hour) => {
    const time = new Date(hour.time).getTime();
    return time <= now.getTime() && time >= now.getTime() - 24 * 60 * 60 * 1000;
  });
  const precipitationLast24h = past24.reduce((sum, hour) => sum + hour.precipitationAmount, 0);
  const lastRain = [...past24].reverse().find((hour) => hour.precipitationAmount > 0.005);

  return {
    latitude,
    longitude,
    timezone: raw.timezone,
    fetchedAt: now.toISOString(),
    recent: {
      precipitationLast24h: Number(precipitationLast24h.toFixed(2)),
      lastRainAt: lastRain?.time ?? null,
      hoursSinceLastRain: lastRain
        ? Math.max(0, Math.round((now.getTime() - new Date(lastRain.time).getTime()) / 36e5))
        : null
    },
    hourly
  };
}
