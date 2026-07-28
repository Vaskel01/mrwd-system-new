// Canonical server-side dataset-backed complaint classifier.
// The frontend only previews the result; this server copy calculates
// and stores the authoritative classification.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { normalizeText, tokenize, stem } from './textPreprocessor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scoringConfig = JSON.parse(readFileSync(join(__dirname, '../config/scoringConfig.json'), 'utf-8'))
const keywordDataset = JSON.parse(readFileSync(join(__dirname, '../data/complaintKeywordDataset.json'), 'utf-8'))

const NEGATION_WORDS = new Set(['no', 'not', 'never', 'none', 'without'])
const NEGATION_WINDOW = 3
const ACTIVE_ENTRIES = keywordDataset.entries.filter(entry => entry.active !== false)

function termsForEntry(entry) {
  return [...new Set([
    entry.term,
    ...(Array.isArray(entry.synonyms) ? entry.synonyms : []),
    ...(Array.isArray(entry.suggestive_phrases) ? entry.suggestive_phrases : []),
  ].map(normalizeText).filter(Boolean))]
}

const MATCH_CANDIDATES = ACTIVE_ENTRIES.flatMap(entry =>
  termsForEntry(entry).map(matchedTerm => {
    const tokens = tokenize(matchedTerm)
    return {
      entry,
      matchedTerm,
      tokens,
      stemmedTokens: tokens.map(stem),
    }
  })
)

const PHRASE_CANDIDATES = MATCH_CANDIDATES
  .filter(candidate => candidate.tokens.length > 1)
  .sort((a, b) => b.tokens.length - a.tokens.length)

const WORD_CANDIDATES = MATCH_CANDIDATES
  .filter(candidate => candidate.tokens.length === 1)

function isNegated(tokens, startIndex) {
  const from = Math.max(0, startIndex - NEGATION_WINDOW)
  return tokens.slice(from, startIndex).some(token => NEGATION_WORDS.has(token))
}

function sameSlice(tokens, start, phraseTokens) {
  if (start + phraseTokens.length > tokens.length) return false
  return phraseTokens.every((token, offset) => tokens[start + offset] === token)
}

function extractDatasetMatches(description) {
  const normalized = normalizeText(description)
  const tokens = tokenize(normalized)
  const stemmedTokens = tokens.map(stem)
  const consumed = new Array(tokens.length).fill(false)
  const matched = []
  const negated = []
  const matchedEntryIds = new Set()

  for (const candidate of PHRASE_CANDIDATES) {
    const { entry } = candidate
    if (matchedEntryIds.has(entry.id)) continue
    for (let i = 0; i < tokens.length; i += 1) {
      const rangeUsed = candidate.tokens.some((_, offset) => consumed[i + offset])
      if (rangeUsed || !sameSlice(stemmedTokens, i, candidate.stemmedTokens)) continue
      if (entry.negation_sensitive && isNegated(tokens, i)) {
        negated.push(candidate.matchedTerm)
        break
      }
      matched.push({ ...entry, matched_term: candidate.matchedTerm })
      matchedEntryIds.add(entry.id)
      candidate.tokens.forEach((_, offset) => { consumed[i + offset] = true })
      break
    }
  }

  for (const candidate of WORD_CANDIDATES) {
    const { entry } = candidate
    if (matchedEntryIds.has(entry.id)) continue
    for (let i = 0; i < tokens.length; i += 1) {
      if (consumed[i] || stemmedTokens[i] !== candidate.stemmedTokens[0]) continue
      if (entry.negation_sensitive && isNegated(tokens, i)) {
        negated.push(candidate.matchedTerm)
        break
      }
      matched.push({ ...entry, matched_term: candidate.matchedTerm })
      matchedEntryIds.add(entry.id)
      consumed[i] = true
      break
    }
  }

  return { matched, negated: [...new Set(negated)] }
}

function classifyCategory(matched, selectedCategory, hasDescription) {
  const categoryScores = {}
  for (const entry of matched) {
    if (!entry.complaint_category || !entry.category_weight) continue
    categoryScores[entry.complaint_category] =
      (categoryScores[entry.complaint_category] || 0) + Number(entry.category_weight)
  }

  const ranked = Object.entries(categoryScores).sort((a, b) => b[1] - a[1])
  if (!ranked.length) {
    return {
      predicted_category: selectedCategory || 'Other',
      category_confidence: hasDescription ? 25 : 0,
      category_scores: categoryScores,
      classification_basis: 'selected-category fallback',
    }
  }

  const [predictedCategory, topScore] = ranked[0]
  const secondScore = ranked[1]?.[1] || 0
  const smoothing = scoringConfig.categoryConfidenceSmoothing ?? 5
  return {
    predicted_category: predictedCategory,
    category_confidence: Math.min(99, Math.round((topScore / (topScore + secondScore + smoothing)) * 100)),
    category_scores: categoryScores,
    classification_basis: 'matched complaint-language dataset',
  }
}

