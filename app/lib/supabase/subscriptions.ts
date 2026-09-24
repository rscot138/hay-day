import { getSupabase } from "./client";
import { AlertSubscription, AlertSubscriptionInsert } from "./types";

export async function createSubscription(
  sub: AlertSubscriptionInsert
): Promise<AlertSubscription> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("alert_subscriptions")
    .upsert(
      {
        email: sub.email,
        latitude: sub.latitude,
        longitude: sub.longitude,
        crop_type: sub.crop_type,
        mode: sub.mode,
      },
      { onConflict: "email,latitude,longitude" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAllSubscriptions(): Promise<AlertSubscription[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("alert_subscriptions")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function markNotified(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("alert_subscriptions")
    .update({ last_notified_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
