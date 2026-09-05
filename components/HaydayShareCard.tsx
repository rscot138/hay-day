"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toBlob, toPng } from "html-to-image";
import { Check, Copy, Download, Scissors, Share2, Waves, Wheat, X } from "lucide-react";
import { cn } from "@/app/lib/utils";
import { track } from "@/app/lib/analytics";

type ShareTone = {
  gradient: string;
  text: string;
  sub: string;
  chip: string;
  ring: string;
  track: string;
};

const SHARE_TONES: Record<"good" | "caution" | "bad", ShareTone> = {
  good: {
    gradient: "bg-gradient-to-br from-[#2b6b3f] via-[#245a35] to-[#163d25]",
    text: "text-[#f6f7ee]",
    sub: "text-[#f6f7ee]/70",
    chip: "bg-white/10",
    ring: "stroke-[#f6f7ee]",
    track: "stroke-[#f6f7ee]/20"
  },
  caution: {
    gradient: "bg-gradient-to-br from-[#e2ab3f] via-[#d69c2e] to-[#b67f1e]",
    text: "text-[#3b2c07]",
    sub: "text-[#3b2c07]/70",
    chip: "bg-black/8",
    ring: "stroke-[#3b2c07]",
    track: "stroke-[#3b2c07]/20"
  },
  bad: {
    gradient: "bg-gradient-to-br from-[#d25a41] via-[#c14831] to-[#942e1c]",
    text: "text-[#fdf6f4]",
    sub: "text-[#fdf6f4]/70",
    chip: "bg-white/10",
    ring: "stroke-[#fdf6f4]",
    track: "stroke-[#fdf6f4]/20"
  }
};

function shareToneFor(verdict: string): ShareTone {
  if (verdict.includes("Caution")) return SHARE_TONES.caution;
  if (verdict.includes("Cut")) return SHARE_TONES.good;
  return SHARE_TONES.bad;
}

interface HaydayShareCardProps {
  score: number;
  verdict: string;
  phrase: string;
  cutTime: string;
  baleTime: string;
  locationName?: string;
  date: string;
  open?: boolean;
  onClose?: () => void;
}

