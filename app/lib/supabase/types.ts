export type AlertSubscription = {
  id: string;
  email: string;
  latitude: number;
  longitude: number;
  crop_type: string;
  mode: "dry_hay" | "baleage";
  created_at: string;
  last_notified_at: string | null;
};

export type AlertSubscriptionInsert = Omit<
  AlertSubscription,
  "id" | "created_at" | "last_notified_at"
>;
