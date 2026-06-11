import {
  Conditioning,
  Confidence,
  HarvestMethod,
  HayDecision,
  HayDecisionInput,
  HourlyWeather,
  Risk,
  SwathDensity
} from "@/app/types/hay";
import { clamp } from "@/app/lib/utils";

const BASE_DRYING: Record<SwathDensity, number> = {
  light: 48,
  medium: 60,
  heavy: 72
};

const BALEAGE_BASE_DRYING: Record<SwathDensity, number> = {
  light: 15,
  medium: 21,
  heavy: 30
};

const TEDDING_BENEFIT: Record<SwathDensity, number> = {
  light: 4,
  medium: 8,
  heavy: 12
};

const CONDITIONING_FACTOR: Record<Conditioning, number> = {
  none: 1,
  roller: 0.92,
  impeller: 0.9
};

type CandidateEvaluation = {
  start: Date;
  end: Date;
  score: number;
  confidence: Confidence;
  risk: Risk;
  dryingMargin: number;
  rain: ReturnType<typeof getRainMetrics>;
  metrics: ReturnType<typeof getDryingMetrics>;
};

export function calculateHayDecision(input: HayDecisionInput): HayDecision {
  const now = input.now ? new Date(input.now) : new Date();
  const forecast = input.weather.hourly.filter((hour) => new Date(hour.time) >= now);
  const currentWindow = forecast.slice(0, 72);
  const dryingMetrics = getDryingMetrics(currentWindow);
  const rain = getRainMetrics(currentWindow);
  const residualPenalty = getResidualPenalty(input.weather.recent.precipitationLast24h, input.weather.recent.hoursSinceLastRain);
  const dewPenalty = clamp(currentWindow.filter((hour) => hour.dewRisk).length * 1.2, 0, 10);
  const windBonus = clamp((dryingMetrics.averageWind - 6) * 1.6, 0, 10);
  const dryingPotential = clamp(
    dryingMetrics.sunHours * 2.2 +
      dryingMetrics.dryingHours * 0.85 +
      dryingMetrics.averageWind * 1.1 -
      Math.max(0, dryingMetrics.averageHumidity - 58) * 0.45,
    0,
    40
  );
  const score = Math.round(clamp(dryingPotential - rain.penalty - residualPenalty - dewPenalty + windBonus + 55, 0, 100));

  const dryHay = buildDryHayDecision(input, now, forecast, dryingMetrics, rain, residualPenalty, dewPenalty, score);
  const baleage = buildBaleageDecision(input, now, forecast, dryingMetrics, rain, residualPenalty, dewPenalty, score);

  const primary = input.field.harvestMethod === "baleage" ? baleage : dryHay;
  const alternative = input.field.harvestMethod === "baleage" ? dryHay : baleage;

  return {
    ...primary,
    harvestMethod: input.field.harvestMethod || "dry_hay",
    harvestComparison: {
      dryHay: {
        summary: dryHay.recommendation.startsWith("CUT")
          ? "Dry hay is viable now."
          : dryHay.recommendation === "PROCEED WITH CAUTION"
            ? "Dry hay is possible with caution."
            : "No viable dry hay window this week.",
        cut: dryHay.timeline.cut,
        bale: dryHay.timeline.bale,
        risk: dryHay.comparison.withoutTedding.risk
      },
      baleage: {
        summary: baleage.recommendation.startsWith("CUT")
          ? "Baleage is viable now."
          : baleage.recommendation === "PROCEED WITH CAUTION"
            ? "Baleage is possible with caution."
            : "No viable baleage window this week.",
        cut: baleage.timeline.cut,
        bale: baleage.timeline.bale,
        wrap: baleage.timeline.wrap || "N/A",
        risk: baleage.comparison.withoutTedding.risk
      }
    }
  };
}

