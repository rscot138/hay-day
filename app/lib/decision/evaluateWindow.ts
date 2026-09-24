import { WeatherPoint, FieldConfig, DecisionResult } from "./types";

const BASE_DRYING: Record<string, number> = {
  light: 48,
  medium: 60,
  heavy: 72,
};

const BALEAGE_BASE_DRYING: Record<string, number> = {
  light: 15,
  medium: 21,
  heavy: 30,
};

const CONDITIONING_FACTOR: Record<string, number> = {
  none: 1,
  roller: 0.92,
  impeller: 0.9,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function getDryingMetrics(hours: WeatherPoint[]) {
  const daylightHours = hours.filter((h) => h.sunFactor > 0);
  const sunHours = daylightHours.reduce((sum, h) => sum + h.sunFactor, 0);
  const dryingHours = hours.filter((h) => h.dryingHour).length;
  const averageWind = average(hours.map((h) => h.windSpeed));
  const averageHumidity = average(hours.map((h) => h.relativeHumidity));
  return { sunHours, dryingHours, averageWind, averageHumidity };
}

function getRainMetrics(hours: WeatherPoint[]) {
  let penalty = 0;
  let amount = 0;
  let maxProbability = 0;

  hours.forEach((hour, index) => {
    const earlyMultiplier = index < 36 ? 1.45 : index < 60 ? 1.1 : 0.75;
    const probability = hour.precipitationProbability;
    amount += hour.precipitationAmount;
    maxProbability = Math.max(maxProbability, probability);
    penalty +=
      (probability / 100) * 0.55 * earlyMultiplier +
      hour.precipitationAmount * 18 * earlyMultiplier;
  });

  return {
    penalty: clamp(penalty, 0, 40),
    amount,
    maxProbability,
  };
}

function getResidualPenalty(
  precipLast24h: number,
  hoursSinceLastRain: number | null
) {
  const rainLoad = clamp(precipLast24h * 35, 0, 20);
  if (hoursSinceLastRain === null) return rainLoad * 0.35;
  const recovery = clamp(hoursSinceLastRain / 24, 0, 1);
  return clamp(rainLoad * (1 - recovery * 0.75), 0, 20);
}

function estimateDryingHours(
  density: string,
  conditioning: string,
  metrics: ReturnType<typeof getDryingMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  harvestMethod: string
) {
  const baseMap = harvestMethod === "baleage" ? BALEAGE_BASE_DRYING : BASE_DRYING;
  const base = (baseMap[density] ?? 60) * (CONDITIONING_FACTOR[conditioning] ?? 1);
  const sunAdjustment = -clamp(metrics.sunHours * 0.45, 0, 12);
  const windAdjustment = -clamp((metrics.averageWind - 5) * 1.4, 0, 10);
  const humidityAdjustment = clamp(
    (metrics.averageHumidity - 62) * 0.45,
    -6,
    16
  );
  const min = harvestMethod === "baleage" ? 10 : 32;
  const max = harvestMethod === "baleage" ? 48 : 96;
  return Math.round(
    clamp(
      base +
        sunAdjustment +
        windAdjustment +
        humidityAdjustment +
        residualPenalty * 0.8 +
        dewPenalty * 0.9,
      min,
      max
    )
  );
}

/**
 * Pure function: evaluates weather + field config and returns a decision.
 * No side effects, no API calls, no DB access.
 */
export function evaluateWindow(
  forecast: WeatherPoint[],
  field: FieldConfig,
  recent?: { precipitationLast24h: number; hoursSinceLastRain: number | null }
): DecisionResult {
  const recentData = recent ?? { precipitationLast24h: 0, hoursSinceLastRain: null };
  const window = forecast.slice(0, 72);

  const dryingMetrics = getDryingMetrics(window);
  const rain = getRainMetrics(window);
  const residualPenalty = getResidualPenalty(
    recentData.precipitationLast24h,
    recentData.hoursSinceLastRain
  );
  const dewPenalty = clamp(
    window.filter((h) => h.dewRisk).length * 1.2,
    0,
    10
  );
  const windBonus = clamp((dryingMetrics.averageWind - 6) * 1.6, 0, 10);
  const dryingPotential = clamp(
    dryingMetrics.sunHours * 2.2 +
      dryingMetrics.dryingHours * 0.85 +
      dryingMetrics.averageWind * 1.1 -
      Math.max(0, dryingMetrics.averageHumidity - 58) * 0.45,
    0,
    40
  );

  const score = Math.round(
    clamp(
      dryingPotential -
        rain.penalty -
        residualPenalty -
        dewPenalty +
        windBonus +
        55,
      0,
      100
    )
  );

  const dryingHours = estimateDryingHours(
    field.swathDensity,
    field.conditioning,
    dryingMetrics,
    residualPenalty,
    dewPenalty,
    field.harvestMethod
  );

  const rainDuringCuring = window.reduce(
    (sum, h) => sum + h.precipitationAmount,
    0
  );
  const humidHours = window.filter((h) => {
    const hour = new Date(h.time).getHours();
    return hour >= 7 && hour <= 19 && h.relativeHumidity > 80;
  }).length;

  const isBaleage = field.harvestMethod === "baleage";
  const scoreThreshold = isBaleage ? 60 : 70;
  const cautionThreshold = isBaleage ? 40 : 50;

  let recommendation: DecisionResult["recommendation"];
  let reason: string;

  if (isBaleage && dryingHours < 10) {
    recommendation = "Do Not Cut";
    reason = "Crop is too wet for baleage. Drying estimate is under 10 hours.";
  } else if (rainDuringCuring >= 0.25) {
    recommendation = "Do Not Cut";
    reason = `Too much rain during curing window (${rainDuringCuring.toFixed(2)} in).`;
  } else if (humidHours > 12) {
    recommendation = "Do Not Cut";
    reason = "Too many humid hours during daytime. Drying will be slow.";
  } else if (score >= scoreThreshold) {
    recommendation = "Cut Now";
    reason = buildGoodReason(dryingMetrics, rain, isBaleage);
  } else if (score >= cautionThreshold) {
    recommendation = "Proceed With Caution";
    reason = buildCautionReason(dryingMetrics, rain, isBaleage);
  } else {
    recommendation = "Do Not Cut";
    reason = buildBadReason(dryingMetrics, rain, dryingHours, isBaleage);
  }

  return { score, recommendation, reason };
}

function buildGoodReason(
  drying: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  isBaleage: boolean
): string {
  const parts: string[] = [];
  if (drying.dryingHours >= (isBaleage ? 8 : 18))
    parts.push("strong drying conditions");
  if (rain.amount < 0.02 && rain.maxProbability < 30)
    parts.push("low rain risk");
  if (drying.averageWind >= 6) parts.push("good wind");
  if (drying.averageHumidity < 75) parts.push("favorable humidity");
  return parts.length
    ? `Good window: ${parts.join(", ")}.`
    : "Conditions are acceptable for cutting.";
}

function buildCautionReason(
  drying: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  isBaleage: boolean
): string {
  const parts: string[] = [];
  if (drying.dryingHours < (isBaleage ? 8 : 18))
    parts.push("limited drying hours");
  if (rain.maxProbability >= 30) parts.push("rain risk present");
  if (drying.averageHumidity >= 80) parts.push("high humidity");
  return parts.length
    ? `Proceed with caution: ${parts.join(", ")}.`
    : "Conditions are marginal. Monitor closely.";
}

function buildBadReason(
  drying: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  dryingHours: number,
  isBaleage: boolean
): string {
  const parts: string[] = [];
  if (dryingHours < (isBaleage ? 10 : 32))
    parts.push("insufficient drying time");
  if (rain.amount >= 0.25) parts.push("significant rain expected");
  if (rain.maxProbability >= 55) parts.push("high rain probability");
  if (drying.averageHumidity >= 85) parts.push("very high humidity");
  return parts.length
    ? `Not recommended: ${parts.join(", ")}.`
    : "Weather conditions are not suitable for cutting right now.";
}
