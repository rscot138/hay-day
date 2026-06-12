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