function buildDryHayDecision(
  input: HayDecisionInput,
  now: Date,
  forecast: HourlyWeather[],
  dryingMetrics: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  score: number
) {
  const dryingHours = estimateDryingHours(input.field.swathDensity, input.field.conditioning, dryingMetrics, residualPenalty, dewPenalty, "dry_hay");
  const currentCutEvaluation = evaluateCandidateWindow(
    input.weather.hourly,
    now,
    dryingHours,
    input.weather.recent,
    now
  );
  const bestWindow = findBestCutWindow(input, now, dryingHours);
  const hasCurrentWindow = currentCutEvaluation !== null;
  const status = hasCurrentWindow
    ? score >= 70
      ? "CUT NOW"
      : score >= 50
        ? "PROCEED WITH CAUTION"
        : "DO NOT CUT"
    : "DO NOT CUT";
  const finalScore = hasCurrentWindow
    ? score
    : bestWindow.exists
      ? Math.min(score, 49)
      : 0;
  const hasActionableCut = hasCurrentWindow || bestWindow.exists;
  const cutStart = hasCurrentWindow ? now : bestWindow.exists ? new Date(bestWindow.start) : null;
  const benefitHours = TEDDING_BENEFIT[input.field.swathDensity];
  const teddingRecommended = dryingHours > 48 && rain.maxProbability > 30 && score >= 40 && score <= 70;
  const tedStart = cutStart ? snapOperationTime(addHours(cutStart, 22)) : null;
  const tedEnd = tedStart ? addHours(tedStart, 3) : null;
  const baleWithoutTed = cutStart ? snapOperationTime(addHours(cutStart, dryingHours)) : null;
  const baleWithTed = cutStart ? snapOperationTime(addHours(cutStart, Math.max(36, dryingHours - benefitHours))) : null;
  const riskWithoutTed = cutStart && baleWithoutTed ? labelRisk(forecastBetween(forecast, cutStart, baleWithoutTed), baleWithoutTed) : "High";
  const riskWithTed = cutStart && baleWithTed ? labelRisk(forecastBetween(forecast, cutStart, baleWithTed), baleWithTed) : "High";

  return {
    score: finalScore,
    dryingHours,
    recommendation: status,
    reasons: buildReasons(finalScore, dryingMetrics, rain, residualPenalty, dewPenalty, bestWindow.message, hasCurrentWindow, bestWindow.exists),
    bestWindow,
    tedding: {
      recommended: hasActionableCut && teddingRecommended,
      window: tedStart && tedEnd ? `${formatDateTime(tedStart)} - ${formatTime(tedEnd)}` : "No tedding window until a valid cut window appears",
      benefitHours,
      message: !hasActionableCut
        ? "Tedding can wait. Next step: watch for a validated cut window before planning any ted pass."
        : teddingRecommended && tedStart && tedEnd
        ? `Tedding recommended ${formatDay(tedStart)} between ${formatTime(tedStart)} - ${formatTime(tedEnd)}. If crop is tedded, expect to save ~${benefitHours} hours drying time.`
        : tedStart && tedEnd
          ? `Tedding is optional. Best scouting window is ${formatDay(tedStart)} between ${formatTime(tedStart)} - ${formatTime(tedEnd)}; expected savings are ~${benefitHours} hours if the windrow needs help.`
          : "Tedding is optional, but there is no valid cut window to attach it to yet."
    },
    timeline: {
      cut: cutStart ? formatDateTime(cutStart) : "No valid cut window in the next 7 days",
      ted: tedStart && tedEnd ? `${formatDateTime(tedStart)} - ${formatTime(tedEnd)} (optional)` : "Wait until a valid cut window appears",
      bale: teddingRecommended && baleWithTed
        ? formatDateTime(baleWithTed)
        : baleWithoutTed
          ? formatDateTime(baleWithoutTed)
          : "No bale window until a valid cut window appears"
    },
    comparison: {
      withTedding: {
        baleTime: baleWithTed ? formatDateTime(baleWithTed) : "No safe bale window",
        risk: riskWithTed
      },
      withoutTedding: {
        baleTime: baleWithoutTed ? formatDateTime(baleWithoutTed) : "No safe bale window",
        risk: riskWithoutTed
      }
    },
    breakdown: {
      drying: {
        summary:
          dryingMetrics.dryingHours >= 18
            ? "Strong usable drying time is available in the curing window."
            : "Drying time is limited by cloud cover, humidity, or low wind.",
        sunHours: Math.round(dryingMetrics.sunHours),
        dryingHours: dryingMetrics.dryingHours,
        averageWind: Number(dryingMetrics.averageWind.toFixed(1)),
        averageHumidity: Math.round(dryingMetrics.averageHumidity)
      },
      rain: {
        summary: rain.nextRainAt
          ? `Rain risk starts around ${formatDateTime(new Date(rain.nextRainAt))}.`
          : "No meaningful rain is showing during the near curing window.",
        nextRainAt: rain.nextRainAt,
        maxProbability: rain.maxProbability,
        amountDuringCuring: Number(rain.amount.toFixed(2))
      },
      field: {
        summary:
          residualPenalty > 8
            ? "Recent rainfall is still working against field readiness."
            : "Recent rainfall is not a major drag on cutting decisions.",
        residualPenalty: Math.round(residualPenalty),
        dewPenalty: Math.round(dewPenalty),
        baseDryingHours: BASE_DRYING[input.field.swathDensity]
      }
    }
  };
}

