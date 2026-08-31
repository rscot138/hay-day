"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  CloudRain,
  Compass,
  Droplets,
  Gauge,
  ListChecks,
  Loader2,
  MapPin,
  MapPinned,
  Menu,
  Moon,
  X,
  RefreshCw,
  Scissors,
  Settings,
  Share2,
  Shield,
  Shovel,
  Sprout,
  Sun,
  Sunrise,
  Timer,
  Tractor,
  Waves,
  Wheat,
  Wind
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FieldSettings, HayDecision, DebugTrace, HourlyWeather, WeatherSummary } from "@/app/types/hay";
import { cn } from "@/app/lib/utils";
import { track } from "@/app/lib/analytics";

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
  name: "",
  cropType: "mixed",
  swathDensity: "medium",
  conditioning: "roller",
  harvestMethod: "dry_hay",
  lastCutTiming: "unknown"
};

const tabs = ["Home", "Breakdown", "Timeline", "Tedding", "Field"] as const;
type Tab = (typeof tabs)[number];

const tabMeta: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "Home", label: "Decision", icon: <Gauge className="h-4 w-4" /> },
  { id: "Breakdown", label: "Breakdown", icon: <ListChecks className="h-4 w-4" /> },
  { id: "Timeline", label: "Forecast", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "Tedding", label: "Tedding & Rake", icon: <Tractor className="h-4 w-4" /> },
  { id: "Field", label: "Field Setup", icon: <MapPinned className="h-4 w-4" /> }
];

type HeroTone = {
  gradient: string;
  text: string;
  sub: string;
  badge: string;
  pill: string;
  ring: string;
  track: string;
};

const heroTones: Record<"good" | "caution" | "bad", HeroTone> = {
  good: {
    gradient: "from-[#2b6b3f] via-[#245a35] to-[#163d25]",
    text: "text-[#f6f7ee]",
    sub: "text-[#f6f7ee]/70",
    badge: "bg-white/15 text-[#f6f7ee]",
    pill: "bg-white/10 text-[#f6f7ee]",
    ring: "stroke-[#f6f7ee]",
    track: "stroke-[#f6f7ee]/20"
  },
  caution: {
    gradient: "from-[#e2ab3f] via-[#d69c2e] to-[#b67f1e]",
    text: "text-[#3b2c07]",
    sub: "text-[#3b2c07]/70",
    badge: "bg-black/12 text-[#3b2c07]",
    pill: "bg-black/8 text-[#3b2c07]",
    ring: "stroke-[#3b2c07]",
    track: "stroke-[#3b2c07]/20"
  },
  bad: {
    gradient: "from-[#d25a41] via-[#c14831] to-[#942e1c]",
    text: "text-[#fdf6f4]",
    sub: "text-[#fdf6f4]/70",
    badge: "bg-white/15 text-[#fdf6f4]",
    pill: "bg-white/10 text-[#fdf6f4]",
    ring: "stroke-[#fdf6f4]",
    track: "stroke-[#fdf6f4]/20"
  }
};

