import { NextResponse } from "next/server";
import { fetchWeather } from "@/app/lib/weather";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { error: "Latitude and longitude are required." },
      { status: 400 }
    );
  }

  try {
    const weather = await fetchWeather(lat, lon);
    return NextResponse.json(weather, {
      headers: {
        "Cache-Control": "s-maxage=900, stale-while-revalidate=900"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Weather data is temporarily unavailable.",
        detail: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 502 }
    );
  }
}
