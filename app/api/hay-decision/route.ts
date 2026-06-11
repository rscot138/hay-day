import { NextResponse } from "next/server";
import { calculateHayDecision } from "@/app/lib/hay-decision";
import { fetchWeather } from "@/app/lib/weather";
import { FieldSettings } from "@/app/types/hay";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      latitude?: number;
      longitude?: number;
      field?: FieldSettings;
    };
    const latitude = Number(body.latitude ?? body.field?.latitude);
    const longitude = Number(body.longitude ?? body.field?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NextResponse.json(
        { error: "A field latitude and longitude are required." },
        { status: 400 }
      );
    }

    const field: FieldSettings = {
      name: body.field?.name || "Current Field",
      cropType: body.field?.cropType || "mixed",
      swathDensity: body.field?.swathDensity || "medium",
      conditioning: body.field?.conditioning || "roller",
      harvestMethod: body.field?.harvestMethod || "dry_hay",
      latitude,
      longitude
    };

    const weather = await fetchWeather(latitude, longitude);
    const decision = calculateHayDecision({ field, weather });

    return NextResponse.json(
      { weather, decision },
      {
        headers: {
          "Cache-Control": "s-maxage=900, stale-while-revalidate=900"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to calculate a hay decision right now.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