function classifySentiment(matched) {
  const urgentScore = matched
    .filter(entry => entry.sentiment === 'urgent')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.priority_weight) || 0), 0)
  const negativeScore = matched
    .filter(entry => entry.sentiment === 'negative')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.priority_weight) || 0), 0)

  if (urgentScore >= (scoringConfig.sentimentThresholds?.urgent ?? 12)) return 'urgent'
  if (urgentScore + negativeScore >= (scoringConfig.sentimentThresholds?.negative ?? 4)) return 'negative'
  return 'neutral'
}

export function scoreComplaint({ complaint_type, description, has_photo, base_severity_score }) {
  const cfg = scoringConfig
  const reasons = []
  const { matched, negated } = extractDatasetMatches(description)
  const categoryResult = classifyCategory(matched, complaint_type, Boolean(normalizeText(description)))
  const classification_mismatch = Boolean(
    complaint_type &&
    categoryResult.predicted_category !== complaint_type &&
    categoryResult.category_confidence >= (cfg.categoryMismatchThreshold ?? 60)
  )
  const selectedBaseScore = Math.round(base_severity_score ?? cfg.typeScores?.[complaint_type] ?? cfg.defaultTypeScore ?? 10)
  const predictedBaseScore = Math.round(cfg.typeScores?.[categoryResult.predicted_category] ?? selectedBaseScore)
  const rule_score = classification_mismatch ? predictedBaseScore : selectedBaseScore
  reasons.push(classification_mismatch
    ? `Classified category base severity (${categoryResult.predicted_category}, +${rule_score})`
    : `Selected category base severity (+${rule_score})`)

  const rawKeywordAdjustment = matched.reduce((sum, entry) => sum + (Number(entry.priority_weight) || 0), 0)
  const keywordAdjustment = Math.max(
    cfg.keywordAdjustmentLimits?.minimum ?? -10,
    Math.min(rawKeywordAdjustment, cfg.keywordAdjustmentLimits?.maximum ?? 50)
  )
  const classification_sentiment = classifySentiment(matched)
  const sentimentAdjustment = Number(cfg.sentimentAdjustments?.[classification_sentiment] ?? 0)
  const photoAdjustment = has_photo ? (cfg.photoBonus ?? 10) : 0

  // Hybrid score: rule-based category severity + dataset keyword severity
  // + an explicit sentiment adjustment + supporting photo evidence.
  const sentiment_score = sentimentAdjustment
  const priority_score = Math.max(
    0,
    Math.min(rule_score + keywordAdjustment + sentimentAdjustment + photoAdjustment, cfg.scoreCap ?? 100)
  )

  if (matched.length) {
    const visibleTerms = matched.slice(0, 6).map(entry => entry.matched_term || entry.term).join(', ')
    const sign = keywordAdjustment >= 0 ? '+' : ''
    reasons.push(`Dataset terms: "${visibleTerms}" (${sign}${keywordAdjustment})`)
  } else {
    reasons.push('No dataset phrase matched; selected category used as fallback')
  }
  reasons.push(`Text classified as ${categoryResult.predicted_category} (${categoryResult.category_confidence}% confidence)`)
  if (classification_mismatch) reasons.push(`Selected type differs from the text classification (${complaint_type})`)
  if (negated.length) reasons.push(`Negated terms ignored: "${negated.slice(0, 4).join(', ')}"`)
  reasons.push(`Sentiment adjustment (${classification_sentiment}, +${sentimentAdjustment})`)
  if (has_photo) reasons.push(`Photo evidence (+${photoAdjustment})`)
  else reasons.push('No photo evidence (+0)')

  const priority = priorityFromScore(priority_score)

  const matched_keywords = matched.map(entry => ({
    id: entry.id,
    canonical_term: entry.term,
    term: entry.matched_term || entry.term,
    matched_term: entry.matched_term || entry.term,
    match_type: entry.match_type,
    complaint_category: entry.complaint_category,
    category_weight: entry.category_weight,
    priority_weight: entry.priority_weight,
    severity: entry.severity,
    sentiment: entry.sentiment,
    context: entry.context,
  }))

  return {
    score: priority_score,
    priority,
    rule_score,
    sentiment_score,
    priority_score,
    keyword_adjustment: keywordAdjustment,
    sentiment_adjustment: sentimentAdjustment,
    photo_adjustment: photoAdjustment,
    evidence_adjustment: photoAdjustment,
    predicted_category: categoryResult.predicted_category,
    category_confidence: categoryResult.category_confidence,
    category_scores: categoryResult.category_scores,
    classification_basis: categoryResult.classification_basis,
    classification_sentiment,
    classification_mismatch,
    matched_keywords,
    negated_keywords: negated,
    reasons,
    classifier_version: cfg.classifierVersion || keywordDataset.version,
    classification_method: cfg.classificationMethod || 'Dataset-backed rule-based text classification',
  }
}

export function priorityFromScore(score) {
  const normalized = Math.max(0, Math.min(100, Math.round(Number(score) || 0)))
  if (normalized >= scoringConfig.priorityThresholds.high) return 'high'
  if (normalized >= scoringConfig.priorityThresholds.medium) return 'medium'
  return 'low'
}