function buildBaleageDecision(
  input: HayDecisionInput,
  now: Date,
  forecast: HourlyWeather[],
  dryingMetrics: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  score: number
) {
  const dryingHours = estimateDryingHours(input.field.swathDensity, input.field.conditioning, dryingMetrics, residualPenalty, dewPenalty, "baleage");
  const tooWet = dryingHours < 10;
  const overdryPenalty = dryingHours > 48 ? clamp((dryingHours - 48) * 0.5, 0, 10) : 0;
  const adjustedScore = Math.round(clamp(score - overdryPenalty, 0, 100));

  const currentCutEvaluation = evaluateBaleageCandidateWindow(
    input.weather.hourly,
    now,
    dryingHours,
    input.weather.recent,
    now
  );
  const bestWindow = findBestBaleageCutWindow(input, now, dryingHours);
  const hasCurrentWindow = currentCutEvaluation !== null && !tooWet;
  const status = tooWet
    ? "DO NOT CUT"
    : hasCurrentWindow
      ? adjustedScore >= 60
        ? "CUT NOW"
        : adjustedScore >= 40
          ? "PROCEED WITH CAUTION"
          : "DO NOT CUT"
      : "DO NOT CUT";
  const finalScore = hasCurrentWindow
    ? adjustedScore
    : bestWindow.exists
      ? Math.min(adjustedScore, 39)
      : 0;
  const hasActionableCut = hasCurrentWindow || bestWindow.exists;
  const cutStart = hasCurrentWindow ? now : bestWindow.exists ? new Date(bestWindow.start) : null;
  const baleTime = cutStart ? snapOperationTime(addHours(cutStart, dryingHours)) : null;
  const wrapEnd = baleTime ? addHours(baleTime, 6) : null;
  const risk = cutStart && baleTime ? labelRisk(forecastBetween(forecast, cutStart, baleTime), baleTime) : "High";

  return {
    score: finalScore,
    dryingHours,
    recommendation: status,
    reasons: buildBaleageReasons(finalScore, dryingMetrics, rain, residualPenalty, dewPenalty, bestWindow.message, tooWet, overdryPenalty, hasCurrentWindow, bestWindow.exists),
    bestWindow,
    tedding: {
      recommended: false,
      window: "Not applicable for baleage",
      benefitHours: 0,
      message: "Tedding is not used with baleage. The shorter drying window makes tedding unnecessary."
    },
    timeline: {
      cut: cutStart ? formatDateTime(cutStart) : "No valid cut window in the next 7 days",
      bale: baleTime ? formatDateTime(baleTime) : "No bale window until a valid cut window appears",
      wrap: wrapEnd ? `${formatDateTime(baleTime!)} - ${formatTime(wrapEnd)}` : "No wrap window until a valid cut window appears"
    },
    comparison: {
      withTedding: {
        baleTime: baleTime ? formatDateTime(baleTime) : "No safe bale window",
        risk
      },
      withoutTedding: {
        baleTime: baleTime ? formatDateTime(baleTime) : "No safe bale window",
        risk
      }
    },
    breakdown: {
      drying: {
        summary: tooWet
          ? "Crop is too wet for baleage. Drying estimate is under 10 hours."
          : dryingMetrics.dryingHours >= 10
            ? "Adequate drying conditions for baleage."
            : "Drying conditions are marginal for baleage.",
        sunHours: Math.round(dryingMetrics.sunHours),
        dryingHours: dryingMetrics.dryingHours,
        averageWind: Number(dryingMetrics.averageWind.toFixed(1)),
        averageHumidity: Math.round(dryingMetrics.averageHumidity)
      },
      rain: {
        summary: rain.nextRainAt
          ? `Rain risk starts around ${formatDateTime(new Date(rain.nextRainAt))}. Rain after baling is ignored for wrapped baleage.`
          : "No meaningful rain is showing during the near wilting window.",
        nextRainAt: rain.nextRainAt,
        maxProbability: rain.maxProbability,
        amountDuringCuring: Number(rain.amount.toFixed(2))
      },
      field: {
        summary: tooWet
          ? "Crop moisture is too high for baleage. Wait for more drying time."
          : overdryPenalty > 0
            ? "Crop may be getting over-dry for ideal baleage. Consider dry hay instead."
            : "Field conditions are suitable for baleage.",
        residualPenalty: Math.round(residualPenalty),
        dewPenalty: Math.round(dewPenalty),
        baseDryingHours: BALEAGE_BASE_DRYING[input.field.swathDensity]
      }
    }
  };
}

