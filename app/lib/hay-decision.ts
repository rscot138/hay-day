import {
  Conditioning,
  Confidence,
  DebugCandidate,
  DebugCheck,
  DebugScoreComponent,
  DebugTrace,
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
  const estimateBreakdown = estimateDryingHoursBreakdown(input.field.swathDensity, input.field.conditioning, dryingMetrics, residualPenalty, dewPenalty, "dry_hay");
  const currentWindowStart = snapOperationTime(now, input.weather.hourly);
  const windowChecks: DebugCheck[] = [];
  const windowScore: DebugScoreComponent[] = [];
  const currentCutEvaluation = evaluateCandidateWindow(
    input.weather.hourly,
    currentWindowStart,
    dryingHours,
    input.weather.recent,
    now,
    windowChecks,
    windowScore
  );
  const bestCandidateTrace: DebugCandidate[] = [];
  const bestWindow = findBestCutWindow(input, now, dryingHours, bestCandidateTrace);
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
  const cutStart = hasCurrentWindow && currentCutEvaluation
    ? new Date(currentCutEvaluation.start)
    : bestWindow.exists
      ? new Date(bestWindow.start)
      : null;
  const benefitHours = TEDDING_BENEFIT[input.field.swathDensity];
  const tedStart = cutStart ? snapOperationTime(addHours(cutStart, 22)) : null;
  const tedEnd = tedStart ? addHours(tedStart, 3) : null;
  const baleWithoutTed = cutStart ? snapOperationTime(addHours(cutStart, dryingHours)) : null;
  const baleWithTed = cutStart ? snapOperationTime(addHours(cutStart, Math.max(36, dryingHours - benefitHours))) : null;
  const teddingTimesEqual = baleWithTed && baleWithoutTed && Math.abs(baleWithTed.getTime() - baleWithoutTed.getTime()) < 36e5;
  const teddingRecommended = dryingHours > 48 && rain.maxProbability > 30 && score >= 40 && score <= 70 && !teddingTimesEqual;
  const riskWithoutTed = cutStart && baleWithoutTed ? labelRisk(forecastBetween(forecast, cutStart, baleWithoutTed), baleWithoutTed) : "High";
  const riskWithTed = cutStart && baleWithTed ? labelRisk(forecastBetween(forecast, cutStart, baleWithTed), baleWithTed) : "High";

  const primaryBaleTime = teddingRecommended && baleWithTed ? baleWithTed : baleWithoutTed;
  const rakeTime = cutStart && primaryBaleTime ? computeRakeTime(cutStart, primaryBaleTime, dryingHours, false, input.weather.hourly, tedStart) : null;
  const timelineBaleTime =
    rakeTime && primaryBaleTime && Math.abs(primaryBaleTime.getTime() - rakeTime.getTime()) < 36e5
      ? snapOperationTime(addHours(primaryBaleTime, 1))
      : primaryBaleTime;

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
        : teddingTimesEqual
        ? `Tedding would not change the bale time — both scenarios land at ${baleWithoutTed ? formatDateTime(baleWithoutTed) : "—"}. Tedding causes leaf loss, so skip it when there is no working-time gain.`
        : teddingRecommended && tedStart && tedEnd
        ? `Tedding recommended ${formatDay(tedStart)} between ${formatTime(tedStart)} - ${formatTime(tedEnd)}. If crop is tedded, expect to save ~${benefitHours} hours drying time.`
        : tedStart && tedEnd
          ? `Tedding is optional. Best window to double-check is ${formatDay(tedStart)} between ${formatTime(tedStart)} - ${formatTime(tedEnd)}; expected savings are ~${benefitHours} hours if the windrow needs help.`
          : "Tedding is optional, but there is no valid cut window to attach it to yet."
    },
    timeline: {
      cut: cutStart ? formatDateTime(cutStart) : "No valid cut window in the next 7 days",
      ted: tedStart && tedEnd ? `${formatDateTime(tedStart)} - ${formatTime(tedEnd)} (optional)` : "Wait until a valid cut window appears",
      rake: rakeTime ? formatDateTime(rakeTime) : "No rake window until a valid cut window appears",
      bale: timelineBaleTime
        ? formatDateTime(timelineBaleTime)
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
      },
      note: teddingTimesEqual
        ? "Tedding is not recommended — the bale time is the same either way, and tedding causes leaf loss."
        : undefined
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
    },
    debug: buildDryHayDebugTrace(
      input, now, dryingMetrics, rain, residualPenalty, dewPenalty, score,
      dryingHours, estimateBreakdown, currentWindowStart, currentCutEvaluation,
      windowChecks, windowScore, bestWindow, bestCandidateTrace,
      hasCurrentWindow, finalScore, status
    )
  };
}

