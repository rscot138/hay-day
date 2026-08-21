import Link from "next/link";
import { CloudRain, Sprout, Wheat, Wind, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
          <Sprout className="h-8 w-8" />
        </div>

        <h1 className="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl">
          Know if today is a hay day.
        </h1>

        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Field-specific hay cutting decisions in under 10 seconds.
        </p>

        <Button asChild className="mt-8 rounded-xl px-8 py-6 text-base font-bold shadow-lift">
          <Link href="/app">Check Your Field</Link>
        </Button>

        <div className="mt-20 grid w-full max-w-3xl gap-4 sm:grid-cols-3">
          <Feature
            icon={<Wheat className="h-5 w-5" />}
            title="Dry hay + baleage"
            description="Supports both harvest methods with tailored scoring."
          />
          <Feature
            icon={<CloudRain className="h-5 w-5" />}
            title="Weather-based scoring"
            description="Drying windows, rain risk, and humidity scored against your field."
          />
          <Feature
            icon={<Wind className="h-5 w-5" />}
            title="Built for real operations"
            description="Cut, ted, rake, and bale timelines — not just a weather app."
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Free — no account needed
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Live forecast data
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Your exact field location
          </span>
        </div>
      </div>

      <footer className="absolute bottom-0 w-full border-t border-border/50 py-4 text-center text-xs font-medium text-muted-foreground">
        Powered by{" "}
        <a href="https://www.homesteadcommerce.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
          Homestead Commerce
        </a>
      </footer>
    </main>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 text-left shadow-card">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