function getDryingMetrics(hours: HourlyWeather[]) {
  const daylightHours = hours.filter((hour) => hour.sunFactor > 0);
  const sunHours = daylightHours.reduce((sum, hour) => sum + hour.sunFactor, 0);
  const dryingHours = hours.filter((hour) => hour.dryingHour).length;
  const averageWind = average(hours.map((hour) => hour.windSpeed));
  const averageHumidity = average(hours.map((hour) => hour.relativeHumidity));
  return { sunHours, dryingHours, averageWind, averageHumidity };
}

function getRainMetrics(hours: HourlyWeather[]) {
  let penalty = 0;
  let amount = 0;
  let maxProbability = 0;
  let nextRainAt: string | null = null;

  hours.forEach((hour, index) => {
    const earlyMultiplier = index < 36 ? 1.45 : index < 60 ? 1.1 : 0.75;
    const probability = hour.precipitationProbability;
    amount += hour.precipitationAmount;
    maxProbability = Math.max(maxProbability, probability);
    if (!nextRainAt && (probability >= 35 || hour.precipitationAmount > 0.02)) {
      nextRainAt = hour.time;
    }
    penalty += (probability / 100) * 0.55 * earlyMultiplier + hour.precipitationAmount * 18 * earlyMultiplier;
  });

  return {
    penalty: clamp(penalty, 0, 40),
    amount,
    maxProbability,
    nextRainAt
  };
}

function getResidualPenalty(precipLast24h: number, hoursSinceLastRain: number | null) {
  const rainLoad = clamp(precipLast24h * 35, 0, 20);
  if (hoursSinceLastRain === null) return rainLoad * 0.35;
  const recovery = clamp(hoursSinceLastRain / 24, 0, 1);
  return clamp(rainLoad * (1 - recovery * 0.75), 0, 20);
}

