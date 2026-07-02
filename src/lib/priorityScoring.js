// ─────────────────────────────────────────────────────────
// HYBRID SENTIMENT-AWARE PRIORITY SCORING ALGORITHM
// Pure JavaScript — runs entirely on the frontend
// Deterministic, rule-based NLP — no ML models involved.
//
// S = min( T
//         + min(H * highMult,  highCeil)
//         + min(M * medMult,   medCeil)
//         - lowPenalty * 1[low matches > 0]
//         + photoBonus * 1[has_photo]
//       , scoreCap )
//
// All numeric weights (highMult, highCeil, medMult, medCeil,
// lowPenalty, photoBonus, scoreCap) are externalized to
// src/config/scoringConfig.json — nothing here is a hardcoded
// "magic number".
//
// Pipeline:
//   1. normalizeText()               (textPreprocessor.js)
//   2. extractPhraseMatches()        multi-word phrases matched
//      FIRST and masked out of the text as single combined tokens
//   3. tokenize() the remaining text, stem() each token, and match
//      against single-word keyword roots with a negation-aware
//      sliding window (skips "no flooding", "not urgent", etc.)
//   4. removeStopwords() before matching the low-urgency word list
// ─────────────────────────────────────────────────────────

import scoringConfig from '../config/scoringConfig.json'
import {
  HIGH_PHRASES, HIGH_WORDS,
  MEDIUM_PHRASES, MEDIUM_WORDS,
  LOW_WORDS, NEGATION_WORDS,
} from './keywordDictionary'
import { normalizeText, tokenize, stem, removeStopwords } from './textPreprocessor'

const NEGATION_WINDOW = 3 // words to look back for a negation trigger

// Combine phrase lists once, longest-phrase-first, so that e.g.
// "no supply for hours" (4 words) is matched and masked before the
// shorter "no supply" (2 words) can steal part of it. This is what
// "prioritize multi-word exact phrases... before evaluating
// individual words" means in practice: longer, more specific phrases
// win first.
const ALL_PHRASES = [
  ...HIGH_PHRASES.map(phrase => ({ phrase, category: 'high' })),
  ...MEDIUM_PHRASES.map(phrase => ({ phrase, category: 'medium' })),
].sort((a, b) => b.phrase.split(' ').length - a.phrase.split(' ').length)

/**
 * Scans normalizedText for every known phrase (longest first) and
 * masks each match out of the text once found, so downstream
 * word-level matching never re-evaluates words that were already
 * consumed by a phrase match.
 */
function extractPhraseMatches(normalizedText) {
  let workingText = ` ${normalizedText} `
  const matches = { high: [], medium: [] }

  for (const { phrase, category } of ALL_PHRASES) {
    const needle = ` ${phrase} `
    if (workingText.includes(needle)) {
      matches[category].push(phrase)
      workingText = workingText.split(needle).join(' ')
    }
  }

  return { matches, remainingText: workingText.trim().replace(/\s+/g, ' ') }
}

/**
 * Matches stemmed single-word tokens against a root-keyword list.
 * If negationEnabled, a match is discarded when a negation word
 * ("no", "not", "never", "none") appears anywhere in the preceding
 * NEGATION_WINDOW tokens — e.g. "no flooding" does not score
 * "flooding" as an urgent keyword.
 */
function extractWordMatches(tokens, rootKeywords, negationEnabled) {
  const rootSet = new Set(rootKeywords)
  const seen = new Set()
  const matches = []
  const negated = []

  tokens.forEach((token, i) => {
    const root = stem(token)
    if (!rootSet.has(root) || seen.has(root)) return

    if (negationEnabled) {
      const windowStart = Math.max(0, i - NEGATION_WINDOW)
      const precedingWindow = tokens.slice(windowStart, i)
      if (precedingWindow.some(w => NEGATION_WORDS.has(w))) {
        negated.push(root)
        return
      }
    }

    seen.add(root)
    matches.push(root)
  })

  return { matches, negated }
}

/**
 * Scores a complaint and returns priority level + numeric score
 * @param {{ complaint_type: string, description: string, has_photo: boolean }} input
 * @returns {{ score: number, priority: 'low' | 'medium' | 'high', reasons: string[] }}
 */
export function scorePriority({ complaint_type, description, has_photo }) {
  const cfg = scoringConfig
  let score = 0
  const reasons = []

  // 1. Type-based score (externalized lookup table)
  const typeScore = cfg.typeScores[complaint_type] ?? cfg.defaultTypeScore
  score += typeScore
  reasons.push(`Type "${complaint_type}" (+${typeScore})`)

  // 2. Text pre-processing: lowercase + strip punctuation
  const normalized = normalizeText(description)

  // 3. Compound phrase matching FIRST (as single combined tokens)
  const { matches: phraseMatches, remainingText } = extractPhraseMatches(normalized)

  // 4. Word-level matching on what's left, with stemming + negation window
  const remainingTokens = tokenize(remainingText)
  const highWordResult = extractWordMatches(remainingTokens, HIGH_WORDS, true)
  const medWordResult  = extractWordMatches(remainingTokens, MEDIUM_WORDS, true)

  // 5. Low-urgency keywords: stop-words filtered out first, no negation logic needed
  const filteredTokens = removeStopwords(remainingTokens)
  const lowWordResult = extractWordMatches(filteredTokens, LOW_WORDS, false)

  const highMatches = [...phraseMatches.high, ...highWordResult.matches]
  const medMatches  = [...phraseMatches.medium, ...medWordResult.matches]
  const lowMatches  = lowWordResult.matches
  const negatedMatches = [...highWordResult.negated, ...medWordResult.negated]

  const { keywordWeights } = cfg

  if (highMatches.length > 0) {
    const add = Math.min(highMatches.length * keywordWeights.highKeywordMultiplier, keywordWeights.highKeywordCeiling)
    score += add
    reasons.push(`Urgent keywords: "${highMatches.slice(0, 3).join(', ')}" (+${add})`)
  }
  if (medMatches.length > 0) {
    const add = Math.min(medMatches.length * keywordWeights.mediumKeywordMultiplier, keywordWeights.mediumKeywordCeiling)
    score += add
    reasons.push(`Concern keywords: "${medMatches.slice(0, 3).join(', ')}" (+${add})`)
  }
  if (lowMatches.length > 0) {
    score -= keywordWeights.lowKeywordPenalty
    reasons.push(`Low-urgency keywords detected (-${keywordWeights.lowKeywordPenalty})`)
  }
  if (negatedMatches.length > 0) {
    reasons.push(`Negated keywords ignored: "${negatedMatches.slice(0, 3).join(', ')}"`)
  }

  // 6. Photo attachment bonus
  if (has_photo) {
    score += cfg.photoBonus
    reasons.push(`Photo attached (+${cfg.photoBonus})`)
  }

  // 7. Clamp score
  score = Math.max(0, Math.min(score, cfg.scoreCap))

  // 8. Classify
  let priority
  if (score >= cfg.priorityThresholds.high) priority = 'high'
  else if (score >= cfg.priorityThresholds.medium) priority = 'medium'
  else priority = 'low'

  return { score, priority, reasons }
}
