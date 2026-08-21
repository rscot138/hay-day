import Link from "next/link";
import Image from "next/image";
import { CloudRain, Sprout, Wheat, Wind, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/hero-bg.jpg"
          alt=""
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-white shadow-card backdrop-blur-sm">
          <Sprout className="h-8 w-8" />
        </div>

        <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
          Know if today is a{" "}
          <span className="text-secondary">Hay Day</span>.
        </h1>

        <p className="mt-5 max-w-xl text-lg text-white/70">
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

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/60">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-secondary" /> Free — no account needed
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-secondary" /> Live forecast data
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-secondary" /> Your exact field location
          </span>
        </div>
      </div>

      <footer className="absolute bottom-0 w-full border-t border-white/10 py-4 text-center text-xs font-medium text-white/50">
        Powered by{" "}
        <a href="https://www.homesteadcommerce.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white transition-colors">
          Homestead Commerce
        </a>
      </footer>
    </main>
  );
}

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/10 p-5 text-left shadow-card backdrop-blur-sm">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white">
        {icon}
      </div>
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-white/70">{description}</p>
    </div>
  );
}
