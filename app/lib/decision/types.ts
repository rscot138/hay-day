export type CropType = "alfalfa" | "grass" | "mixed";
export type SwathDensity = "light" | "medium" | "heavy";
export type Conditioning = "none" | "roller" | "impeller";
export type HarvestMethod = "dry_hay" | "baleage";

export type WeatherPoint = {
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

export type FieldConfig = {
  cropType: CropType;
  swathDensity: SwathDensity;
  conditioning: Conditioning;
  harvestMethod: HarvestMethod;
  latitude: number;
  longitude: number;
};

export type DecisionResult = {
  score: number;
  recommendation: "Cut Now" | "Proceed With Caution" | "Do Not Cut";
  reason: string;
};
