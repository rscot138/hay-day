import { fetchWeather } from "@/app/lib/weather";
import { evaluateWindow } from "./evaluateWindow";
import { FieldConfig, DecisionResult } from "./types";

/**
 * Convenience wrapper: fetches weather for a location and evaluates it.
 * Used by the alert job to check conditions for each subscription.
 */
export async function evaluateForLocation(
  field: FieldConfig
): Promise<DecisionResult & { fetchedAt: string }> {
  const weather = await fetchWeather(field.latitude, field.longitude);
  const result = evaluateWindow(weather.hourly, field, weather.recent);
  return { ...result, fetchedAt: weather.fetchedAt };
}
