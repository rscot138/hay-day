export const HIGH_SCORE_PHRASES = [
  "Mow it like you stole it",
  "This is what you wait for",
  "Windows don’t get much better than this",
  "Time to make hay",
  "Send it",
  "If you're gonna cut, this is the moment",
  "Conditions are working with you today",
  "This one’s about as good as it gets"
];

export const GOOD_SCORE_PHRASES = [
  "This is a solid window",
  "You’ve got a good shot here",
  "Conditions are lining up nicely",
  "Worth getting after it",
  "This should dry down well",
  "A good opportunity if you're ready",
  "Weather’s on your side (mostly)"
];

export const MID_SCORE_PHRASES = [
  "Tight window—plan it right",
  "It’ll work, but keep an eye on it",
  "You’re threading the needle here",
  "Could go either way",
  "Not perfect, but workable",
  "You’ll want to stay flexible",
  "Watch the forecast closely on this one"
];

export const LOW_SCORE_PHRASES = [
  "You’d be pushing it",
  "This one’s a gamble",
  "Conditions aren’t doing you favors",
  "Risk is stacking up here",
  "Probably not worth the shot",
  "You’d need some luck on your side",
  "Not a comfortable window"
];

export const BAD_SCORE_PHRASES = [
  "Nothing to gain right now",
  "You’d be fighting the weather",
  "Fields need time—sit tight",
  "This one’s not ready yet",
  "Better days are coming",
  "Let this pass",
  "Patience pays here"
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