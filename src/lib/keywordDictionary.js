// ─────────────────────────────────────────────────────────
// KEYWORD DICTIONARY
// Deterministic, hand-curated term lists used by priorityScoring.js.
//
// Multi-word entries live in the *_PHRASES lists and are matched as
// single combined tokens BEFORE any individual-word matching happens
// (see priorityScoring.js → extractPhraseMatches). This stops phrases
// like "no water" or "low pressure" from being torn apart and
// mis-evaluated word-by-word.
//
// Single-word entries live in the *_WORDS lists and are stored in
// their ROOT (stemmed) form — e.g. "leak" covers leak/leaks/leaking/
// leaked because textPreprocessor.stem() normalizes all of those to
// "leak" before matching. See textPreprocessor.js for the stemming
// rules.
// ─────────────────────────────────────────────────────────

export const HIGH_PHRASES = [
  'no water',
  'no supply',
  'dirty water',
  'health risk',
  'days without',
]

export const HIGH_WORDS = [
  'urgent', 'emergency', 'dangerous', 'burst', 'flood', 'contaminate',
  'angry', 'furious', 'immediately', 'critical', 'sick', 'hospital',
  'baby', 'elderly',
]

export const MEDIUM_PHRASES = [
  'low pressure',
  'brown water',
  'no supply for hours',
]

export const MEDIUM_WORDS = [
  'leak', 'pressure', 'discolor', 'smell', 'odor', 'interrupt',
  'frustrate', 'concern', 'problem', 'issue',
]

export const LOW_WORDS = [
  'bill', 'meter', 'reading', 'inquiry', 'question', 'request',
  'when', 'schedule',
]

// Negation words. These must never be dropped as stop-words — the
// negation-window logic in priorityScoring.js depends on them still
// being present in the token stream.
export const NEGATION_WORDS = new Set(['no', 'not', 'never', 'none'])