function estimateDryingHours(
  density: SwathDensity,
  conditioning: Conditioning,
  metrics: ReturnType<typeof getDryingMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  harvestMethod: HarvestMethod = "dry_hay"
) {
  const baseMap = harvestMethod === "baleage" ? BALEAGE_BASE_DRYING : BASE_DRYING;
  const base = baseMap[density] * CONDITIONING_FACTOR[conditioning];
  const sunAdjustment = -clamp(metrics.sunHours * 0.45, 0, 12);
  const windAdjustment = -clamp((metrics.averageWind - 5) * 1.4, 0, 10);
  const humidityAdjustment = clamp((metrics.averageHumidity - 62) * 0.45, -6, 16);
  const min = harvestMethod === "baleage" ? 10 : 32;
  const max = harvestMethod === "baleage" ? 48 : 96;
  return Math.round(clamp(base + sunAdjustment + windAdjustment + humidityAdjustment + residualPenalty * 0.8 + dewPenalty * 0.9, min, max));
}

function findBestCutWindow(input: HayDecisionInput, now: Date, currentDryingHours: number) {
  const candidates = generateCandidates(now, input.weather.hourly);
  const scored = candidates
    .flatMap((start) => {
      const evaluation = evaluateCandidateWindow(
        input.weather.hourly,
        start,
        currentDryingHours,
        input.weather.recent,
        now
      );
      return evaluation ? [evaluation] : [];
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || (best.confidence === "low" && best.risk === "High")) {
    return {
      exists: false,
      start: "",
      end: "",
      dayLabel: "",
      confidence: "low" as const,
      message: "No validated cutting opportunities in the next 7 days. Next step: keep the field standing and check again after the next weather update."
    };
  }

  const prefix = best.confidence === "high" ? "Best opportunity" : best.confidence === "medium" ? "Limited opportunity" : "Watch window";
  return {
    exists: true,
    start: best.start.toISOString(),
    end: addHours(best.start, 4).toISOString(),
    dayLabel: formatDay(best.start),
    confidence: best.confidence,
    message:
      best.confidence === "high"
        ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. High confidence based on strong drying conditions before rain.`
        : best.confidence === "medium"
          ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Validated window, but keep caution for margin, humidity, or late rain risk.`
          : `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Conditions are marginal, so scout before committing.`
  };
}

function evaluateCandidateWindow(
  hourly: HourlyWeather[],
  start: Date,
  requiredDryingHours: number,
  recent: HayDecisionInput["weather"]["recent"],
  now: Date
): CandidateEvaluation | null {
  const end = addHours(start, requiredDryingHours);
  const curingHours = forecastBetween(hourly, start, end);
  if (curingHours.length < Math.min(requiredDryingHours, 24)) return null;

  const first24 = forecastBetween(hourly, start, addHours(start, 24));
  const first48 = forecastBetween(hourly, start, addHours(start, 48));
  const sixHourRainCheck = forecastBetween(hourly, addHours(start, -6), addHours(start, 6));
  const metrics = getDryingMetrics(curingHours);
  const rain = getRainMetrics(curingHours);
  const rainFirst24 = first24.reduce((sum, hour) => sum + hour.precipitationAmount, 0);
  const rainBeforeDryingComplete = curingHours.reduce((sum, hour) => sum + hour.precipitationAmount, 0);
  const significantRainNearCut = sixHourRainCheck.some((hour) => hour.precipitationAmount > 0.25);
  const firstRain = curingHours.find((hour) => hour.precipitationAmount > 0.01 || hour.precipitationProbability >= 55);
  const timeToRain = firstRain ? hoursBetween(start, new Date(firstRain.time)) : Number.POSITIVE_INFINITY;
  const dryingMargin = Number.isFinite(timeToRain) ? timeToRain - requiredDryingHours : Number.POSITIVE_INFINITY;
  const humidHours = curingHours.filter((hour) => hour.relativeHumidity > 80).length;
  const sunHoursFirst48 = getDryingMetrics(first48).sunHours;
  const fieldRecentlyWet =
    recent.precipitationLast24h > 0.5 &&
    recent.hoursSinceLastRain !== null &&
    recent.hoursSinceLastRain < 12 &&
    hoursBetween(now, start) < 12;

  if (!isOperationHour(start)) return null;
  if (rainFirst24 >= 0.1) return null;
  if (rainBeforeDryingComplete >= 0.25) return null;
  if (metrics.dryingHours < 24) return null;
  if (humidHours > 12) return null;
  if (fieldRecentlyWet) return null;
  if (significantRainNearCut) return null;

  const dew = curingHours.filter((hour) => hour.dewRisk).length;
  const risk = labelRisk(curingHours, end);
  if (risk === "High") return null;

  const marginBonus = Number.isFinite(dryingMargin) ? clamp(dryingMargin, 0, 18) * 1.6 : 28;
  const noRainBonus = rain.amount < 0.02 && rain.maxProbability < 30 ? 18 : 0;
  const humidityBonus = metrics.averageHumidity < 75 ? 10 : metrics.averageHumidity < 80 ? 4 : 0;
  const windBonus = metrics.averageWind >= 6 ? 9 : 0;
  const timingPenalty = clamp(hoursBetween(now, start) / 24, 0, 8);
  const offHoursPenalty = !isOperationHour(end) ? 15 : 0;
  const score = clamp(
    noRainBonus +
      marginBonus +
      humidityBonus +
      windBonus +
      metrics.sunHours * 1.4 +
      metrics.dryingHours * 1.2 +
      metrics.averageWind -
      rain.penalty * 1.6 -
      dew * 1.5 -
      timingPenalty -
      offHoursPenalty,
    0,
    100
  );
  const confidence = getWindowConfidence(metrics, rain, risk, dryingMargin);

  return { start, end, score, confidence, risk, dryingMargin, rain, metrics };
}

function getWindowConfidence(
  metrics: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  risk: Risk,
  dryingMargin: number
): Confidence {
  const strongDrying = metrics.dryingHours >= 30 && metrics.averageHumidity < 70 && metrics.averageWind >= 6;
  const noRainRisk = rain.amount < 0.02 && rain.maxProbability < 30 && risk === "Low";
  const strongMargin = !Number.isFinite(dryingMargin) || dryingMargin >= 12;
  const minorLateRainRisk = risk === "Moderate" || (dryingMargin >= 0 && rain.maxProbability < 55);
  const marginalHumidity = metrics.averageHumidity >= 75 && metrics.averageHumidity < 80;
  const tightWindow = Number.isFinite(dryingMargin) && dryingMargin < 12;

  if (strongDrying && noRainRisk && strongMargin) return "high";
  if ((minorLateRainRisk || marginalHumidity || tightWindow) && metrics.dryingHours >= 24) return "medium";
  return "low";
}

function generateCandidates(now: Date, hourly: HourlyWeather[]) {
  const latest = new Date(hourly[hourly.length - 1]?.time ?? addHours(now, 168));
  const candidates: Date[] = [];
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    for (const hour of [11, 14]) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate > now && candidate < latest) candidates.push(candidate);
    }
  }
  return candidates;
}

