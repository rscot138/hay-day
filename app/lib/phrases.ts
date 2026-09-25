export const HIGH_SCORE_PHRASES = [
  "Should dry down clean",
  "This one should cure out right",
  "Low humidity and heat should carry this through",
  "Conditions are working with you today",
  "This one's about as good as it gets"
];

export const GOOD_SCORE_PHRASES = [
  "This one should dry, but keep an eye on it",
  "You've got a shot here — just watch the humidity",
  "Worth getting after it if you stay on top of it",
  "Should work, but don't cut corners on timing",
  "Weather's on your side (mostly)"
];

export const MID_SCORE_PHRASES = [
  "Might dry — but you'll be watching it",
  "You'll need sun and some luck to finish it off",
  "Borderline… could go either way",
  "Not perfect, but workable if conditions hold",
  "You'll want to stay flexible on this one"
];

export const LOW_SCORE_PHRASES = [
  "Gonna be tough to get this to dry",
  "You'll be fighting moisture on this one",
  "Humidity's gonna hang around — tough to finish drying",
  "This one's a gamble in these conditions",
  "Risk is stacking up here"
];

export const BAD_SCORE_PHRASES = [
  "Nothing to gain right now",
  "You'd be fighting the weather all the way",
  "Fields need time, so sit tight",
  "This one's not ready yet — let it dry out",
  "Let this pass"
];

const LAST_PHRASE_KEY = "lastPhrase";

function getPool(score: number): string[] {
  if (score >= 80) return HIGH_SCORE_PHRASES;
  if (score >= 70) return GOOD_SCORE_PHRASES;
  if (score >= 50) return MID_SCORE_PHRASES;
  if (score >= 30) return LOW_SCORE_PHRASES;
  return BAD_SCORE_PHRASES;
}

export function getScorePhrase(score: number): string {
  const pool = getPool(score);
  if (pool.length === 0) return "";

  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_PHRASE_KEY);
  } catch {
    last = null;
  }

  let phrase = pool[Math.floor(Math.random() * pool.length)];
  let attempts = 0;
  while (phrase === last && attempts < pool.length) {
    phrase = pool[Math.floor(Math.random() * pool.length)];
    attempts += 1;
  }

  try {
    window.localStorage.setItem(LAST_PHRASE_KEY, phrase);
  } catch {
    // storage unavailable (e.g. private mode)
  }

  return phrase;
}

export type DryingConfidence = "Dries Easy" | "Watch It" | "Tough Dry";

export function getDryingConfidence(score: number): DryingConfidence {
  if (score >= 80) return "Dries Easy";
  if (score >= 65) return "Watch It";
  return "Tough Dry";
}

export type TimePressure = "short" | "moderate" | null;

export function getTimePressure(score: number, dryingHours: number): TimePressure {
  if (score < 65 && dryingHours < 48) return "short";
  if (score >= 65 && score < 80 && dryingHours < 60) return "moderate";
  return null;
}

export function getTimePressureLabel(pressure: TimePressure): string {
  switch (pressure) {
    case "short":
      return "Short window — don't wait";
    case "moderate":
      return "Narrow drying window";
    default:
      return "";
  }
}
