import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address?.trim()) {
    return NextResponse.json({ error: "Address is required." }, { status: 400 });
  }

  const key = process.env.GOOGLE_GEOCODE_KEY;
  if (!key) {
    return NextResponse.json({ error: "Geocoding is not configured." }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address.trim())}&key=${key}`
    );
    if (!res.ok) throw new Error("Google Geocoding API error");
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=86400, stale-while-revalidate=86400" }
    });
  } catch {
    return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 502 });
  }
}
