"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudRain,
  Compass,
  Loader2,
  MapPin,
  RefreshCw,
  Scissors,
  Settings,
  Shield,
  Shovel,
  Sun,
  Tractor,
  Waves,
  Wind
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FieldSettings, HayDecision, WeatherSummary } from "@/app/types/hay";
import { cn } from "@/app/lib/utils";

type ApiState =
  | { status: "idle" | "locating" | "loading"; error?: undefined }
  | { status: "ready"; error?: undefined }
  | { status: "error"; error: string };

type ApiResult = {
  weather: WeatherSummary;
  decision: HayDecision;
};

const STORAGE_KEY = "hay-decision-field-v1";

const defaultField: FieldSettings = {
  name: "Current Field",
  cropType: "mixed",
  swathDensity: "medium",
  conditioning: "roller",
  harvestMethod: "dry_hay"
};

const tabs = ["Home", "Breakdown", "Timeline", "Tedding", "Field"] as const;
type Tab = (typeof tabs)[number];

export default function Home() {
  const [field, setField] = useState<FieldSettings>(defaultField);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [state, setState] = useState<ApiState>({ status: "idle" });
  const [result, setResult] = useState<ApiResult | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FieldSettings;
        setField({ ...defaultField, ...parsed });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  const saveField = useCallback((next: FieldSettings) => {
    setField(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const loadDecision = useCallback(async (nextField: FieldSettings) => {
    if (!Number.isFinite(nextField.latitude) || !Number.isFinite(nextField.longitude)) return;
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/hay-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: nextField.latitude,
          longitude: nextField.longitude,
          field: nextField
        })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error || "Decision data is unavailable.");
      }

      const data = (await response.json()) as ApiResult;
      setResult(data);
      setUpdatedAt(new Date());
      setState({ status: "ready" });
    } catch (error) {
      setState({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Weather data is unavailable. Next step: refresh or set a precise field location."
      });
    }
  }, []);

  const locateField = useCallback(() => {
    if (!navigator.geolocation) {
      setState({
        status: "error",
        error: "Geolocation is not available. Next step: enter field coordinates in Field Setup."
      });
      setActiveTab("Field");
      return;
    }

    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          ...field,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        saveField(next);
        void loadDecision(next);
      },
      () => {
        setState({
          status: "error",
          error: "Location permission was not granted. Next step: enter coordinates in Field Setup."
        });
        setActiveTab("Field");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15 * 60 * 1000 }
    );
  }, [field, loadDecision, saveField]);

  useEffect(() => {
    if (!hydrated) return;
    if (Number.isFinite(field.latitude) && Number.isFinite(field.longitude)) {
      void loadDecision(field);
      return;
    }
    locateField();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, field.latitude, field.longitude]);

  const updatedLabel = useMemo(() => {
    if (!updatedAt) return "Not updated yet";
    const minutes = Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 60000));
    return minutes === 0 ? "Updated just now" : `Updated ${minutes} min ago`;
  }, [updatedAt]);

  const decision = result?.decision;

  return (
    <main className="min-h-screen pb-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:py-6">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hay Decision Engine
            </p>
            <h1 className="truncate text-xl font-bold text-foreground sm:text-2xl">
              {field.name || "Current Field"}
            </h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> {updatedLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() =>
              Number.isFinite(field.latitude) && Number.isFinite(field.longitude)
                ? loadDecision(field)
                : locateField()
            }
            aria-label="Refresh decision"
          >
            <RefreshCw className={cn("h-4 w-4", state.status === "loading" && "animate-spin")} />
          </Button>
        </header>

        <nav className="timeline-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "h-10 shrink-0 rounded-md border px-3 text-sm font-semibold transition-colors",
                activeTab === tab
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </nav>

        {state.status === "locating" || state.status === "loading" ? (
          <LoadingPanel locating={state.status === "locating"} />
        ) : null}

        {state.status === "error" ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Decision unavailable</p>
                <p className="text-sm text-muted-foreground">{state.error}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "Home" && decision ? (
          <HomeScreen field={field} decision={decision} />
        ) : null}
        {activeTab === "Breakdown" && decision ? (
          <BreakdownScreen decision={decision} weather={result.weather} />
        ) : null}
        {activeTab === "Timeline" && decision && result ? (
          <TimelineScreen decision={decision} weather={result.weather} />
        ) : null}
        {activeTab === "Tedding" && decision ? <TeddingScreen decision={decision} /> : null}
        {activeTab === "Field" ? (
          <FieldSetup
            field={field}
            onSave={(next) => {
              saveField(next);
              if (next.latitude && next.longitude) void loadDecision(next);
            }}
            onLocate={locateField}
          />
        ) : null}

        {!decision && state.status !== "loading" && state.status !== "locating" ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-lg font-semibold">Set a field location to get a real decision.</p>
              <p className="text-sm text-muted-foreground">
                Next step: use current location or enter coordinates in Field Setup. The app will fetch live Open-Meteo data before making any recommendation.
              </p>
              <Button onClick={locateField}>
                <Compass className="h-4 w-4" /> Use current location
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function LoadingPanel({ locating }: { locating: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <div>
          <p className="font-semibold">{locating ? "Finding your field" : "Checking hay weather"}</p>
          <p className="text-sm text-muted-foreground">
            Pulling live weather and calculating the next cut, ted, and bale steps.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function HomeScreen({ field, decision }: { field: FieldSettings; decision: HayDecision }) {
  const isBaleage = decision.harvestMethod === "baleage";
  const statusTone =
    decision.score >= 70
      ? "bg-primary text-primary-foreground"
      : decision.score >= 50
        ? "bg-secondary text-secondary-foreground"
        : "bg-destructive text-destructive-foreground";

  return (
    <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className={cn("rounded-lg p-5 shadow-field sm:p-7", statusTone)}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold opacity-85">Should I cut right now?</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-70">{isBaleage ? "Baleage mode" : "Dry hay mode"}</p>
            <p className="mt-2 text-4xl font-black sm:text-6xl">{decision.recommendation}</p>
          </div>
          <div className="rounded-md bg-white/18 px-3 py-2 text-right">
            <p className="text-xs font-semibold opacity-85">Hay Score</p>
            <p className="text-5xl font-black leading-none sm:text-7xl">{decision.score}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {decision.reasons.map((reason) => (
            <div key={reason} className="flex gap-2 rounded-md bg-white/14 p-3 text-sm font-medium">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        {decision.recommendation !== "CUT NOW" ? (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sun className="h-5 w-5 text-primary" /> Best Cut Window
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{decision.bestWindow.message}</p>
              <p className="mt-2 text-sm capitalize text-muted-foreground">
                Confidence: {decision.bestWindow.confidence}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tractor className="h-5 w-5 text-primary" /> Action Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ActionRow icon={<Scissors className="h-4 w-4" />} label="Cut" value={decision.timeline.cut} />
            {isBaleage ? (
              <>
                <ActionRow icon={<Waves className="h-4 w-4" />} label="Bale" value={decision.timeline.bale} />
                <ActionRow icon={<Shield className="h-4 w-4" />} label="Wrap (within 6h)" value={decision.timeline.wrap || "Wrap immediately after baling"} />
              </>
            ) : (
              <>
                <ActionRow icon={<Shovel className="h-4 w-4" />} label="Ted optional" value={decision.timeline.ted || decision.tedding.window} muted />
                <ActionRow icon={<Waves className="h-4 w-4" />} label="Bale" value={decision.timeline.bale} />
              </>
            )}
          </CardContent>
        </Card>

        {isBaleage && decision.harvestComparison ? (
          <Card>
            <CardHeader>
              <CardTitle>Dry Hay vs Baleage</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <CompareTile
                label="Dry Hay"
                bale={decision.harvestComparison.dryHay.cut}
                value2={decision.harvestComparison.dryHay.bale}
                risk={decision.harvestComparison.dryHay.risk}
              />
              <CompareTile
                label="Baleage"
                bale={decision.harvestComparison.baleage.cut}
                value2={`Bale: ${decision.harvestComparison.baleage.bale}`}
                extra={`Wrap: ${decision.harvestComparison.baleage.wrap}`}
                risk={decision.harvestComparison.baleage.risk}
              />
            </CardContent>
          </Card>
        ) : null}

        {!isBaleage ? (
          <Card>
            <CardHeader>
              <CardTitle>With vs Without Tedding</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <CompareTile label="With tedding" bale={decision.comparison.withTedding.baleTime} risk={decision.comparison.withTedding.risk} />
              <CompareTile label="Without" bale={decision.comparison.withoutTedding.baleTime} risk={decision.comparison.withoutTedding.risk} />
            </CardContent>
          </Card>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Field profile: {field.cropType}, {field.swathDensity} swath, {field.conditioning} conditioning. {isBaleage ? "Baleage mode." : "Dry hay mode."}
        </p>
      </div>
    </section>
  );
}

function BreakdownScreen({ decision, weather }: { decision: HayDecision; weather: WeatherSummary }) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <MetricCard
        icon={<Sun className="h-5 w-5 text-primary" />}
        title="Drying Conditions"
        summary={decision.breakdown.drying.summary}
        stats={[
          ["Sun hours", `${decision.breakdown.drying.sunHours}`],
          ["Drying hours", `${decision.breakdown.drying.dryingHours}`],
          ["Wind", `${decision.breakdown.drying.averageWind} mph`],
          ["Humidity", `${decision.breakdown.drying.averageHumidity}%`]
        ]}
      />
      <MetricCard
        icon={<CloudRain className="h-5 w-5 text-primary" />}
        title="Rain Risk"
        summary={decision.breakdown.rain.summary}
        stats={[
          ["Max probability", `${decision.breakdown.rain.maxProbability}%`],
          ["Rain in curing", `${decision.breakdown.rain.amountDuringCuring} in`],
          ["Last 24h", `${weather.recent.precipitationLast24h} in`],
          ["Since rain", weather.recent.hoursSinceLastRain === null ? "No recent rain" : `${weather.recent.hoursSinceLastRain} h`]
        ]}
      />
      <MetricCard
        icon={<MapPin className="h-5 w-5 text-primary" />}
        title="Field Conditions"
        summary={decision.breakdown.field.summary}
        stats={[
          ["Base dry time", `${decision.breakdown.field.baseDryingHours} h`],
          ["Estimate", `${decision.dryingHours} h`],
          ["Moisture penalty", `${decision.breakdown.field.residualPenalty}`],
          ["Dew penalty", `${decision.breakdown.field.dewPenalty}`]
        ]}
      />
    </section>
  );
}

function TimelineScreen({ decision, weather }: { decision: HayDecision; weather: WeatherSummary }) {
  const isBaleage = decision.harvestMethod === "baleage";
  const hours = weather.hourly.filter((hour) => new Date(hour.time) >= new Date()).slice(0, 168);
  const markerTimes = isBaleage
    ? [
        { label: "CUT", time: decision.timeline.cut, className: "bg-primary text-primary-foreground" },
        { label: "BALE", time: decision.timeline.bale, className: "bg-secondary text-secondary-foreground" },
        { label: "WRAP", time: decision.timeline.wrap || "N/A", className: "border border-dashed border-amber-600 bg-background text-amber-700" }
      ]
    : [
        { label: "CUT", time: decision.timeline.cut, className: "bg-primary text-primary-foreground" },
        { label: "TED", time: decision.tedding.window, className: "border border-dashed border-primary bg-background text-primary" },
        { label: "BALE", time: decision.timeline.bale, className: "bg-secondary text-secondary-foreground" }
      ];

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Next 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="timeline-scroll overflow-x-auto pb-3">
            <div className="relative flex min-w-[1120px] gap-1">
              {hours.map((hour) => {
                const rain = hour.precipitationProbability >= 35 || hour.precipitationAmount > 0.01;
                return (
                  <div
                    key={hour.time}
                    className={cn(
                      "flex h-32 w-10 shrink-0 flex-col justify-end rounded-md border p-1 text-[10px]",
                      rain ? "bg-sky-100" : hour.sunFactor > 0.5 ? "bg-yellow-100" : "bg-card"
                    )}
                  >
                    <div className="mb-auto text-center text-muted-foreground">{new Date(hour.time).getHours()}</div>
                    <div
                      className="rounded-sm bg-primary/80"
                      style={{ height: `${Math.max(8, hour.windSpeed * 3)}px` }}
                      title={`${hour.windSpeed} mph wind`}
                    />
                    {rain ? <CloudRain className="mx-auto mt-1 h-3 w-3 text-sky-700" /> : <Sun className="mx-auto mt-1 h-3 w-3 text-yellow-700" />}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {markerTimes.map((marker) => (
              <span key={marker.label} className={cn("rounded-md px-2 py-1 text-xs font-bold", marker.className)}>
                {marker.label}: {marker.time}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function TeddingScreen({ decision }: { decision: HayDecision }) {
  const isBaleage = decision.harvestMethod === "baleage";
  return (
    <section className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
      {isBaleage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" /> Baleage Wrap Requirement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-lg font-semibold">Bales must be wrapped within 6 hours of baling.</p>
            <p className="text-sm text-muted-foreground">
              The system checks for rain during the wrap window. If rain is forecast within 6 hours after baling, the window is rejected to protect feed quality. Tedding is not used with baleage since the wilting period is much shorter.
            </p>
            {decision.timeline.wrap ? (
              <p className="text-sm font-semibold text-primary">Wrap window: {decision.timeline.wrap}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shovel className="h-5 w-5 text-primary" /> Tedding Detail
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xl font-semibold">{decision.tedding.message}</p>
            <p className="text-sm text-muted-foreground">
              Tedding is never required here; it is a time-saving option when the crop needs more air before the bale window.
            </p>
          </CardContent>
        </Card>
      )}
      {isBaleage ? (
        <Card>
          <CardHeader>
            <CardTitle>Baleage Timeline</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ActionRow icon={<Scissors className="h-4 w-4" />} label="Cut" value={decision.timeline.cut} />
            <ActionRow icon={<Waves className="h-4 w-4" />} label="Bale" value={decision.timeline.bale} />
            <ActionRow icon={<Shield className="h-4 w-4" />} label="Wrap" value={decision.timeline.wrap || "Wrap immediately"} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Expected Benefit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ActionRow icon={<Clock className="h-4 w-4" />} label="Window" value={decision.tedding.window} />
            <ActionRow icon={<Wind className="h-4 w-4" />} label="Saved time" value={`~${decision.tedding.benefitHours} hours`} />
            <ActionRow icon={<Waves className="h-4 w-4" />} label="With tedding" value={`${decision.comparison.withTedding.baleTime}, ${decision.comparison.withTedding.risk} risk`} />
            <ActionRow icon={<CloudRain className="h-4 w-4" />} label="Without" value={`${decision.comparison.withoutTedding.baleTime}, ${decision.comparison.withoutTedding.risk} risk`} muted />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function FieldSetup({
  field,
  onSave,
  onLocate
}: {
  field: FieldSettings;
  onSave: (field: FieldSettings) => void;
  onLocate: () => void;
}) {
  const [draft, setDraft] = useState<FieldSettings>(field);

  useEffect(() => setDraft(field), [field]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Field Setup
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Label text="Field name">
          <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </Label>
        <Label text="Crop type">
          <Select value={draft.cropType} onChange={(event) => setDraft({ ...draft, cropType: event.target.value as FieldSettings["cropType"] })}>
            <option value="alfalfa">Alfalfa</option>
            <option value="grass">Grass</option>
            <option value="mixed">Mixed</option>
          </Select>
        </Label>
        <Label text="Swath density">
          <Select value={draft.swathDensity} onChange={(event) => setDraft({ ...draft, swathDensity: event.target.value as FieldSettings["swathDensity"] })}>
            <option value="light">Light</option>
            <option value="medium">Medium</option>
            <option value="heavy">Heavy</option>
          </Select>
        </Label>
        <Label text="Conditioning">
          <Select value={draft.conditioning} onChange={(event) => setDraft({ ...draft, conditioning: event.target.value as FieldSettings["conditioning"] })}>
            <option value="none">None</option>
            <option value="roller">Roller</option>
            <option value="impeller">Impeller</option>
          </Select>
        </Label>
        <Label text="Harvest method">
          <Select value={draft.harvestMethod} onChange={(event) => setDraft({ ...draft, harvestMethod: event.target.value as FieldSettings["harvestMethod"] })}>
            <option value="dry_hay">Dry hay</option>
            <option value="baleage">Baleage (wrapped)</option>
          </Select>
        </Label>
        <Label text="Latitude">
          <Input
            inputMode="decimal"
            value={draft.latitude ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                latitude: event.target.value === "" ? undefined : Number(event.target.value)
              })
            }
          />
        </Label>
        <Label text="Longitude">
          <Input
            inputMode="decimal"
            value={draft.longitude ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                longitude: event.target.value === "" ? undefined : Number(event.target.value)
              })
            }
          />
        </Label>
        <div className="flex flex-col gap-2 md:col-span-2 sm:flex-row">
          <Button onClick={() => onSave(draft)}>
            <CheckCircle2 className="h-4 w-4" /> Save field
          </Button>
          <Button variant="outline" onClick={onLocate}>
            <Compass className="h-4 w-4" /> Use current location
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold">
      {text}
      {children}
    </label>
  );
}

function ActionRow({
  icon,
  label,
  value,
  muted
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-md border p-3", muted && "border-dashed bg-muted/45")}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function CompareTile({ label, bale, value2, extra, risk }: { label: string; bale: string; value2?: string; extra?: string; risk: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{bale}</p>
      {value2 ? <p className="text-xs text-muted-foreground">{value2}</p> : null}
      {extra ? <p className="text-xs text-muted-foreground">{extra}</p> : null}
      <p className={cn("mt-2 text-sm font-semibold", risk === "High" ? "text-destructive" : risk === "Moderate" ? "text-amber-700" : "text-primary")}>
        Risk: {risk}
      </p>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  summary,
  stats
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  stats: [string, string][];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{summary}</p>
        <div className="mt-4 grid gap-2">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
