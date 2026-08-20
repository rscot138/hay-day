export type CropType = "alfalfa" | "grass" | "mixed";
export type SwathDensity = "light" | "medium" | "heavy";
export type Conditioning = "none" | "roller" | "impeller";
export type HarvestMethod = "dry_hay" | "baleage";
export type Confidence = "high" | "medium" | "low";
export type Risk = "Low" | "Moderate" | "High";

export type FieldSettings = {
  name: string;
  cropType: CropType;
  swathDensity: SwathDensity;
  conditioning: Conditioning;
  harvestMethod: HarvestMethod;
  latitude?: number;
  longitude?: number;
};

export type HourlyWeather = {
  time: string;
  precipitationProbability: number;
  precipitationAmount: number;
  temperature: number;
  relativeHumidity: number;
  windSpeed: number;
  cloudCover: number;
  sunFactor: number;
  dryingHour: boolean;
  dewRisk: boolean;
};

export type WeatherSummary = {
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;
  recent: {
    precipitationLast24h: number;
    lastRainAt: string | null;
    hoursSinceLastRain: number | null;
  };
  hourly: HourlyWeather[];
};

export type HayDecision = {
  score: number;
  recommendation: string;
  reasons: string[];
  dryingHours: number;
  bestWindow: {
    exists: boolean;
    start: string;
    end: string;
    startLabel: string;
    endLabel: string;
    dayLabel: string;
    confidence: Confidence;
    message: string;
  };
  tedding: {
    recommended: boolean;
    window: string;
    benefitHours: number;
    message: string;
  };
  timeline: {
    cut: string;
    ted?: string;
    rake: string;
    bale: string;
    wrap?: string;
  };
  comparison: {
    withTedding: {
      baleTime: string;
      risk: Risk;
    };
    withoutTedding: {
      baleTime: string;
      risk: Risk;
    };
    note?: string;
  };
  breakdown: {
    drying: {
      summary: string;
      sunHours: number;
      dryingHours: number;
      averageWind: number;
      averageHumidity: number;
    };
    rain: {
      summary: string;
      nextRainAt: string | null;
      maxProbability: number;
      amountDuringCuring: number;
    };
    field: {
      summary: string;
      residualPenalty: number;
      dewPenalty: number;
      baseDryingHours: number;
    };
  };
  harvestMethod: HarvestMethod;
  debug?: DebugTrace;
  harvestComparison?: {
    dryHay: {
      summary: string;
      cut: string;
      bale: string;
      risk: Risk;
    };
    baleage: {
      summary: string;
      cut: string;
      bale: string;
      wrap: string;
      risk: Risk;
    };
  };
};

export type HayDecisionInput = {
  field: FieldSettings;
  weather: WeatherSummary;
  now?: string;
};

export type DebugCheck = {
  label: string;
  passed: boolean;
  value: string;
  threshold: string;
};

export type DebugScoreComponent = {
  label: string;
  value: number;
  formula: string;
};

export type DebugCandidate = {
  start: string;
  score: number;
  passed: boolean;
  failReason: string | null;
};

export type DebugTrace = {
  capturedAt: string;
  recent: {
    precipitationLast24h: number;
    lastRainAt: string | null;
    hoursSinceLastRain: number | null;
  };
  forecastHours: HourlyWeather[];
  baseScore: {
    sunHours: number;
    dryingHours: number;
    averageWind: number;
    averageHumidity: number;
    rainPenalty: number;
    rainAmount: number;
    rainMaxProbability: number;
    rainNextAt: string | null;
    residualPenalty: number;
    dewPenalty: number;
    windBonus: number;
    dryingPotential: number;
    rawFormula: string;
    score: number;
  };
  dryingEstimate: {
    harvestMethod: string;
    density: string;
    conditioning: string;
    base: number;
    conditioningFactor: number;
    sunAdjustment: number;
    windAdjustment: number;
    humidityAdjustment: number;
    residualAdjustment: number;
    dewAdjustment: number;
    result: number;
  };
  currentWindow: {
    start: string;
    end: string;
    passed: boolean;
    failReason: string | null;
    checks: DebugCheck[];
    scoreComponents: DebugScoreComponent[] | null;
    windowScore: number | null;
  };
  bestWindow: {
    candidatesChecked: number;
    passedCandidates: number;
    exists: boolean;
    start: string;
    score: number;
    confidence: string;
    candidates: DebugCandidate[];
  };
  final: {
    hasCurrentWindow: boolean;
    baseScore: number;
    finalScore: number;
    recommendation: string;
    statusRule: string;
  };
};
