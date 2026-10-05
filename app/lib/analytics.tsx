"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "phc_m3MenoHRnUa2f6H9YnPYC8KqfzPCgfdB4QvDKM82tXqR";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://t.haydays.app";

let initialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!POSTHOG_KEY || initialized) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: "2026-05-30",
      capture_pageview: false,
      capture_pageleave: false,
      persistence: "localStorage"
    });
    initialized = true;
  }, []);

  useEffect(() => {
    if (!POSTHOG_KEY || !initialized) return;
    posthog.capture("$pageview");
  }, [pathname]);

  return <>{children}</>;
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!POSTHOG_KEY || !initialized) return;
  posthog.capture(event, properties);
}