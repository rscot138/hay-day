import Link from "next/link";
import Image from "next/image";
import { Sprout, CheckCircle2 } from "lucide-react";
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
          Cut hay with{" "}
          <span className="text-secondary">confidence</span>.
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">
          Get a clear cut/no-cut decision, a full drying timeline, and a confidence-backed recommendation based on real weather conditions.
        </p>

        <Button asChild className="mt-8 rounded-xl px-8 py-6 text-base font-bold shadow-lift">
          <Link href="/app">Check Your Field</Link>
        </Button>

        <div className="mt-14 flex flex-col items-start gap-3 text-left text-sm text-white/80">
          <Bullet>Know if you should cut now or wait</Bullet>
          <Bullet>See your full cut, rake, and bale timeline</Bullet>
          <Bullet>Understand your weather risk before you commit</Bullet>
        </div>

        <div className="mt-16 w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-left backdrop-blur-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary">Coming soon</p>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Track your harvest and generate a shareable hay record backed by real weather data, so you can stand behind every cutting.
          </p>
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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary" />
      {children}
    </span>
  );
}
