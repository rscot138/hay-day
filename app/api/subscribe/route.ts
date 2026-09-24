import { NextResponse } from "next/server";
import { createSubscription } from "@/app/lib/supabase/subscriptions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      latitude?: number;
      longitude?: number;
      cropType?: string;
      mode?: string;
    };

    if (!body.email || !body.latitude || !body.longitude) {
      return NextResponse.json(
        { error: "Email, latitude, and longitude are required." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(body.latitude) ||
      !Number.isFinite(body.longitude)
    ) {
      return NextResponse.json(
        { error: "Invalid coordinates." },
        { status: 400 }
      );
    }

    const subscription = await createSubscription({
      email: body.email.toLowerCase().trim(),
      latitude: body.latitude,
      longitude: body.longitude,
      crop_type: body.cropType || "mixed",
      mode: body.mode === "baleage" ? "baleage" : "dry_hay",
    });

    return NextResponse.json({ ok: true, id: subscription.id });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to save subscription.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