export default function Home() {
  const [field, setField] = useState<FieldSettings>(defaultField);
  const [activeTab, setActiveTab] = useState<Tab>("Home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [state, setState] = useState<ApiState>({ status: "idle" });
  const [result, setResult] = useState<ApiResult | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const hasVisited = window.localStorage.getItem("hay-day-visited");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FieldSettings;
        setField({ ...defaultField, ...parsed });
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
    track("app opened", { return_visit: !!hasVisited });
    window.localStorage.setItem("hay-day-visited", "1");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDebugMode(params.has("debug"));
  }, []);

  const saveField = useCallback((next: FieldSettings) => {
    setField(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    track("field saved", { crop_type: next.cropType, harvest_method: next.harvestMethod, has_name: !!next.name });
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
      track("decision generated", {
        recommendation: data.decision.recommendation,
        score: data.decision.score,
        harvest_method: nextField.harvestMethod,
        crop_type: nextField.cropType
      });
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
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("nav")) setMenuOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [menuOpen]);

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:py-7">
        {!debugMode && (
          <>
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card">
                  <Sprout className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
                      Hay Day
                </p>
                <span className="rounded-full bg-secondary/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                  {field.harvestMethod === "baleage" ? "Baleage" : "Dry hay"}
                </span>
              </div>
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {field.name || "Current Field"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-card sm:flex">
              <Clock className="h-3.5 w-3.5" /> {updatedLabel}
            </span>
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
              className="rounded-lg border-border/70 bg-card shadow-card"
            >
              <RefreshCw className={cn("h-4 w-4", state.status === "loading" && "animate-spin")} />
            </Button>
          </div>
        </header>

        <nav className="-mx-4 px-4 pb-1 sm:mx-0 sm:px-0">
          {/* Desktop tabs */}
          <div className="hidden sm:flex items-center gap-1 rounded-xl border border-border/60 bg-card p-1 shadow-card">
            {tabMeta.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all",
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Mobile hamburger */}
          <div className="relative sm:hidden">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2 shadow-card">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {tabMeta.find((t) => t.id === activeTab)?.icon}
                {tabMeta.find((t) => t.id === activeTab)?.label}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>

            {menuOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border/60 bg-card shadow-lg">
                {tabMeta.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>
        </>
        )}

        {state.status === "locating" || state.status === "loading" ? (
          <LoadingPanel locating={state.status === "locating"} />
        ) : null}

        {state.status === "error" ? (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-destructive">Decision unavailable</p>
                <p className="text-sm text-muted-foreground">{state.error}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {debugMode && decision ? (
          <DebugScreen decision={decision} />
        ) : (
          <>
            {activeTab === "Home" && decision ? (
              <HomeScreen field={field} decision={decision} onFieldChange={saveField} />
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
          </>
        )}

        {!decision && state.status !== "loading" && state.status !== "locating" ? (
          <Card>
            <CardContent className="space-y-4 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <MapPinned className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight">Set a field location</p>
                  <p className="text-sm text-muted-foreground">
                    Use your current location or enter coordinates to get a real decision.
                  </p>
                </div>
              </div>
              <Button onClick={locateField}>
                <Compass className="h-4 w-4" /> Use current location
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
      <footer className="border-t border-border/50 py-4 text-center text-xs font-medium text-muted-foreground">
        Powered by{" "}
        <a href="https://www.homesteadcommerce.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
          Homestead Commerce
        </a>
      </footer>
    </main>
  );
}

function LoadingPanel({ locating }: { locating: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {locating ? (
            <MapPin className="h-5 w-5" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold tracking-tight">
            {locating ? "Finding your field" : "Checking hay weather"}
          </p>
          <p className="text-sm text-muted-foreground">
            Pulling live weather and calculating the next cut, ted, and bale steps.
          </p>
        </div>
        <div className="hidden h-2 w-2 animate-pulse rounded-full bg-primary sm:block" />
      </CardContent>
    </Card>
  );
}

function ScoreRing({ score, tone }: { score: number; tone: HeroTone }) {
  const size = 112;
  const radius = size / 2 - 9;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="8"
          className={tone.track}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          className={tone.ring}
        />
      </svg>
      <div className={cn("absolute inset-0 flex flex-col items-center justify-center", tone.text)}>
        <span className="text-4xl font-black leading-none tracking-tight">{score}</span>
        <span className={cn("mt-1 text-[10px] font-bold uppercase tracking-widest", tone.sub)}>
          Score
        </span>
      </div>
    </div>
  );
}

function HomeScreen({ field, decision, onFieldChange }: { field: FieldSettings; decision: HayDecision; onFieldChange: (field: FieldSettings) => void }) {
  const isBaleage = decision.harvestMethod === "baleage";
  const tone = decision.score >= 70 ? heroTones.good : decision.score >= 50 ? heroTones.caution : heroTones.bad;
  const hasCurrentWindow = decision.recommendation === "CUT NOW" || decision.recommendation === "PROCEED WITH CAUTION";
  const showUpcomingWindow = !hasCurrentWindow && decision.bestWindow.exists;
  const [saveName, setSaveName] = useState(field.name);
  const fieldNeedsName = !field.name;
  const [proEmail, setProEmail] = useState("");
  const [proName, setProName] = useState("");
  const [proSubmitted, setProSubmitted] = useState(false);

  const steps = isBaleage
    ? [
        { icon: <Scissors className="h-4 w-4" />, label: "Cut", value: decision.timeline.cut },
        { icon: <Wind className="h-4 w-4" />, label: "Rake", value: decision.timeline.rake },
        { icon: <Waves className="h-4 w-4" />, label: "Bale", value: decision.timeline.bale },
        { icon: <Shield className="h-4 w-4" />, label: "Wrap within 6h", value: decision.timeline.wrap || "Wrap immediately" }
      ]
    : [
        { icon: <Scissors className="h-4 w-4" />, label: "Cut", value: decision.timeline.cut },
        { icon: <Shovel className="h-4 w-4" />, label: "Ted (optional)", value: decision.timeline.ted || decision.tedding.window, muted: true },
        { icon: <Wind className="h-4 w-4" />, label: "Rake", value: decision.timeline.rake },
        { icon: <Waves className="h-4 w-4" />, label: "Bale", value: decision.timeline.bale }
      ];

  return (
    <section className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      {showUpcomingWindow ? (
        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#d25a41] via-[#c14831] to-[#942e1c] p-4 shadow-lift sm:p-5">
            <Wheat className="pointer-events-none absolute -bottom-4 -right-3 h-24 w-24 opacity-[0.09]" strokeWidth={1} />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#fdf6f4]">
                  {isBaleage ? "Baleage" : "Dry hay"}
                </span>
                <p className="mt-2 text-2xl font-black leading-none tracking-tight text-[#fdf6f4] sm:text-3xl">
                  DO NOT CUT
                </p>
              </div>
              <ScoreRing score={decision.score} tone={heroTones.bad} />
            </div>
            <p className="relative mt-2 text-sm font-medium text-[#fdf6f4]/70">
              Conditions are not right for cutting right now.
            </p>
            <div className="relative mt-4 grid gap-2 sm:grid-cols-2">
              {decision.reasons.map((reason) => (
                <div key={reason} className="flex gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-medium text-[#fdf6f4]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2b6b3f] via-[#245a35] to-[#163d25] p-5 shadow-lift sm:p-7">
            <Wheat className="pointer-events-none absolute -bottom-6 -right-4 h-36 w-36 opacity-[0.09]" strokeWidth={1} />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#f6f7ee]">
                  Upcoming window
                </span>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#f6f7ee]/70">
                  {decision.bestWindow.confidence} confidence
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-[#f6f7ee]/70">Keep an eye on this upcoming window</p>
              <p className="mt-1 text-xl font-black leading-snug tracking-tight text-[#f6f7ee] sm:text-2xl">
                {decision.bestWindow.dayLabel}
              </p>
              {decision.bestWindow.startLabel ? (
                <p className="mt-1 text-sm font-medium text-[#f6f7ee]/70">
                  {decision.bestWindow.startLabel}
                  {" \u2014 "}
                  {decision.bestWindow.endLabel}
                </p>
              ) : null}
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#f6f7ee]/80">
                {decision.bestWindow.message}
              </p>
              {decision.bestWindow.reasons.length > 0 ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {decision.bestWindow.reasons.map((reason) => (
                    <div key={reason} className="flex gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-medium text-[#f6f7ee]">
                      <Wheat className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className={cn("relative overflow-hidden rounded-2xl p-5 shadow-lift sm:p-8", tone.text)}>
          <div className={cn("absolute inset-0 bg-gradient-to-br", tone.gradient)} />
          <Wheat className="pointer-events-none absolute -bottom-8 -right-6 h-48 w-48 opacity-[0.09]" strokeWidth={1} />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest", tone.badge)}>
                  {isBaleage ? "Baleage mode" : "Dry hay mode"}
                </span>
                <span className={cn("text-[11px] font-bold uppercase tracking-widest", tone.sub)}>
                  Live forecast
                </span>
              </div>
              <p className={cn("mt-4 text-sm font-semibold", tone.sub)}>Should I cut right now?</p>
              <p className="mt-1 text-5xl font-black leading-none tracking-tight sm:text-6xl">
                {decision.recommendation}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ScoreRing score={decision.score} tone={tone} />
              <ShareButton label={decision.recommendation} score={decision.score} />
            </div>
          </div>
          <div className="relative mt-6 grid gap-2 sm:grid-cols-2">
            {decision.reasons.map((reason) => (
              <div key={reason} className={cn("flex gap-2.5 rounded-xl px-3.5 py-3 text-sm font-medium", tone.pill)}>
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {fieldNeedsName ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">Save this field for next time</p>
                <p className="text-xs text-muted-foreground">Give it a name so you can come back to it later.</p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. North 40"
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  className="w-full sm:w-40"
                />
                <Button
                  size="sm"
                  onClick={() => onFieldChange({ ...field, name: saveName || "My Field" })}
                >
                  <CheckCircle2 className="h-4 w-4" /> Save
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Tractor className="h-4 w-4" />
              </div>
              Action Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionStepper steps={steps} />
          </CardContent>
        </Card>

        {isBaleage && decision.harvestComparison ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Wheat className="h-4 w-4" />
                </div>
                Dry Hay vs Baleage
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <CompareTile
                label="Dry Hay"
                bale={decision.harvestComparison.dryHay.cut}
                value2={decision.harvestComparison.dryHay.bale}
              />
              <CompareTile
                label="Baleage"
                bale={decision.harvestComparison.baleage.cut}
                value2={`Bale: ${decision.harvestComparison.baleage.bale}`}
                extra={`Wrap: ${decision.harvestComparison.baleage.wrap}`}
              />
            </CardContent>
          </Card>
        ) : null}

        {!isBaleage ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Wheat className="h-4 w-4" />
                </div>
                With vs Without Tedding
              </CardTitle>
              {decision.tedding.recommended ? (
                <span className="ml-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  Recommended
                </span>
              ) : decision.tedding.benefitHours > 0 ? (
                <span className="ml-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                  Saves ~{decision.tedding.benefitHours}h
                </span>
              ) : (
                <span className="ml-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Not Recommended
                </span>
              )}
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <CompareTile
                label="With tedding"
                bale={decision.comparison.withTedding.baleTime === decision.comparison.withoutTedding.baleTime ? "No change" : decision.comparison.withTedding.baleTime}
              />
              <CompareTile label="Without" bale={decision.comparison.withoutTedding.baleTime} />
            </CardContent>
          </Card>
        ) : null}

        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          Field profile: {field.cropType}, {field.swathDensity} swath, {field.conditioning} conditioning. {isBaleage ? "Baleage mode." : "Dry hay mode."}
        </p>

        <Card className="border-secondary/30 bg-secondary/5">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-secondary/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-secondary-foreground">
                Pro features coming soon
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ProFeature label="Confidence score" description="Deeper scoring breakdown with per-factor confidence ratings." />
              <ProFeature label="Exact timing" description="Minute-level cut, rake, and bale timing instead of hourly windows." />
              <ProFeature label="Multiple fields" description="Save and switch between fields without re-entering setup each time." />
              <ProFeature label="Alerts" description="Get notified when conditions are right — or about to turn." />
            </div>
            {proSubmitted ? (
              <p className="mt-4 text-sm font-semibold text-primary">Thanks — we&apos;ll be in touch.</p>
            ) : (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 grid gap-2 sm:grid-cols-2">
                  <Input placeholder="Name (optional)" value={proName} onChange={(e) => setProName(e.target.value)} />
                  <Input placeholder="Email" type="email" value={proEmail} onChange={(e) => setProEmail(e.target.value)} />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!proEmail}
                  onClick={() => {
                    if (!proEmail) return;
                    setProSubmitted(true);
                  }}
                >
                  Want early access to Pro?
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ActionStepper({ steps }: { steps: { icon: React.ReactNode; label: string; value: string; muted?: boolean }[] }) {
  return (
    <ol>
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
          {i < steps.length - 1 ? (
            <span className="absolute left-[19px] top-11 h-[calc(100%-2.75rem)] w-px bg-border" />
          ) : null}
          <div
            className={cn(
              "z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card text-primary shadow-card",
              i === 0 && "border-primary bg-primary text-primary-foreground",
              step.muted && "border-dashed text-muted-foreground"
            )}
          >
            {step.icon}
          </div>
          <div className="min-w-0 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              {step.label}
            </p>
            <p className={cn("break-words text-sm font-semibold", step.muted && "text-muted-foreground")}>
              {step.value}
            </p>
          </div>
        </li>
      ))}
    </ol>
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
        icon={<Droplets className="h-5 w-5 text-primary" />}
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

function formatHourTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function extractStartTime(range: string): string | null {
  if (range.startsWith("No") || range.startsWith("Wait") || range.startsWith("Not")) return null;
  return range.split(" - ")[0];
}

function findHourIndex(hours: HourlyWeather[], timeStr: string | null): number | null {
  if (!timeStr) return null;
  for (let i = 0; i < hours.length; i++) {
    if (formatHourTime(new Date(hours[i].time)) === timeStr) return i;
  }
  return null;
}

function TimelineScreen({ decision, weather }: { decision: HayDecision; weather: WeatherSummary }) {
  const isBaleage = decision.harvestMethod === "baleage";
  const hours = weather.hourly.filter((hour) => new Date(hour.time) >= new Date()).slice(0, 168);

  const markerIndices = useMemo(
    () => ({
      cut: findHourIndex(hours, decision.timeline.cut),
      ted: !isBaleage ? findHourIndex(hours, extractStartTime(decision.tedding.window)) : null,
      rake: findHourIndex(hours, decision.timeline.rake),
      bale: findHourIndex(hours, decision.timeline.bale),
      wrap: isBaleage ? findHourIndex(hours, decision.timeline.wrap ?? null) : null
    }),
    [hours, decision, isBaleage]
  );

  const dayGroups = useMemo(() => {
    const groups: { date: Date; label: string; span: number }[] = [];
    let currentDate: string | null = null;
    hours.forEach((h) => {
      const d = new Date(h.time);
      const dateKey = d.toDateString();
      if (dateKey !== currentDate) {
        currentDate = dateKey;
        groups.push({
          date: d,
          label: new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(d),
          span: 0
        });
      }
      groups[groups.length - 1].span++;
    });
    return groups;
  }, [hours]);

  const markerTimes = isBaleage
    ? [
        { label: "CUT", time: decision.timeline.cut, className: "bg-primary text-primary-foreground" },
        { label: "RAKE", time: decision.timeline.rake, className: "bg-amber-200 text-amber-900" },
        { label: "BALE", time: decision.timeline.bale, className: "bg-secondary text-secondary-foreground" },
        { label: "WRAP", time: decision.timeline.wrap || "N/A", className: "border border-dashed border-secondary bg-background text-secondary-foreground" }
      ]
    : [
        { label: "CUT", time: decision.timeline.cut, className: "bg-primary text-primary-foreground" },
        ...(decision.tedding.recommended
          ? [{ label: "TED", time: decision.tedding.window, className: "border border-dashed border-primary bg-background text-primary" }]
          : []),
        { label: "RAKE", time: decision.timeline.rake, className: "bg-amber-200 text-amber-900" },
        { label: "BALE", time: decision.timeline.bale, className: "bg-secondary text-secondary-foreground" }
      ];

  const legend = [
    { icon: <Sun className="h-3 w-3" />, label: "Drying", className: "bg-amber-100 text-amber-800" },
    { icon: <CloudRain className="h-3 w-3" />, label: "Rain", className: "bg-sky-100 text-sky-800" },
    { icon: <Cloud className="h-3 w-3" />, label: "Day", className: "bg-stone-100 text-stone-600" },
    { icon: <Moon className="h-3 w-3" />, label: "Night", className: "bg-slate-200 text-slate-600" }
  ];

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sunrise className="h-4 w-4" />
            </div>
            7-Day Forecast
          </CardTitle>
          <div className="flex flex-wrap justify-end gap-1.5">
            {legend.map((item) => (
              <span key={item.label} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", item.className)}>
                {item.icon} {item.label}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="timeline-scroll overflow-x-auto pb-1">
              <div className="min-w-[1120px]">
                <div className="mb-1.5 flex gap-0.5">
                  {dayGroups.map((group) => (
                    <div
                      key={group.date.toDateString()}
                      className="shrink-0 text-center text-xs"
                      style={{ width: group.span * 40 + (group.span - 1) * 2 }}
                    >
                      <div className="font-bold tracking-tight">{group.label.split(",")[0]}</div>
                      <div className="text-muted-foreground">{group.label.split(",")[1]?.trim()}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-0.5">
                  {hours.map((hour, i) => {
                    const isRain = hour.precipitationProbability >= 35 || hour.precipitationAmount > 0.01;
                    const isDrying = hour.dryingHour;
                    const hourNum = new Date(hour.time).getHours();
                    return (
                      <div
                        key={hour.time}
                        className={cn(
                          "relative flex h-32 w-10 shrink-0 flex-col justify-end rounded-lg border p-1 text-[10px]",
                          isRain
                            ? "border-sky-300 bg-gradient-to-b from-sky-100 to-sky-200"
                            : isDrying
                              ? "border-amber-300 bg-gradient-to-b from-amber-50 to-amber-100"
                              : hourNum >= 7 && hourNum <= 19
                                ? "border-stone-200 bg-gradient-to-b from-stone-50 to-stone-100"
                                : "border-slate-300 bg-gradient-to-b from-slate-50 to-slate-200"
                        )}
                        title={`${hour.temperature}°F, ${hour.windSpeed} mph wind, ${hour.relativeHumidity}% RH`}
                      >
                        <div className="mb-auto text-center text-muted-foreground">
                          {hourNum === 0 ? "12a" : hourNum < 12 ? `${hourNum}a` : hourNum === 12 ? "12p" : `${hourNum - 12}p`}
                        </div>
                        <div
                          className="mx-auto w-1.5 rounded-full bg-primary/60"
                          style={{ height: `${Math.max(8, hour.windSpeed * 3)}px` }}
                          title={`${hour.windSpeed} mph wind`}
                        />
                        {isRain ? (
                          <CloudRain className="mx-auto mt-1 h-3 w-3 text-sky-700" />
                        ) : isDrying ? (
                          <Sun className="mx-auto mt-1 h-3 w-3 text-amber-700" />
                        ) : hourNum >= 7 && hourNum <= 19 ? (
                          <Cloud className="mx-auto mt-1 h-3 w-3 text-stone-400" />
                        ) : (
                          <Moon className="mx-auto mt-1 h-3 w-3 text-slate-500" />
                        )}
                        {markerIndices.cut === i && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-1.5 text-[8px] font-bold text-primary-foreground shadow-sm">
                            CUT
                          </div>
                        )}
                        {!isBaleage && markerIndices.ted === i && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-dashed border-primary bg-background px-1.5 text-[8px] font-bold text-primary">
                            TED
                          </div>
                        )}
                        {markerIndices.rake === i && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-amber-200 px-1.5 text-[8px] font-bold text-amber-900">
                            RAKE
                          </div>
                        )}
                        {markerIndices.bale === i && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-secondary px-1.5 text-[8px] font-bold text-secondary-foreground">
                            BALE
                          </div>
                        )}
                        {isBaleage && markerIndices.wrap === i && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-dashed border-secondary bg-background px-1.5 text-[8px] font-bold text-secondary-foreground">
                            WRAP
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background via-background/80 to-transparent" />
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] font-medium text-muted-foreground">
            scroll <ChevronRight className="h-3 w-3" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {markerTimes.map((marker) => (
              <span key={marker.label} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold shadow-sm", marker.className)}>
                {marker.label}: <span className="font-semibold">{marker.time}</span>
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
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shield className="h-4 w-4" />
              </div>
              Baleage Wrap Requirement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-lg font-bold tracking-tight">Bales must be wrapped within 6 hours of baling.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The system checks for rain during the wrap window. If rain is forecast within 6 hours after baling, the window is rejected to protect feed quality. Tedding is not used with baleage since the wilting period is much shorter.
            </p>
            {decision.timeline.wrap ? (
              <p className="inline-flex items-center gap-2 rounded-xl border border-secondary/50 bg-secondary/15 px-3 py-2 text-sm font-bold text-secondary-foreground">
                <Timer className="h-4 w-4" /> Wrap window: {decision.timeline.wrap}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Shovel className="h-4 w-4" />
              </div>
              Tedding &amp; Raking
            </CardTitle>
            {!decision.tedding.recommended && decision.tedding.benefitHours > 0 ? (
              <span className="ml-1 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                Saves ~{decision.tedding.benefitHours}h
              </span>
            ) : !decision.tedding.recommended ? (
              <span className="ml-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Not Recommended
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xl font-bold leading-snug tracking-tight">{decision.tedding.message}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Tedding is never required. It is a time-saving option when weather windows are tight, but it causes leaf loss and crop damage, so skip it when conditions allow. Raking is always required to form windrows before baling.
            </p>
          </CardContent>
        </Card>
      )}
      {isBaleage ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <CalendarDays className="h-4 w-4" />
              </div>
              Baleage Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActionStepper
              steps={[
                { icon: <Scissors className="h-4 w-4" />, label: "Cut", value: decision.timeline.cut },
                { icon: <Wind className="h-4 w-4" />, label: "Rake", value: decision.timeline.rake },
                { icon: <Waves className="h-4 w-4" />, label: "Bale", value: decision.timeline.bale },
                { icon: <Shield className="h-4 w-4" />, label: "Wrap", value: decision.timeline.wrap || "Wrap immediately" }
              ]}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Timer className="h-4 w-4" />
              </div>
              Expected Benefit
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ActionRow icon={<Clock className="h-4 w-4" />} label="Tedding window" value={decision.tedding.window} />
            <ActionRow icon={<Timer className="h-4 w-4" />} label="Saved time" value={`~${decision.tedding.benefitHours} hours`} />
            <ActionRow icon={<Wind className="h-4 w-4" />} label="Rake" value={decision.timeline.rake} />
            <ActionRow icon={<Waves className="h-4 w-4" />} label="With tedding" value={decision.comparison.withTedding.baleTime === decision.comparison.withoutTedding.baleTime ? "No change" : decision.comparison.withTedding.baleTime} />
            <ActionRow icon={<CloudRain className="h-4 w-4" />} label="Without" value={decision.comparison.withoutTedding.baleTime} muted />
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function DebugScreen({ decision }: { decision: HayDecision }) {
  const trace = decision.debug;
  if (!trace) return <Card><CardContent className="p-4 text-muted-foreground">No debug data available.</CardContent></Card>;

  return (
    <section className="space-y-4">
      <Card className="border-dashed border-amber-500/40 bg-amber-50/50">
        <CardContent className="flex items-center gap-3 p-4">
          <Wheat className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm font-semibold text-amber-900">
            Debug mode — visible to all users until this goes live.
          </p>
        </CardContent>
      </Card>

      <Section title="Final Decision">
        <KV label="Recommendation" value={trace.final.recommendation} />
        <KV label="Base score" value={String(trace.final.baseScore)} />
        <KV label="Final score" value={String(trace.final.finalScore)} />
        <KV label="Has current window" value={String(trace.final.hasCurrentWindow)} />
        <KV label="Status rule" value={trace.final.statusRule} />
      </Section>

      <Section title="Base Score Calculation">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <KV label="Sun hours" value={trace.baseScore.sunHours.toFixed(1)} />
          <KV label="Drying hours" value={String(trace.baseScore.dryingHours)} />
          <KV label="Avg wind" value={`${trace.baseScore.averageWind.toFixed(1)} mph`} />
          <KV label="Avg humidity" value={`${trace.baseScore.averageHumidity.toFixed(0)}%`} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KV label="Rain penalty" value={`-${trace.baseScore.rainPenalty.toFixed(2)}`} />
          <KV label="Residual penalty" value={`-${trace.baseScore.residualPenalty.toFixed(2)}`} />
          <KV label="Dew penalty" value={`-${trace.baseScore.dewPenalty.toFixed(2)}`} />
          <KV label="Wind bonus" value={`+${trace.baseScore.windBonus.toFixed(1)}`} />
          <KV label="Drying potential" value={trace.baseScore.dryingPotential.toFixed(1)} />
          <KV label="Raw score" value={String(trace.baseScore.score)} />
        </div>
        <p className="mt-2 break-all rounded-lg bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
          {trace.baseScore.rawFormula}
        </p>
      </Section>

      <Section title="Recent Conditions">
        <KV label="Precip last 24h" value={`${trace.recent.precipitationLast24h} in`} />
        <KV label="Last rain" value={trace.recent.lastRainAt ?? "None"} />
        <KV label="Hours since rain" value={trace.recent.hoursSinceLastRain !== null ? `${trace.recent.hoursSinceLastRain}h` : "N/A"} />
      </Section>

      <Section title="Drying Hours Estimate">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KV label="Method" value={trace.dryingEstimate.harvestMethod} />
          <KV label="Density" value={trace.dryingEstimate.density} />
          <KV label="Conditioning" value={`${trace.dryingEstimate.conditioning} (${trace.dryingEstimate.conditioningFactor})`} />
          <KV label="Base" value={String(trace.dryingEstimate.base)} />
          <KV label="Sun adj" value={`${trace.dryingEstimate.sunAdjustment > 0 ? "+" : ""}${trace.dryingEstimate.sunAdjustment}`} />
          <KV label="Wind adj" value={`${trace.dryingEstimate.windAdjustment > 0 ? "+" : ""}${trace.dryingEstimate.windAdjustment}`} />
          <KV label="Humidity adj" value={`${trace.dryingEstimate.humidityAdjustment > 0 ? "+" : ""}${trace.dryingEstimate.humidityAdjustment}`} />
          <KV label="Residual adj" value={`+${trace.dryingEstimate.residualAdjustment}`} />
          <KV label="Dew adj" value={`+${trace.dryingEstimate.dewAdjustment}`} />
          <KV label="Result" value={`${trace.dryingEstimate.result}h`} highlight />
        </div>
      </Section>

      <Section title="Current Window Evaluation">
        <div className="grid grid-cols-2 gap-2">
          <KV label="Window start" value={new Date(trace.currentWindow.start).toLocaleString()} />
          <KV label="Window end" value={new Date(trace.currentWindow.end).toLocaleString()} />
          <KV label="Passed" value={trace.currentWindow.passed ? "\u2713 Yes" : "\u2717 No"} highlight={trace.currentWindow.passed} />
          {!trace.currentWindow.passed && trace.currentWindow.failReason ? (
            <div className="col-span-2 rounded-lg bg-destructive/10 p-2">
              <KV label="Fail reason" value={trace.currentWindow.failReason} />
            </div>
          ) : null}
        </div>
        {trace.currentWindow.checks.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Gate checks</p>
            <div className="grid gap-1">
              {trace.currentWindow.checks.map((check) => (
                <div key={check.label} className={cn("flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm font-mono", check.passed ? "bg-primary/5" : "bg-destructive/5")}>
                  <span className={cn("font-semibold", check.passed ? "text-primary" : "text-destructive")}>
                    {check.passed ? "\u2713" : "\u2717"} {check.label}
                  </span>
                  <span className="text-muted-foreground">{check.value} <span className="text-xs">({check.threshold})</span></span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {trace.currentWindow.scoreComponents && trace.currentWindow.windowScore !== null ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Window score: {trace.currentWindow.windowScore}
            </p>
            <div className="grid gap-1">
              {trace.currentWindow.scoreComponents.map((comp) => (
                <div key={comp.label} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 font-mono text-sm">
                  <span className="font-semibold">{comp.label}</span>
                  <span className="text-muted-foreground">{comp.value >= 0 ? "+" : ""}{comp.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title="Best Window Search">
        <div className="grid grid-cols-2 gap-2">
          <KV label="Candidates checked" value={String(trace.bestWindow.candidatesChecked)} />
          <KV label="Passed" value={String(trace.bestWindow.passedCandidates)} />
          <KV label="Best found" value={trace.bestWindow.exists ? "Yes" : "No"} highlight={trace.bestWindow.exists} />
          {trace.bestWindow.exists ? (
            <>
              <KV label="Best start" value={trace.bestWindow.start ? new Date(trace.bestWindow.start).toLocaleString() : ""} />
              <KV label="Confidence" value={trace.bestWindow.confidence} />
            </>
          ) : null}
        </div>
        {trace.bestWindow.candidates.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Candidate details ({trace.bestWindow.candidates.length})
            </summary>
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
              <table className="w-full font-mono text-xs">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="p-2 text-left">Start</th>
                    <th className="p-2 text-right">Score</th>
                    <th className="p-2 text-center">Pass</th>
                    <th className="p-2 text-left">Fail reason</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.bestWindow.candidates.map((c, i) => (
                    <tr key={i} className={cn("border-t", c.passed ? "bg-primary/5" : "")}>
                      <td className="p-2">{new Date(c.start).toLocaleString()}</td>
                      <td className="p-2 text-right font-bold">{c.score}</td>
                      <td className="p-2 text-center">{c.passed ? "\u2713" : "\u2717"}</td>
                      <td className="max-w-[200px] truncate p-2 text-muted-foreground">{c.failReason ?? "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </Section>

      <Section title="Raw Forecast (first 72h)">
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Hourly data ({trace.forecastHours.length} hours)
          </summary>
          <div className="mt-2 max-h-80 overflow-auto rounded-lg border">
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="p-2 text-left">Time</th>
                  <th className="p-2 text-right">Temp</th>
                  <th className="p-2 text-right">RH%</th>
                  <th className="p-2 text-right">Wind</th>
                  <th className="p-2 text-right">Precip</th>
                  <th className="p-2 text-right">Sun</th>
                  <th className="p-2 text-center">Dry</th>
                  <th className="p-2 text-center">Dew</th>
                </tr>
              </thead>
              <tbody>
                {trace.forecastHours.map((h, i) => {
                  const d = new Date(h.time);
                  return (
                    <tr key={i} className="border-t">
                      <td className="p-2 whitespace-nowrap">{d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="p-2 text-right">{h.temperature.toFixed(0)}\u00b0</td>
                      <td className="p-2 text-right">{h.relativeHumidity}</td>
                      <td className="p-2 text-right">{h.windSpeed}</td>
                      <td className="p-2 text-right">{h.precipitationAmount > 0 ? h.precipitationAmount.toFixed(2) : "\u2014"}</td>
                      <td className="p-2 text-right">{h.sunFactor.toFixed(2)}</td>
                      <td className="p-2 text-center">{h.dryingHour ? "\u2600" : "\u2014"}</td>
                      <td className="p-2 text-center">{h.dewRisk ? "\ud83c\udf19" : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Section>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function KV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 font-mono text-sm", highlight === true && "bg-primary/5")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", highlight === true && "text-primary")}>{value}</span>
    </div>
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);

  useEffect(() => setDraft(field), [field]);

  const updateAndSave = (next: FieldSettings) => {
    setDraft(next);
    onSave(next);
    setSavedRecently(true);
    setTimeout(() => setSavedRecently(false), 2000);
  };

  const hasLocation = Number.isFinite(draft.latitude) && Number.isFinite(draft.longitude);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings className="h-4 w-4" />
            </div>
            Field Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Label text="Field name">
            <Input placeholder="e.g. North 40" value={draft.name} onChange={(event) => updateAndSave({ ...draft, name: event.target.value })} />
          </Label>

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Field Location</p>
                <p className="text-xs text-muted-foreground">
                  {hasLocation ? "Using current location" : "No location set"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowLocationModal(true)}>
                Change
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Crop type">
              <p className="text-xs text-muted-foreground mb-1.5">Affects drying rate and timing</p>
              <Select value={draft.cropType} onChange={(event) => updateAndSave({ ...draft, cropType: event.target.value as FieldSettings["cropType"] })}>
                <option value="alfalfa">Alfalfa</option>
                <option value="grass">Grass</option>
                <option value="mixed">Mixed</option>
              </Select>
            </Label>
            <Label text="Harvest method">
              <Select value={draft.harvestMethod} onChange={(event) => updateAndSave({ ...draft, harvestMethod: event.target.value as FieldSettings["harvestMethod"] })}>
                <option value="dry_hay">Dry hay</option>
                <option value="baleage">Baleage (wrapped)</option>
              </Select>
            </Label>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-90")} />
            Refine drying assumptions
          </button>

          {showAdvanced ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Label text="Swath density">
                <p className="text-xs text-muted-foreground mb-1.5">Thicker swaths dry slower</p>
                <Select value={draft.swathDensity} onChange={(event) => updateAndSave({ ...draft, swathDensity: event.target.value as FieldSettings["swathDensity"] })}>
                  <option value="light">Light</option>
                  <option value="medium">Medium</option>
                  <option value="heavy">Heavy</option>
                </Select>
              </Label>
              <Label text="Conditioning">
                <p className="text-xs text-muted-foreground mb-1.5">Impacts how quickly hay dries</p>
                <Select value={draft.conditioning} onChange={(event) => updateAndSave({ ...draft, conditioning: event.target.value as FieldSettings["conditioning"] })}>
                  <option value="none">None</option>
                  <option value="roller">Roller</option>
                  <option value="impeller">Impeller</option>
                </Select>
              </Label>
              <Label text="Last cut timing">
                <Select value={draft.lastCutTiming} onChange={(event) => updateAndSave({ ...draft, lastCutTiming: event.target.value as FieldSettings["lastCutTiming"] })}>
                  <option value="recent">Less than 20 days ago</option>
                  <option value="20-25">20-25 days ago</option>
                  <option value="25-30">25-30 days ago</option>
                  <option value="30+">30+ days ago</option>
                  <option value="unknown">Not sure</option>
                </Select>
              </Label>
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {savedRecently ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-primary">Saved</span>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {showLocationModal ? (
        <LocationModal
          field={draft}
          onSelect={(lat, lng) => {
            updateAndSave({ ...draft, latitude: lat, longitude: lng });
            setShowLocationModal(false);
          }}
          onLocate={() => {
            setShowLocationModal(false);
            onLocate();
          }}
          onClose={() => setShowLocationModal(false)}
        />
      ) : null}
    </>
  );
}

function LocationModal({
  field,
  onSelect,
  onLocate,
  onClose
}: {
  field: FieldSettings;
  onSelect: (lat: number, lng: number) => void;
  onLocate: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"menu" | "map">("menu");

  const MapPicker = useMemo(
    () =>
      dynamic(() => import("@/components/MapPicker"), {
        ssr: false,
        loading: () => (
          <div className="flex h-[280px] items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-sm text-muted-foreground">
            Loading map…
          </div>
        ),
      }),
    []
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-lift sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "menu" ? (
          <>
            <p className="text-lg font-bold">Set field location</p>
            <p className="mt-1 text-sm text-muted-foreground">Choose how to set your field coordinates.</p>

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={onLocate}
                className="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Compass className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">Use current location</p>
                  <p className="text-xs text-muted-foreground">Detect via GPS on your device</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setView("map")}
                className="flex items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MapPinned className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold">Drop a pin on map</p>
                  <p className="text-xs text-muted-foreground">Tap the map to set your field location</p>
                </div>
              </button>
            </div>

            <div className="mt-5 flex justify-end">
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold">Drop a pin</p>
                <p className="text-sm text-muted-foreground">Tap anywhere on the map to mark your field.</p>
              </div>
              <button
                type="button"
                onClick={() => setView("menu")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              <MapPicker
                initialLat={field.latitude}
                initialLng={field.longitude}
                onConfirm={(lat, lng) => {
                  onSelect(lat, lng);
                }}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setView("menu")}>Back</Button>
            </div>
          </>
        )}
      </div>
    </div>
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
    <div className={cn("flex items-center gap-3 rounded-xl border p-3", muted && "border-dashed bg-muted/45")}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function CompareTile({ label, bale, value2, extra }: { label: string; bale: string; value2?: string; extra?: string }) {
  return (
    <div className="rounded-xl border bg-muted/25 p-3.5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-bold">{bale}</p>
      {value2 ? <p className="text-xs text-muted-foreground">{value2}</p> : null}
      {extra ? <p className="text-xs text-muted-foreground">{extra}</p> : null}
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
        <div className="mt-4 grid gap-1.5">
          {stats.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-bold">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProFeature({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/40 bg-card/60 p-3.5">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary/60" />
      <div>
        <p className="text-sm font-bold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ShareButton({ label, score }: { label: string; score: number }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const text = `Hay Day says: ${label} (Score: ${score}/100) — Check your field at`;
    const url = "https://hayday.homesteadcommerce.com";

    if (navigator.share) {
      try {
        await navigator.share({ title: "Hay Day", text, url });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white/70 transition-colors hover:bg-white/25 hover:text-white"
      title="Share this result"
    >
      {copied ? <CheckCircle2 className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
    </button>
  );
}