function buildDryHayDebugTrace(
  input: HayDecisionInput,
  now: Date,
  dryingMetrics: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  baseScore: number,
  dryingHours: number,
  estimateBreakdown: ReturnType<typeof estimateDryingHoursBreakdown>,
  currentWindowStart: Date,
  currentCutEvaluation: CandidateEvaluation | null,
  windowChecks: DebugCheck[],
  windowScore: DebugScoreComponent[],
  bestWindow: ReturnType<typeof findBestCutWindow>,
  bestCandidateTrace: DebugCandidate[],
  hasCurrentWindow: boolean,
  finalScore: number,
  recommendation: string
): DebugTrace {
  const currentWindow = currentCutEvaluation
    ? {
        start: currentCutEvaluation.start.toISOString(),
        end: currentCutEvaluation.end.toISOString(),
        passed: true,
        failReason: null,
        checks: windowChecks,
        scoreComponents: windowScore.length > 0 ? windowScore : null,
        windowScore: currentCutEvaluation.score
      }
    : {
        start: currentWindowStart.toISOString(),
        end: addHours(currentWindowStart, dryingHours).toISOString(),
        passed: false,
        failReason: windowChecks.find((c) => !c.passed)
          ? `${windowChecks.find((c) => !c.passed)!.label}: ${windowChecks.find((c) => !c.passed)!.value} (need ${windowChecks.find((c) => !c.passed)!.threshold})`
          : "Unknown",
        checks: windowChecks,
        scoreComponents: null,
        windowScore: null
      };

  const windBonus = clamp((dryingMetrics.averageWind - 6) * 1.6, 0, 10);
  const dryingPotential = clamp(
    dryingMetrics.sunHours * 2.2 +
      dryingMetrics.dryingHours * 0.85 +
      dryingMetrics.averageWind * 1.1 -
      Math.max(0, dryingMetrics.averageHumidity - 58) * 0.45,
    0,
    40
  );

  const passedCandidates = bestCandidateTrace.filter((c) => c.passed).length;

  return {
    capturedAt: now.toISOString(),
    recent: input.weather.recent,
    forecastHours: input.weather.hourly.slice(0, 72),
    baseScore: {
      sunHours: dryingMetrics.sunHours,
      dryingHours: dryingMetrics.dryingHours,
      averageWind: dryingMetrics.averageWind,
      averageHumidity: dryingMetrics.averageHumidity,
      rainPenalty: rain.penalty,
      rainAmount: rain.amount,
      rainMaxProbability: rain.maxProbability,
      rainNextAt: rain.nextRainAt,
      residualPenalty,
      dewPenalty,
      windBonus,
      dryingPotential,
      rawFormula: `dryingPotential(${dryingPotential.toFixed(1)}) - rain(${rain.penalty.toFixed(1)}) - residual(${residualPenalty.toFixed(1)}) - dew(${dewPenalty.toFixed(1)}) + wind(${windBonus.toFixed(1)}) + 55 = ${baseScore}`,
      score: baseScore
    },
    dryingEstimate: estimateBreakdown,
    currentWindow,
    bestWindow: {
      candidatesChecked: bestCandidateTrace.length,
      passedCandidates,
      exists: bestWindow.exists,
      start: bestWindow.start,
      score: currentCutEvaluation?.score ?? 0,
      confidence: bestWindow.confidence,
      candidates: bestCandidateTrace.slice(0, 20)
    },
    final: {
      hasCurrentWindow,
      baseScore,
      finalScore,
      recommendation,
      statusRule: hasCurrentWindow
        ? baseScore >= 70
          ? "score >= 70 \u2192 CUT NOW"
          : baseScore >= 50
            ? "score >= 50 \u2192 PROCEED WITH CAUTION"
            : "score < 50 \u2192 DO NOT CUT"
        : bestWindow.exists
          ? "no current window, best window exists \u2192 capped at 49"
          : "no viable windows \u2192 0"
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
  const estimateBreakdown = estimateDryingHoursBreakdown(input.field.swathDensity, input.field.conditioning, dryingMetrics, residualPenalty, dewPenalty, "baleage");
  const tooWet = dryingHours < 10;
  const overdryPenalty = dryingHours > 48 ? clamp((dryingHours - 48) * 0.5, 0, 10) : 0;
  const adjustedScore = Math.round(clamp(score - overdryPenalty, 0, 100));

  const currentWindowStart = snapOperationTime(now, input.weather.hourly);
  const windowChecks: DebugCheck[] = [];
  const windowScore: DebugScoreComponent[] = [];
  const currentCutEvaluation = evaluateBaleageCandidateWindow(
    input.weather.hourly,
    currentWindowStart,
    dryingHours,
    input.weather.recent,
    now,
    windowChecks,
    windowScore
  );
  const bestCandidateTrace: DebugCandidate[] = [];
  const bestWindow = findBestBaleageCutWindow(input, now, dryingHours, bestCandidateTrace);
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
  const cutStart = hasCurrentWindow && currentCutEvaluation
    ? new Date(currentCutEvaluation.start)
    : bestWindow.exists
      ? new Date(bestWindow.start)
      : null;
  const baleTime = cutStart ? snapOperationTime(addHours(cutStart, dryingHours)) : null;
  const risk = cutStart && baleTime ? labelRisk(forecastBetween(forecast, cutStart, baleTime), baleTime) : "High";
  const rakeTime = cutStart && baleTime ? computeRakeTime(cutStart, baleTime, dryingHours, true, input.weather.hourly) : null;
  const timelineBaleTime =
    rakeTime && baleTime && Math.abs(baleTime.getTime() - rakeTime.getTime()) < 36e5
      ? snapOperationTime(addHours(baleTime, 1))
      : baleTime;
  const wrapEnd = timelineBaleTime ? addHours(timelineBaleTime, 6) : null;

  return {
    score: finalScore,
    dryingHours,
    recommendation: status,
    reasons: buildBaleageReasons(finalScore, dryingMetrics, rain, residualPenalty, dewPenalty, bestWindow.message, tooWet, overdryPenalty, hasCurrentWindow, bestWindow.exists, timelineBaleTime),
    bestWindow,
    tedding: {
      recommended: false,
      window: "Not applicable for baleage",
      benefitHours: 0,
      message: "Tedding is not used with baleage. The shorter drying window makes tedding unnecessary."
    },
    timeline: {
      cut: cutStart ? formatDateTime(cutStart) : "No valid cut window in the next 7 days",
      rake: rakeTime ? formatDateTime(rakeTime) : "No rake window until a valid cut window appears",
      bale: timelineBaleTime ? formatDateTime(timelineBaleTime) : "No bale window until a valid cut window appears",
      wrap: timelineBaleTime && wrapEnd ? `${formatDateTime(timelineBaleTime)} - ${formatTime(wrapEnd)}` : "No wrap window until a valid cut window appears"
    },
    comparison: {
      withTedding: {
        baleTime: baleTime ? formatDateTime(baleTime) : "No safe bale window",
        risk
      },
      withoutTedding: {
        baleTime: baleTime ? formatDateTime(baleTime) : "No safe bale window",
        risk
      },
      note: "Tedding is not used with baleage — the shorter drying window makes it unnecessary."
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
    },
    debug: buildBaleageDebugTrace(
      input, now, dryingMetrics, rain, residualPenalty, dewPenalty, score,
      dryingHours, estimateBreakdown, overdryPenalty, adjustedScore,
      currentWindowStart, currentCutEvaluation,
      windowChecks, windowScore, bestWindow, bestCandidateTrace,
      tooWet, hasCurrentWindow, finalScore, status
    )
  };
}

function buildBaleageDebugTrace(
  input: HayDecisionInput,
  now: Date,
  dryingMetrics: ReturnType<typeof getDryingMetrics>,
  rain: ReturnType<typeof getRainMetrics>,
  residualPenalty: number,
  dewPenalty: number,
  baseScore: number,
  dryingHours: number,
  estimateBreakdown: ReturnType<typeof estimateDryingHoursBreakdown>,
  overdryPenalty: number,
  adjustedScore: number,
  currentWindowStart: Date,
  currentCutEvaluation: CandidateEvaluation | null,
  windowChecks: DebugCheck[],
  windowScore: DebugScoreComponent[],
  bestWindow: ReturnType<typeof findBestBaleageCutWindow>,
  bestCandidateTrace: DebugCandidate[],
  tooWet: boolean,
  hasCurrentWindow: boolean,
  finalScore: number,
  recommendation: string
): DebugTrace {
  const currentWindow = currentCutEvaluation
    ? {
        start: currentCutEvaluation.start.toISOString(),
        end: currentCutEvaluation.end.toISOString(),
        passed: true,
        failReason: null,
        checks: windowChecks,
        scoreComponents: windowScore.length > 0 ? windowScore : null,
        windowScore: currentCutEvaluation.score
      }
    : {
        start: currentWindowStart.toISOString(),
        end: addHours(currentWindowStart, dryingHours).toISOString(),
        passed: false,
        failReason: tooWet
          ? `dryingHours(${dryingHours}) < 10 \u2192 too wet`
          : windowChecks.find((c) => !c.passed)
            ? `${windowChecks.find((c) => !c.passed)!.label}: ${windowChecks.find((c) => !c.passed)!.value} (need ${windowChecks.find((c) => !c.passed)!.threshold})`
            : "Unknown",
        checks: windowChecks,
        scoreComponents: null,
        windowScore: null
      };

  const windBonus = clamp((dryingMetrics.averageWind - 6) * 1.6, 0, 10);
  const dryingPotential = clamp(
    dryingMetrics.sunHours * 2.2 +
      dryingMetrics.dryingHours * 0.85 +
      dryingMetrics.averageWind * 1.1 -
      Math.max(0, dryingMetrics.averageHumidity - 58) * 0.45,
    0,
    40
  );

  return {
    capturedAt: now.toISOString(),
    recent: input.weather.recent,
    forecastHours: input.weather.hourly.slice(0, 72),
    baseScore: {
      sunHours: dryingMetrics.sunHours,
      dryingHours: dryingMetrics.dryingHours,
      averageWind: dryingMetrics.averageWind,
      averageHumidity: dryingMetrics.averageHumidity,
      rainPenalty: rain.penalty,
      rainAmount: rain.amount,
      rainMaxProbability: rain.maxProbability,
      rainNextAt: rain.nextRainAt,
      residualPenalty,
      dewPenalty,
      windBonus,
      dryingPotential,
      rawFormula: `dryingPotential(${dryingPotential.toFixed(1)}) - rain(${rain.penalty.toFixed(1)}) - residual(${residualPenalty.toFixed(1)}) - dew(${dewPenalty.toFixed(1)}) + wind(${windBonus.toFixed(1)}) + 55 = ${baseScore}${overdryPenalty > 0 ? ` \u2192 overdry penalty(-${overdryPenalty.toFixed(1)}) \u2192 ${adjustedScore}` : ""}`,
      score: baseScore
    },
    dryingEstimate: estimateBreakdown,
    currentWindow,
    bestWindow: {
      candidatesChecked: bestCandidateTrace.length,
      passedCandidates: bestCandidateTrace.filter((c) => c.passed).length,
      exists: bestWindow.exists,
      start: bestWindow.start,
      score: currentCutEvaluation?.score ?? 0,
      confidence: bestWindow.confidence,
      candidates: bestCandidateTrace.slice(0, 20)
    },
    final: {
      hasCurrentWindow,
      baseScore,
      finalScore,
      recommendation,
      statusRule: tooWet
        ? "tooWet(dryingHours<10) \u2192 DO NOT CUT"
        : hasCurrentWindow
          ? adjustedScore >= 60
            ? "score >= 60 \u2192 CUT NOW"
            : adjustedScore >= 40
              ? "score >= 40 \u2192 PROCEED WITH CAUTION"
              : "score < 40 \u2192 DO NOT CUT"
          : bestWindow.exists
            ? "no current window, best window exists \u2192 capped at 39"
            : "no viable windows \u2192 0"
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

function estimateDryingHoursBreakdown(
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
  const residualAdjustment = residualPenalty * 0.8;
  const dewAdjustment = dewPenalty * 0.9;
  const min = harvestMethod === "baleage" ? 10 : 32;
  const max = harvestMethod === "baleage" ? 48 : 96;
  const result = Math.round(clamp(base + sunAdjustment + windAdjustment + humidityAdjustment + residualAdjustment + dewAdjustment, min, max));
  return {
    harvestMethod,
    density,
    conditioning,
    base: Math.round(base * 10) / 10,
    conditioningFactor: CONDITIONING_FACTOR[conditioning],
    sunAdjustment: Math.round(sunAdjustment * 10) / 10,
    windAdjustment: Math.round(windAdjustment * 10) / 10,
    humidityAdjustment: Math.round(humidityAdjustment * 10) / 10,
    residualAdjustment: Math.round(residualAdjustment * 10) / 10,
    dewAdjustment: Math.round(dewAdjustment * 10) / 10,
    result
  };
}

function findBestCutWindow(
  input: HayDecisionInput,
  now: Date,
  currentDryingHours: number,
  traceCandidates?: DebugCandidate[]
) {
  const candidates = generateCandidates(now, input.weather.hourly);
  const scored = candidates
    .flatMap((start) => {
      const checks: DebugCheck[] | undefined = traceCandidates ? [] : undefined;
      const evaluation = evaluateCandidateWindow(
        input.weather.hourly,
        start,
        currentDryingHours,
        input.weather.recent,
        now,
        checks
      );
      if (traceCandidates) {
        const failCheck = checks?.find((c) => !c.passed);
        traceCandidates.push({
          start: start.toISOString(),
          score: evaluation?.score ?? 0,
          passed: evaluation !== null,
          failReason: failCheck ? `${failCheck.label}: ${failCheck.value} (need ${failCheck.threshold})` : null
        });
      }
      return evaluation ? [evaluation] : [];
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || (best.confidence === "low" && best.risk === "High")) {
    return {
      exists: false,
      start: "",
      end: "",
      startLabel: "",
      endLabel: "",
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
    startLabel: formatTime(best.start),
    endLabel: formatTime(addHours(best.start, 4)),
    dayLabel: formatDay(best.start),
    confidence: best.confidence,
    message:
      best.confidence === "high"
        ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. High confidence based on strong drying conditions before rain.`
        : best.confidence === "medium"
          ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Validated window, but keep caution for margin, humidity, or late rain risk.`
          : `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Conditions are marginal, so validate before committing.`
  };
}

function evaluateCandidateWindow(
  hourly: HourlyWeather[],
  start: Date,
  requiredDryingHours: number,
  recent: HayDecisionInput["weather"]["recent"],
  now: Date,
  traceChecks?: DebugCheck[],
  traceScore?: DebugScoreComponent[]
): CandidateEvaluation | null {
  const end = addHours(start, requiredDryingHours);
  const curingHours = forecastBetween(hourly, start, end);
  const minHours = Math.min(requiredDryingHours, 24);
  if (curingHours.length < minHours) {
    traceChecks?.push({ label: "Enough forecast hours", passed: false, value: String(curingHours.length), threshold: `>= ${minHours}` });
    return null;
  }
  traceChecks?.push({ label: "Enough forecast hours", passed: true, value: String(curingHours.length), threshold: `>= ${minHours}` });

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
  const humidHours = curingHours.filter((hour) => {
    const h = new Date(hour.time).getHours();
    return h >= 7 && h <= 19 && hour.relativeHumidity > 80;
  }).length;
  const sunHoursFirst48 = getDryingMetrics(first48).sunHours;
  const fieldRecentlyWet =
    recent.precipitationLast24h > 0.5 &&
    recent.hoursSinceLastRain !== null &&
    recent.hoursSinceLastRain < 8 &&
    hoursBetween(now, start) < 8;

  traceChecks?.push({ label: "Is operation hour", passed: isOperationHour(start), value: `${start.getHours()}:00`, threshold: "10:00\u201317:00" });
  if (!isOperationHour(start)) return null;
  traceChecks?.push({ label: "Rain during curing", passed: rainBeforeDryingComplete < 0.25, value: `${rainBeforeDryingComplete.toFixed(2)} in`, threshold: "< 0.25 in" });
  if (rainBeforeDryingComplete >= 0.25) return null;

  const noRainInForecast = rain.amount < 0.02 && rain.maxProbability < 30;
  const noRainInExtended = getRainMetrics(first48).amount < 0.05;
  const extendedDryingHours = getDryingMetrics(first48).dryingHours;
  const effectiveDryingHours = noRainInForecast && noRainInExtended ? extendedDryingHours : metrics.dryingHours;

  traceChecks?.push({ label: "Drying hours in window", passed: effectiveDryingHours >= 16, value: String(effectiveDryingHours), threshold: noRainInForecast && noRainInExtended ? `>= 16 (extended 48h, no rain)` : ">= 16" });
  if (effectiveDryingHours < 16) return null;
  traceChecks?.push({ label: "Humid hours (daytime, RH>80%)", passed: humidHours <= 12, value: String(humidHours), threshold: "<= 12" });
  if (humidHours > 12) return null;
  traceChecks?.push({ label: "Field recently wet", passed: !fieldRecentlyWet, value: fieldRecentlyWet ? "yes" : "no", threshold: "no" });
  if (fieldRecentlyWet) return null;

  traceChecks?.push({ label: "Significant rain near cut", passed: !significantRainNearCut, value: significantRainNearCut ? "yes" : "no", threshold: "no" });
  if (significantRainNearCut) return null;

  const dew = curingHours.filter((hour) => hour.dewRisk).length;
  const risk = labelRisk(curingHours, end);
  traceChecks?.push({ label: "Risk level", passed: risk !== "High", value: risk, threshold: "not High" });
  if (risk === "High") return null;

  const earlyRainPenalty = rainFirst24 >= 0.1 ? clamp(Math.round(rainFirst24 * 30), 0, 20) : 0;
  const marginBonus = Number.isFinite(dryingMargin) ? clamp(dryingMargin, 0, 18) * 1.6 : 28;
  const noRainBonus = rain.amount < 0.02 && rain.maxProbability < 30 ? 18 : 0;
  const humidityBonus = metrics.averageHumidity < 75 ? 10 : metrics.averageHumidity < 80 ? 4 : 0;
  const windBonus = metrics.averageWind >= 6 ? 9 : 0;
  const timingPenalty = clamp(hoursBetween(now, start) / 24, 0, 8);
  const offHoursPenalty = !isOperationHour(end) ? 15 : 0;
  const sunContrib = metrics.sunHours * 1.4;
  const dryContrib = effectiveDryingHours * 1.2;
  const windContrib = metrics.averageWind;
  const rainPenContrib = rain.penalty * 1.6;
  const dewContrib = dew * 1.5;

  traceScore?.push(
    { label: "No-rain bonus", value: noRainBonus, formula: noRainBonus > 0 ? `amount(${rain.amount.toFixed(2)})<0.02 & prob(${rain.maxProbability})<30 \u2192 18` : "0" },
    { label: "Margin bonus", value: marginBonus, formula: Number.isFinite(dryingMargin) ? `margin=${dryingMargin.toFixed(1)}h \u2192 clamp(0,18)\u00d71.6` : "\u221e margin \u2192 28" },
    { label: "Humidity bonus", value: humidityBonus, formula: `avgHumidity=${metrics.averageHumidity.toFixed(0)}` },
    { label: "Wind bonus", value: windBonus, formula: `avgWind=${metrics.averageWind.toFixed(1)} ${metrics.averageWind >= 6 ? "\u22656 \u2192 9" : "<6 \u2192 0"}` },
    { label: "Sun contrib", value: sunContrib, formula: `sunHours(${metrics.sunHours.toFixed(1)}) \u00d7 1.4` },
    { label: "Drying contrib", value: dryContrib, formula: noRainInForecast && noRainInExtended ? `dryingHours(${effectiveDryingHours}, extended 48h) × 1.2` : `dryingHours(${metrics.dryingHours}) × 1.2` },
    { label: "Wind contrib", value: windContrib, formula: `avgWind(${metrics.averageWind.toFixed(1)})` },
    { label: "Rain penalty", value: -rainPenContrib, formula: `rainPenalty(${rain.penalty.toFixed(1)}) \u00d7 1.6` },
    { label: "Dew penalty", value: -dewContrib, formula: `dewHours(${dew}) \u00d7 1.5` },
    { label: "Timing penalty", value: -timingPenalty, formula: `startIn${hoursBetween(now, start).toFixed(1)}h / 24, clamp(0,8)` },
    { label: "Off-hours penalty", value: -offHoursPenalty, formula: !isOperationHour(end) ? "end outside 10\u201317 \u2192 15" : "0" },
    { label: "Early-rain penalty", value: -earlyRainPenalty, formula: earlyRainPenalty > 0 ? `rain24(${rainFirst24.toFixed(2)}in)\u00d730, clamp(0,20)` : "0" }
  );

  const score = clamp(
    noRainBonus +
      marginBonus +
      humidityBonus +
      windBonus +
      sunContrib +
      dryContrib +
      windContrib -
      rainPenContrib -
      dewContrib -
      timingPenalty -
      offHoursPenalty -
      earlyRainPenalty,
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

function computeRakeTime(cutStart: Date, baleTime: Date | null, dryingHours: number, isBaleage: boolean, hourly?: HourlyWeather[], tedTime?: Date | null): Date | null {
  if (!baleTime) return null;
  const minDryingForRake = isBaleage ? 4 : 8;
  const earliestRake = addHours(cutStart, minDryingForRake);

  // Rake same day as baling, at 10am
  const baleDay = new Date(baleTime);
  baleDay.setHours(10, 0, 0, 0);
  let rake = snapOperationTime(baleDay, hourly);

  if (rake < earliestRake) {
    rake = snapOperationTime(earliestRake, hourly);
  }

  // Rake must be at least 24h after tedding
  if (tedTime && rake < addHours(tedTime, 24)) {
    const dayAfterTed = snapOperationTime(addHours(tedTime, 24), hourly);
    if (dayAfterTed < baleTime) return dayAfterTed;
    return snapOperationTime(addHours(baleTime, -2), hourly);
  }

  return rake;
}

function evaluateBaleageCandidateWindow(
  hourly: HourlyWeather[],
  start: Date,
  requiredDryingHours: number,
  recent: HayDecisionInput["weather"]["recent"],
  now: Date,
  traceChecks?: DebugCheck[],
  traceScore?: DebugScoreComponent[]
): CandidateEvaluation | null {
  const baleTime = addHours(start, requiredDryingHours);
  const wrapEnd = addHours(baleTime, 6);
  const curingHours = forecastBetween(hourly, start, baleTime);
  const wrapHours = forecastBetween(hourly, baleTime, wrapEnd);
  const minHours = Math.min(requiredDryingHours, 8);
  if (curingHours.length < minHours) {
    traceChecks?.push({ label: "Enough forecast hours", passed: false, value: String(curingHours.length), threshold: `>= ${minHours}` });
    return null;
  }
  traceChecks?.push({ label: "Enough forecast hours", passed: true, value: String(curingHours.length), threshold: `>= ${minHours}` });

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

  traceChecks?.push({ label: "Is operation hour", passed: isOperationHour(start), value: `${start.getHours()}:00`, threshold: "10:00\u201317:00" });
  if (!isOperationHour(start)) return null;
  traceChecks?.push({ label: "Rain before baling", passed: !significantRainBeforeBaling, value: `${rainBeforeBaling.toFixed(2)} in`, threshold: "< 0.25 in" });
  if (significantRainBeforeBaling) return null;
  traceChecks?.push({ label: "Rain in wrap window", passed: !rainInWrap, value: rainInWrap ? "yes" : "no", threshold: "no" });
  if (rainInWrap) return null;
  traceChecks?.push({ label: "Field recently wet", passed: !fieldRecentlyWet, value: fieldRecentlyWet ? "yes" : "no", threshold: "no" });
  if (fieldRecentlyWet) return null;
  traceChecks?.push({ label: "Drying hours", passed: metrics.dryingHours >= 4, value: String(metrics.dryingHours), threshold: ">= 4" });
  if (metrics.dryingHours < 4) return null;

  const firstRain = curingHours.find((hour) => hour.precipitationAmount > 0.05);
  const hasMinorRainAfterWilting = firstRain
    ? hoursBetween(start, new Date(firstRain.time)) > requiredDryingHours * 0.6
    : false;
  const rainPenalty = hasMinorRainAfterWilting ? rain.penalty * 0.5 : rain.penalty;

  const dew = curingHours.filter((hour) => hour.dewRisk).length;
  const risk = labelRisk(curingHours, baleTime);
  traceChecks?.push({ label: "Risk level", passed: risk !== "High", value: risk, threshold: "not High" });
  if (risk === "High") return null;

  const noRainBonus = rainBeforeBaling < 0.02 ? 18 : rainBeforeBaling < 0.1 ? 10 : 0;
  const humidityBonus = metrics.averageHumidity < 75 ? 10 : metrics.averageHumidity < 80 ? 4 : 0;
  const windBonus = metrics.averageWind >= 4 ? 6 : 0;
  const wrapBonus = !rainInWrap ? 12 : 0;
  const timingPenalty = clamp(hoursBetween(now, start) / 24, 0, 6);
  const offHoursPenalty = !isOperationHour(baleTime) ? 15 : 0;
  const sunContrib = metrics.sunHours * 1.0;
  const dryContrib = metrics.dryingHours * 0.8;
  const windContrib = metrics.averageWind * 0.5;
  const dewContrib = dew * 1.0;
  const rainPenContrib = rainPenalty;

  traceScore?.push(
    { label: "No-rain bonus", value: noRainBonus, formula: rainBeforeBaling < 0.02 ? `beforeBaling(${rainBeforeBaling.toFixed(2)})<0.02 \u2192 18` : rainBeforeBaling < 0.1 ? `\u2192 10` : "0" },
    { label: "Humidity bonus", value: humidityBonus, formula: `avgHumidity=${metrics.averageHumidity.toFixed(0)}` },
    { label: "Wind bonus", value: windBonus, formula: `avgWind=${metrics.averageWind.toFixed(1)} ${metrics.averageWind >= 4 ? "\u22654 \u2192 6" : "<4 \u2192 0"}` },
    { label: "Wrap bonus", value: wrapBonus, formula: !rainInWrap ? "no rain in wrap \u2192 12" : "0" },
    { label: "Sun contrib", value: sunContrib, formula: `sunHours(${metrics.sunHours.toFixed(1)}) \u00d7 1.0` },
    { label: "Drying contrib", value: dryContrib, formula: `dryingHours(${metrics.dryingHours}) \u00d7 0.8` },
    { label: "Wind contrib", value: windContrib, formula: `avgWind(${metrics.averageWind.toFixed(1)}) \u00d7 0.5` },
    { label: "Rain penalty", value: -rainPenContrib, formula: hasMinorRainAfterWilting ? `rainPenalty(${rain.penalty.toFixed(1)})\u00d70.5 (late rain)` : `rainPenalty(${rain.penalty.toFixed(1)})` },
    { label: "Dew penalty", value: -dewContrib, formula: `dewHours(${dew}) \u00d7 1.0` },
    { label: "Timing penalty", value: -timingPenalty, formula: `startIn${hoursBetween(now, start).toFixed(1)}h / 24, clamp(0,6)` },
    { label: "Off-hours penalty", value: -offHoursPenalty, formula: !isOperationHour(baleTime) ? "baleTime outside 10\u201317 \u2192 15" : "0" }
  );

  const score = clamp(
    noRainBonus +
      humidityBonus +
      windBonus +
      wrapBonus +
      sunContrib +
      dryContrib +
      windContrib -
      rainPenContrib -
      dewContrib -
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

function findBestBaleageCutWindow(
  input: HayDecisionInput,
  now: Date,
  currentDryingHours: number,
  traceCandidates?: DebugCandidate[]
) {
  const candidates = generateCandidates(now, input.weather.hourly);
  const scored = candidates
    .flatMap((start) => {
      const checks: DebugCheck[] | undefined = traceCandidates ? [] : undefined;
      const evaluation = evaluateBaleageCandidateWindow(
        input.weather.hourly,
        start,
        currentDryingHours,
        input.weather.recent,
        now,
        checks
      );
      if (traceCandidates) {
        const failCheck = checks?.find((c) => !c.passed);
        traceCandidates.push({
          start: start.toISOString(),
          score: evaluation?.score ?? 0,
          passed: evaluation !== null,
          failReason: failCheck ? `${failCheck.label}: ${failCheck.value} (need ${failCheck.threshold})` : null
        });
      }
      return evaluation ? [evaluation] : [];
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || (best.confidence === "low" && best.risk === "High")) {
    return {
      exists: false,
      start: "",
      end: "",
      startLabel: "",
      endLabel: "",
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
    startLabel: formatTime(best.start),
    endLabel: formatTime(addHours(best.start, 4)),
    dayLabel: formatDay(best.start),
    confidence: best.confidence,
    message:
      best.confidence === "high"
        ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. High confidence — short drying works well with baleage.`
        : best.confidence === "medium"
          ? `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Conditions are workable for baleage with moderate caution.`
          : `${prefix}: ${formatDay(best.start)} ${formatTime(best.start)} - ${formatTime(addHours(best.start, 4))}. Marginal window, but baleage may still work — validate first.`
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
  hasBestWindow: boolean,
  timelineBaleTime: Date | null
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
  if (rain.nextRainAt) {
    const rainTime = new Date(rain.nextRainAt);
    if (timelineBaleTime && rainTime > timelineBaleTime) {
      reasons.push(`Rain possible around ${formatDateTime(rainTime)} — rain after baling is OK if wrapped`);
    } else {
      reasons.push(`Rain possible around ${formatDateTime(rainTime)} — minor rain during wilting is manageable`);
    }
  } else reasons.push("No meaningful rain showing during wilting");
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
