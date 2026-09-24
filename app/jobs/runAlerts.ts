import { getAllSubscriptions, markNotified } from "@/app/lib/supabase/subscriptions";
import { evaluateForLocation } from "@/app/lib/decision/evaluateForLocation";
import { sendAlertEmail } from "@/app/lib/email";
import { FieldConfig } from "@/app/lib/decision/types";

const SCORE_THRESHOLD = 75;
const MIN_HOURS_BETWEEN_NOTIFICATIONS = 24;

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

export async function runAlerts(): Promise<{
  checked: number;
  notified: number;
  errors: number;
}> {
  const subs = await getAllSubscriptions();
  let notified = 0;
  let errors = 0;

  for (const sub of subs) {
    try {
      if (hoursSince(sub.last_notified_at) < MIN_HOURS_BETWEEN_NOTIFICATIONS) {
        continue;
      }

      const field: FieldConfig = {
        cropType: sub.crop_type as FieldConfig["cropType"],
        swathDensity: "medium",
        conditioning: "roller",
        harvestMethod: sub.mode as FieldConfig["harvestMethod"],
        latitude: sub.latitude,
        longitude: sub.longitude,
      };

      const result = await evaluateForLocation(field);

      if (result.score >= SCORE_THRESHOLD) {
        await sendAlertEmail(
          sub.email,
          result.score,
          result.recommendation,
          result.reason
        );
        await markNotified(sub.id);
        notified++;
      }
    } catch (err) {
      console.error(`Alert check failed for subscription ${sub.id}:`, err);
      errors++;
    }
  }

  return { checked: subs.length, notified, errors };
}
