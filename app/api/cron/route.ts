import { NextResponse } from "next/server";
import { runAlerts } from "@/app/jobs/runAlerts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAlerts();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Alert job failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
