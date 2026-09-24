-- Alert subscriptions table for Hay Days email notifications
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  crop_type TEXT NOT NULL DEFAULT 'mixed',
  mode TEXT NOT NULL DEFAULT 'dry_hay' CHECK (mode IN ('dry_hay', 'baleage')),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_notified_at TIMESTAMPTZ
);

-- Index for the alert job to find subscriptions that need checking
CREATE INDEX IF NOT EXISTS idx_alert_subscriptions_last_notified
  ON alert_subscriptions (last_notified_at);

-- Unique constraint to prevent duplicate subscriptions per email+location
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_subscriptions_email_location
  ON alert_subscriptions (email, latitude, longitude);