export default function HaydayShareCard({
  score,
  verdict,
  phrase,
  cutTime,
  baleTime,
  locationName,
  date,
  open = false,
  onClose
}: HaydayShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [busy, setBusy] = useState<null | "download" | "copy" | "share">(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    const update = () => setScale(wrap.clientWidth / 1080);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [open]);

  const makePng = useCallback(async () => {
    const node = cardRef.current;
    if (!node) return null;
    return toPng(node, { pixelRatio: 2, width: 1080, height: 1080 });
  }, []);

  const makeBlob = useCallback(async () => {
    const node = cardRef.current;
    if (!node) return null;
    return toBlob(node, { pixelRatio: 2, width: 1080, height: 1080 });
  }, []);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setBusy("download");
    try {
      const dataUrl = await makePng();
      if (!dataUrl) return;
      const link = document.createElement("a");
      link.download = "hayday-decision.png";
      link.href = dataUrl;
      link.click();
      track("share_card_download", { verdict, score });
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!cardRef.current) return;
    setBusy("copy");
    try {
      const blob = await makeBlob();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track("share_card_copy", { verdict, score });
    } catch {
      // clipboard images unsupported — fall back to downloading
      await handleDownload();
    } finally {
      setBusy(null);
    }
  };

  const handleShare = async () => {
    if (!cardRef.current) return;
    setBusy("share");
    try {
      const blob = await makeBlob();
      if (!blob) return;
      const file = new File([blob], "hayday-decision.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: "Hay Day",
          text: `Hay Day says: ${verdict} (Score: ${score}/100)`,
          files: [file]
        });
        track("share_card_share", { verdict, score });
      }
    } catch {
      // user cancelled or sharing unavailable
    } finally {
      setBusy(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-4 sm:max-w-[480px]">
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-bold tracking-widest text-white/90">Hay Day — Share card</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white/80 transition-colors hover:bg-white/25 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={previewWrapRef} className="relative aspect-square w-full overflow-hidden rounded-xl shadow-lift">
          <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
            <div ref={cardRef} className="h-[1080px] w-[1080px]">
              <HaydayShareCardCanvas
                score={score}
                verdict={verdict}
                phrase={phrase}
                cutTime={cutTime}
                baleTime={baleTime}
                locationName={locationName}
                date={date}
                tone={shareToneFor(verdict)}
              />
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-foreground shadow-card transition-colors hover:bg-accent disabled:opacity-60"
          >
            {busy === "download" ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-foreground shadow-card transition-colors hover:bg-accent disabled:opacity-60"
          >
            {copied ? <Check className="h-4 w-4 text-green-700" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy image"}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={busy !== null || (typeof navigator !== "undefined" && navigator.share === undefined)}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground shadow-card transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "share" ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            Share
          </button>
        </div>
      </div>
    </div>
  );
}

function HaydayShareCardCanvas({
  score,
  verdict,
  phrase,
  cutTime,
  baleTime,
  locationName,
  date,
  tone
}: {
  score: number;
  verdict: string;
  phrase: string;
  cutTime: string;
  baleTime: string;
  locationName?: string;
  date: string;
  tone: ShareTone;
}) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const filled = circumference * (clamped / 100);

  return (
    <div
      className={cn(
        "relative flex h-[1080px] w-[1080px] flex-col items-center overflow-hidden px-[76px] py-[64px]",
        tone.gradient,
        tone.text
      )}
    >
      <Wheat
        className="pointer-events-none absolute -bottom-[140px] -right-[100px] h-[560px] w-[560px] opacity-[0.07]"
        strokeWidth={1}
      />

      <div className="relative flex w-full items-start justify-between">
        <div className="flex items-center gap-4">
          <Wheat className="h-[52px] w-[52px]" strokeWidth={2} />
          <span className="text-[56px] font-black leading-none tracking-tight">HayDay</span>
        </div>
        <span className={cn("pt-2 text-[34px] font-semibold", tone.sub)}>{date}</span>
      </div>

      {locationName ? (
        <span className={cn("relative mt-4 max-w-full truncate text-[34px] font-medium", tone.sub)}>
          {locationName}
        </span>
      ) : null}

      <div className="relative mt-auto flex flex-col items-center">
        <span className={cn("text-[30px] font-bold uppercase tracking-[0.35em]", tone.sub)}>
          Should I cut today?
        </span>
        <h2 className="mt-6 text-center text-[128px] font-black leading-none tracking-tight">{verdict}</h2>

        <svg width="220" height="220" viewBox="0 0 220 220" className="mt-10 -rotate-90">
          <circle cx="110" cy="110" r={radius} fill="none" strokeWidth="14" className={tone.track} />
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className={tone.ring}
          />
        </svg>
        <div className="-mt-[148px] flex flex-col items-center">
          <span className="text-[104px] font-black leading-none tracking-tight">{score}</span>
          <span className={cn("mt-2 text-[28px] font-bold uppercase tracking-[0.3em]", tone.sub)}>Score</span>
        </div>

        <p className={cn("mt-[56px] max-w-[840px] text-center text-[52px] font-semibold italic leading-snug", tone.sub)}>
          {phrase}
        </p>
      </div>

      <div className="relative mt-auto flex w-full items-end justify-between">
        <div className="flex items-center gap-6">
          <div className={cn("flex items-center gap-4 rounded-2xl px-7 py-4", tone.chip)}>
            <Scissors className="h-[38px] w-[38px]" strokeWidth={2.25} />
            <div>
              <span className={cn("block text-[26px] font-bold uppercase tracking-wider", tone.sub)}>Cut</span>
              <span className="block text-[44px] font-black leading-none tracking-tight">{cutTime}</span>
            </div>
          </div>
          <div className={cn("flex items-center gap-4 rounded-2xl px-7 py-4", tone.chip)}>
            <Waves className="h-[38px] w-[38px]" strokeWidth={2.25} />
            <div>
              <span className={cn("block text-[26px] font-bold uppercase tracking-wider", tone.sub)}>Bale</span>
              <span className="block text-[44px] font-black leading-none tracking-tight">{baleTime}</span>
            </div>
          </div>
        </div>
        <span className={cn("pb-1 text-[32px] font-medium", tone.sub)}>Based on real weather data</span>
      </div>
    </div>
  );
}