function labelRisk(hours: HourlyWeather[], baleTime: Date): Risk {
  const rainHour = hours.find((hour) => hour.precipitationProbability >= 55 || hour.precipitationAmount > 0.04);
  if (!rainHour) return "Low";
  const rainTime = new Date(rainHour.time);
  const hoursBeforeBale = (baleTime.getTime() - rainTime.getTime()) / 36e5;
  if (hoursBeforeBale > 8) return "High";
  return "Moderate";
}

function buildReasons(
  score: number,
  drying: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  bestWindowMessage: string,
  hasCurrentWindow: boolean,
  hasBestWindow: boolean
) {
  const reasons: string[] = [];
  if (!hasCurrentWindow) {
    if (hasBestWindow) {
      reasons.push("Cannot start cutting now — wait for the next opportunity window below");
    } else {
      reasons.push("No viable cut windows in the next 7 days due to weather or field conditions");
    }
  }
  if (drying.dryingHours >= 18) reasons.push("Strong drying conditions next 48 hours");
  else reasons.push("Drying hours are limited in the near window");
  if (rain.nextRainAt) reasons.push(`Rain possible around ${formatDateTime(new Date(rain.nextRainAt))}`);
  else reasons.push("No meaningful rain showing during curing");
  if (residualPenalty > 6) reasons.push("Moisture from recent rainfall is still present");
  if (dewPenalty > 5) reasons.push("Overnight dew risk may slow curing");
  if (score < 70 && hasCurrentWindow) reasons.push(bestWindowMessage);
  return reasons.slice(0, 4);
}

