// ─────────────────────────────────────────────────────────
// DETERMINISTIC TEXT PRE-PROCESSING
// Pure JavaScript, rule-based, no ML/NLP libraries.
//
// Pipeline used by priorityScoring.js:
//   raw text → normalizeText() → tokenize() → [phrase matching] →
//   stem() per token for keyword matching, removeStopwords() where
//   stop-words would otherwise pollute a match.
// ─────────────────────────────────────────────────────────

// Standard conversational stop-words. Deliberately EXCLUDES negation
// words ("no", "not", "never", "none") — those are required intact
// by the negation-window logic in priorityScoring.js and must never
// be stripped here.
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'from', 'by', 'as', 'it', 'its', 'this', 'that', 'these', 'those',
  'i', 'we', 'you', 'my', 'our', 'your', 'me', 'us', 'so', 'very',
  'just', 'also', 'there', 'here', 'have', 'has', 'had', 'will',
  'would', 'can', 'could', 'should', 'do', 'does', 'did', 'please',
  'thank', 'thanks', 'hi', 'hello', 'dear', 'sir', 'maam', 'am', 'pm',
])

/**
 * Lowercases text and strips punctuation/special characters,
 * collapsing whitespace. Leaves plain words separated by single spaces.
 */
export function normalizeText(rawText) {
  return (rawText || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation/special chars
    .replace(/\s+/g, ' ')
    .trim()
}

/** Splits normalized text into word tokens. */
export function tokenize(normalizedText) {
  return normalizedText ? normalizedText.split(' ').filter(Boolean) : []
}

/** Removes stop-words from a token array (negation words are preserved). */
export function removeStopwords(tokens) {
  return tokens.filter(t => !STOPWORDS.has(t))
}

// Irregular / domain-specific stems that the generic suffix-stripping
// rules below don't handle cleanly. Keeps infrastructure terminology
// (leak/leaks/leaking/leaked, flood/flooding, etc.) mapped to one root.
const IRREGULAR_STEMS = {
  leak: 'leak', leaks: 'leak', leaking: 'leak', leaked: 'leak',
  flood: 'flood', floods: 'flood', flooding: 'flood', flooded: 'flood',
  discolor: 'discolor', discolored: 'discolor', discoloured: 'discolor', discoloration: 'discolor',
  interrupt: 'interrupt', interrupted: 'interrupt', interruption: 'interrupt', interruptions: 'interrupt',
  concern: 'concern', concerned: 'concern', concerning: 'concern', concerns: 'concern',
  frustrate: 'frustrate', frustrated: 'frustrate', frustrating: 'frustrate', frustration: 'frustrate',
  contaminate: 'contaminate', contaminated: 'contaminate', contamination: 'contaminate',
  baby: 'baby', babies: 'baby',
  inquiry: 'inquiry', inquiries: 'inquiry',
  emergency: 'emergency', emergencies: 'emergency',
}

/**
 * Generic deterministic suffix-stripping fallback for words not covered
 * by IRREGULAR_STEMS. Intentionally simple (rule-based, not ML) — this
 * is a light Porter-style reduction, not a full stemmer.
 */
function genericStem(word) {
  if (word.length <= 3) return word
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y'
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3)
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1)
  return word
}

/**
 * Maps a single word to its normalized root form so that
 * variations ("leak", "leaks", "leaking", "leaked") collapse to one
 * canonical keyword ("leak") for matching purposes.
 */
export function stem(word) {
  if (!word) return word
  return IRREGULAR_STEMS[word] || genericStem(word)
}

/**
 * Full convenience pipeline: normalize → tokenize → stem/filter.
 * Returns multiple representations since different parts of the
 * scoring engine need different views of the same text:
 *   - tokens: raw tokens (negation words intact) for window checks
 *   - filteredTokens: stop-words removed
 *   - stemmedTokens: filteredTokens reduced to root form
 */
export function preprocess(rawText) {
  const normalized = normalizeText(rawText)
  const tokens = tokenize(normalized)
  const filteredTokens = removeStopwords(tokens)
  const stemmedTokens = filteredTokens.map(stem)
  return { normalized, tokens, filteredTokens, stemmedTokens }
}
