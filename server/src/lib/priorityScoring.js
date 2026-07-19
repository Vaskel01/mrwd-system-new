// ─────────────────────────────────────────────────────────
// HYBRID SENTIMENT-AWARE PRIORITY SCORING ALGORITHM
// Server-side copy — this is the CANONICAL scoring authority.
// The frontend runs the same algorithm client-side only to show a
// live preview while the customer is typing; the score that is
// actually stored is always the one computed here, on submit.
//
// Kept byte-for-byte identical in logic to src/lib/priorityScoring.js
// on the frontend. If you tune the algorithm, update both copies.
// ─────────────────────────────────────────────────────────

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import {
  HIGH_PHRASES, HIGH_WORDS,
  MEDIUM_PHRASES, MEDIUM_WORDS,
  LOW_WORDS, NEGATION_WORDS,
} from './keywordDictionary.js'
import { normalizeText, tokenize, stem, removeStopwords } from './textPreprocessor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scoringConfig = JSON.parse(
  readFileSync(join(__dirname, '../config/scoringConfig.json'), 'utf-8')
)

const NEGATION_WINDOW = 3

const ALL_PHRASES = [
  ...HIGH_PHRASES.map(phrase => ({ phrase, category: 'high' })),
  ...MEDIUM_PHRASES.map(phrase => ({ phrase, category: 'medium' })),
].sort((a, b) => b.phrase.split(' ').length - a.phrase.split(' ').length)

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
 * Scores a complaint and returns the two components your database
 * stores separately, plus the combined score/label:
 *   rule_score      — the fixed severity weight of the complaint's
 *                      category (complaint_categories.base_severity_score)
 *   sentiment_score — the keyword/urgency-language adjustment computed
 *                      from the free-text description (+ a small photo
 *                      bonus), i.e. the "sentiment-aware" part of the
 *                      algorithm
 *   priority_score  — rule_score + sentiment_score, clamped to [0, cap]
 *   priority        — 'low' | 'medium' | 'high', derived from priority_score
 *
 * @param {{ description: string, has_photo: boolean, base_severity_score: number }} input
 */
export function scoreComplaint({ description, has_photo, base_severity_score }) {
  const cfg = scoringConfig
  const reasons = []

  const rule_score = Math.round(base_severity_score ?? cfg.defaultTypeScore ?? 10)
  reasons.push(`Category base severity (+${rule_score})`)

  let sentiment_score = 0

  const normalized = normalizeText(description)
  const { matches: phraseMatches, remainingText } = extractPhraseMatches(normalized)

  const remainingTokens = tokenize(remainingText)
  const highWordResult = extractWordMatches(remainingTokens, HIGH_WORDS, true)
  const medWordResult  = extractWordMatches(remainingTokens, MEDIUM_WORDS, true)

  const filteredTokens = removeStopwords(remainingTokens)
  const lowWordResult = extractWordMatches(filteredTokens, LOW_WORDS, false)

  const highMatches = [...phraseMatches.high, ...highWordResult.matches]
  const medMatches  = [...phraseMatches.medium, ...medWordResult.matches]
  const lowMatches  = lowWordResult.matches
  const negatedMatches = [...highWordResult.negated, ...medWordResult.negated]

  const { keywordWeights } = cfg

  if (highMatches.length > 0) {
    const add = Math.min(highMatches.length * keywordWeights.highKeywordMultiplier, keywordWeights.highKeywordCeiling)
    sentiment_score += add
    reasons.push(`Urgent keywords: "${highMatches.slice(0, 3).join(', ')}" (+${add})`)
  }
  if (medMatches.length > 0) {
    const add = Math.min(medMatches.length * keywordWeights.mediumKeywordMultiplier, keywordWeights.mediumKeywordCeiling)
    sentiment_score += add
    reasons.push(`Concern keywords: "${medMatches.slice(0, 3).join(', ')}" (+${add})`)
  }
  if (lowMatches.length > 0) {
    sentiment_score -= keywordWeights.lowKeywordPenalty
    reasons.push(`Low-urgency keywords detected (-${keywordWeights.lowKeywordPenalty})`)
  }
  if (negatedMatches.length > 0) {
    reasons.push(`Negated keywords ignored: "${negatedMatches.slice(0, 3).join(', ')}"`)
  }
  if (has_photo) {
    sentiment_score += cfg.photoBonus
    reasons.push(`Photo attached (+${cfg.photoBonus})`)
  }

  sentiment_score = Math.round(Math.max(0, sentiment_score))

  const priority_score = Math.max(0, Math.min(rule_score + sentiment_score, cfg.scoreCap))

  let priority
  if (priority_score >= cfg.priorityThresholds.high) priority = 'high'
  else if (priority_score >= cfg.priorityThresholds.medium) priority = 'medium'
  else priority = 'low'

  return { rule_score, sentiment_score, priority_score, priority, reasons }
}