function evaluateBaleageCandidateWindow(
  hourly: HourlyWeather[],
  start: Date,
  requiredDryingHours: number,
  recent: HayDecisionInput["weather"]["recent"],
  now: Date
): CandidateEvaluation | null {
  const baleTime = addHours(start, requiredDryingHours);
  const wrapEnd = addHours(baleTime, 6);
  const curingHours = forecastBetween(hourly, start, baleTime);
  const wrapHours = forecastBetween(hourly, baleTime, wrapEnd);
  if (curingHours.length < Math.min(requiredDryingHours, 8)) return null;

  const first12 = forecastBetween(hourly, start, addHours(start, 12));
  const metrics = getDryingMetrics(curingHours);
  const rain = getRainMetrics(curingHours);
  const rainBeforeBaling = curingHours.reduce((sum, hour) => sum + hour.precipitationAmount, 0);
  const rainInWrap = wrapHours.some((hour) => hour.precipitationAmount > 0.01 || hour.precipitationProbability >= 35);
  const significantRainBeforeBaling = rainBeforeBaling >= 0.25;
  const fieldRecentlyWet =
    recent.precipitationLast24h > 0.5 &&
    recent.hoursSinceLastRain !== null &&
    recent.hoursSinceLastRain < 6 &&
    hoursBetween(now, start) < 6;

  if (!isOperationHour(start)) return null;
  if (significantRainBeforeBaling) return null;
  if (rainInWrap) return null;
  if (fieldRecentlyWet) return null;
  if (metrics.dryingHours < 4) return null;

  const firstRain = curingHours.find((hour) => hour.precipitationAmount > 0.05);
  const hasMinorRainAfterWilting = firstRain
    ? hoursBetween(start, new Date(firstRain.time)) > requiredDryingHours * 0.6
    : false;
  const rainPenalty = hasMinorRainAfterWilting ? rain.penalty * 0.5 : rain.penalty;

  const dew = curingHours.filter((hour) => hour.dewRisk).length;
  const risk = labelRisk(curingHours, baleTime);
  if (risk === "High") return null;

  const noRainBonus = rainBeforeBaling < 0.02 ? 18 : rainBeforeBaling < 0.1 ? 10 : 0;
  const humidityBonus = metrics.averageHumidity < 75 ? 10 : metrics.averageHumidity < 80 ? 4 : 0;
  const windBonus = metrics.averageWind >= 4 ? 6 : 0;
  const wrapBonus = !rainInWrap ? 12 : 0;
  const timingPenalty = clamp(hoursBetween(now, start) / 24, 0, 6);
  const offHoursPenalty = !isOperationHour(baleTime) ? 15 : 0;
  const score = clamp(
    noRainBonus +
      humidityBonus +
      windBonus +
      wrapBonus +
      metrics.sunHours * 1.0 +
      metrics.dryingHours * 0.8 +
      metrics.averageWind * 0.5 -
      rainPenalty -
      dew * 1.0 -
      timingPenalty -
      offHoursPenalty,
    0,
    100
  );

  const dryingMargin = hasMinorRainAfterWilting ? 6 : 12;
  const confidence = getBaleageConfidence(metrics, rainBeforeBaling, risk, rainInWrap);

  return { start, end: baleTime, score, confidence, risk, dryingMargin, rain, metrics };
}

function getBaleageConfidence(
  metrics: ReturnType<typeof getDryingMetrics>,
  rainBeforeBaling: number,
  risk: Risk,
  rainInWrap: boolean
): Confidence {
  const goodDrying = metrics.dryingHours >= 8 && metrics.averageHumidity < 75;
  const noRain = rainBeforeBaling < 0.02 && !rainInWrap;
  if (goodDrying && noRain && risk === "Low") return "high";
  if (!rainInWrap && risk !== "High") return "medium";
  return "low";
}

function findBestBaleageCutWindow(input: HayDecisionInput, now: Date, currentDryingHours: number) {
  const candidates = generateCandidates(now, input.weather.hourly);
  const scored = candidates
    .flatMap((start) => {
      const evaluation = evaluateBaleageCandidateWindow(
        input.weather.hourly,
        start,
        currentDryingHours,
        input.weather.recent,
        now
      );
      return evaluation ? [evaluation] : [];
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || (best.confidence === "low" && best.risk === "High")) {
    return {
      exists: false,
      start: "",
      end: "",
      dayLabel: "",
      confidence: "low" as const,
      message: "No validated baleage opportunities in the next 7 days. The short drying window should expand options once conditions improve."
    };
  }

  const prefix = best.confidence === "high" ? "Best baleage window" : best.confidence === "medium" ? "Limited baleage window" : "Watch baleage window";
  return {
    exists: true,
    start: best.start.toISOString(),
    end: addHours(best.start, 4).toISOString(),
    dayLabel: formatDay(best.start),
    confidence: best.confidence,
    message:
      best.confidence === "high"
        ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. High confidence — short drying works well with baleage.`
        : best.confidence === "medium"
          ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Conditions are workable for baleage with moderate caution.`
          : `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Marginal window, but baleage may still work — scout first.`
  };
}

function buildBaleageReasons(
  score: number,
  drying: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  bestWindowMessage: string,
  tooWet: boolean,
  overdryPenalty: number,
  hasCurrentWindow: boolean,
  hasBestWindow: boolean
) {
  const reasons: string[] = [];
  if (tooWet) {
    reasons.push("Crop is too wet for baleage — need more drying time");
    return reasons;
  }
  if (!hasCurrentWindow) {
    if (hasBestWindow) {
      reasons.push("Cannot start baleage now — wait for the next opportunity window below");
    } else {
      reasons.push("No viable baleage windows in the next 7 days");
    }
  }
  if (overdryPenalty > 0) reasons.push("Drying estimate exceeds 48h — crop may over-dry for ideal baleage");
  if (drying.dryingHours >= 8) reasons.push("Adequate drying conditions for baleage wilting");
  else reasons.push("Drying hours are limited for reliable wilting");
  if (rain.nextRainAt) reasons.push(`Rain possible around ${formatDateTime(new Date(rain.nextRainAt))} — rain after baling is OK if wrapped`);
  else reasons.push("No meaningful rain showing during wilting");
  if (residualPenalty > 6) reasons.push("Moisture from recent rainfall is still present");
  if (score < 60 && hasCurrentWindow) reasons.push(bestWindowMessage);
  return reasons.slice(0, 4);
}

function forecastBetween(hours: HourlyWeather[], start: Date, end: Date) {
  return hours.filter((hour) => {
    const time = new Date(hour.time);
    return time >= start && time <= end;
  });
}

function isOperationHour(date: Date): boolean {
  const h = date.getHours();
  return h >= 10 && h <= 17;
}

function snapOperationTime(date: Date, hourly?: HourlyWeather[]): Date {
  const snapped = new Date(date);
  const h = snapped.getHours();
  if (h < 10) snapped.setHours(10, 0, 0, 0);
  if (h > 17) {
    snapped.setDate(snapped.getDate() + 1);
    snapped.setHours(10, 0, 0, 0);
  }
  if (hourly) {
    const match = hourly.find((hw) => new Date(hw.time).getTime() === snapped.getTime());
    if (match && match.dewRisk) {
      snapped.setHours(12, 0, 0, 0);
    }
  }
  return snapped;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function hoursBetween(start: Date, end: Date) {
  return (end.getTime() - start.getTime()) / 36e5;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDay(date: Date) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === new Date().toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
