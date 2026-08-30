// Canonical server-side dataset-backed complaint classifier.
// The frontend only previews the result; this server copy calculates
// and stores the authoritative classification.

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { CLAUSE_BOUNDARY, normalizeText, tokenize, tokenizeWithClauseBoundaries, stem } from './textPreprocessor.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scoringConfig = JSON.parse(readFileSync(join(__dirname, '../config/scoringConfig.json'), 'utf-8'))
const keywordDataset = JSON.parse(readFileSync(join(__dirname, '../data/complaintKeywordDataset.json'), 'utf-8'))

const NEGATION_WORDS = new Set([
  'no', 'not', 'never', 'none', 'without',
  'cannot', 'cant', 'dont', 'doesnt', 'didnt', 'isnt', 'arent', 'wasnt', 'werent', 'wont', 'wouldnt', 'shouldnt', 'couldnt',
  'hindi', 'walang', 'wala', 'indi', 'dili',
])
const NEGATION_BREAKERS = new Set(['but', 'however', 'though', 'although', 'yet', 'except', 'pero', 'ngunit', 'subalit', 'kaso'])
const NEGATION_EXCEPTIONS = new Set(['only', 'just', 'merely'])
const NEGATION_WINDOW = 3
const ACTIVE_ENTRIES = keywordDataset.entries.filter(entry => entry.active !== false)

const OPERATIONAL_CATEGORIES = new Set([
  'No Water', 'Water Leak', 'Dirty / Discolored Water', 'Low Water Pressure', 'Meter Problem',
])
const ACCOUNT_CATEGORIES = new Set(['Billing Concern', 'New Connection Request'])

function resolvedConfig(overrides = {}) {
  return {
    ...scoringConfig,
    ...overrides,
    typeScores: { ...scoringConfig.typeScores, ...overrides.typeScores },
    keywordAdjustmentLimits: { ...scoringConfig.keywordAdjustmentLimits, ...overrides.keywordAdjustmentLimits },
    priorityThresholds: { ...scoringConfig.priorityThresholds, ...overrides.priorityThresholds },
    sentimentThresholds: { ...scoringConfig.sentimentThresholds, ...overrides.sentimentThresholds },
    sentimentAdjustments: { ...scoringConfig.sentimentAdjustments, ...overrides.sentimentAdjustments },
  }
}

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
  let inspected = 0
  for (let i = startIndex - 1; i >= 0 && inspected < NEGATION_WINDOW; i -= 1) {
    const token = tokens[i]
    if (token === CLAUSE_BOUNDARY || NEGATION_BREAKERS.has(token)) break
    if (NEGATION_WORDS.has(token) && NEGATION_EXCEPTIONS.has(tokens[i + 1])) continue
    inspected += 1
    if (NEGATION_WORDS.has(token)) return true
  }
  return false
}

// Optimal-string-alignment distance, bounded for the classifier's one-edit
// typo tolerance. Transposed neighboring characters count as one edit.
function editDistance(left, right) {
  const rows = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0))
  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1)
      }
    }
  }
  return rows[left.length][right.length]
}

function tokenMatchQuality(actual, expected) {
  if (actual === expected) return 'exact'
  if (
    expected.length >= 5 && actual.length >= 4 &&
    expected[0] === actual[0] && Math.abs(expected.length - actual.length) <= 1 &&
    editDistance(actual, expected) <= 1
  ) return 'fuzzy'
  return null
}

function phraseMatch(tokens, start, phraseTokens) {
  if (start + phraseTokens.length > tokens.length) return null
  const qualities = phraseTokens.map((token, offset) => tokenMatchQuality(tokens[start + offset], token))
  if (qualities.some(quality => !quality)) return null
  return qualities.includes('fuzzy') ? 'fuzzy' : 'exact'
}

function extractDatasetMatches(description) {
  const tokens = tokenizeWithClauseBoundaries(description)
  const stemmedTokens = tokens.map(stem)
  const consumed = new Array(tokens.length).fill(false)
  const matched = []
  const negatedMatches = new Map()
  const matchedEntryIds = new Set()
  const rememberNegated = (entry, matchedTerm) => {
    const key = `${entry.id}:${matchedTerm}`
    if (!negatedMatches.has(key)) negatedMatches.set(key, { ...entry, matched_term: matchedTerm })
  }

  for (const candidate of PHRASE_CANDIDATES) {
    const { entry } = candidate
    if (matchedEntryIds.has(entry.id)) continue
    for (let i = 0; i < tokens.length; i += 1) {
      const rangeUsed = candidate.tokens.some((_, offset) => consumed[i + offset])
      const matchQuality = rangeUsed ? null : phraseMatch(stemmedTokens, i, candidate.stemmedTokens)
      if (!matchQuality) continue
      if (entry.negation_sensitive && isNegated(tokens, i)) {
        rememberNegated(entry, candidate.matchedTerm)
        continue
      }
      matched.push({
        ...entry,
        matched_term: candidate.matchedTerm,
        match_quality: matchQuality,
        observed_term: tokens.slice(i, i + candidate.tokens.length).join(' '),
      })
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
        rememberNegated(entry, candidate.matchedTerm)
        continue
      }
      matched.push({ ...entry, matched_term: candidate.matchedTerm, match_quality: 'exact', observed_term: tokens[i] })
      matchedEntryIds.add(entry.id)
      consumed[i] = true
      break
    }
  }

  const negatedEntries = [...negatedMatches.values()]
  return {
    matched,
    negated: [...new Set(negatedEntries.map(entry => entry.matched_term || entry.term))],
    negatedMatches: negatedEntries,
  }
}

function categoryScoreTotals(matched) {
  const categoryScores = {}
  for (const entry of matched) {
    if (!entry.complaint_category || !entry.category_weight) continue
    categoryScores[entry.complaint_category] =
      (categoryScores[entry.complaint_category] || 0) + Number(entry.category_weight)
  }
  return categoryScores
}

function classifyCategory(matched, selectedCategory, hasDescription, cfg) {
  const categoryScores = categoryScoreTotals(matched)

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
  const [runnerUpCategory, secondScore = 0] = ranked[1] || []
  const smoothing = cfg.categoryConfidenceSmoothing ?? 5
  // Confidence reflects the absolute evidence for the leading category;
  // dominance separately communicates how much categories compete.
  const evidenceConfidence = Math.min(99, Math.round((topScore / (topScore + smoothing)) * 100))
  const categoryDominance = Math.round((topScore / Math.max(1, topScore + secondScore)) * 100)
  const selectionThreshold = cfg.categorySelectionThreshold ?? cfg.categoryMismatchThreshold ?? 60
  if (selectedCategory && predictedCategory !== selectedCategory && evidenceConfidence < selectionThreshold) {
    return {
      predicted_category: selectedCategory,
      category_confidence: 25,
      category_scores: categoryScores,
      evidence_category: predictedCategory,
      evidence_confidence: evidenceConfidence,
      runner_up_category: runnerUpCategory || null,
      category_dominance: categoryDominance,
      classification_basis: 'selected-category fallback (low-confidence text evidence)',
    }
  }
  return {
    predicted_category: predictedCategory,
    category_confidence: evidenceConfidence,
    category_scores: categoryScores,
    evidence_category: predictedCategory,
    evidence_confidence: evidenceConfidence,
    runner_up_category: runnerUpCategory || null,
    category_dominance: categoryDominance,
    classification_basis: 'matched complaint-language dataset',
  }
}

function classifySentiment(matched, cfg) {
  const urgentScore = matched
    .filter(entry => entry.sentiment === 'urgent')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.priority_weight) || 0), 0)
  const negativeScore = matched
    .filter(entry => entry.sentiment === 'negative')
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.priority_weight) || 0), 0)

  if (urgentScore >= (cfg.sentimentThresholds?.urgent ?? 12)) return 'urgent'
  if (urgentScore + negativeScore >= (cfg.sentimentThresholds?.negative ?? 4)) return 'negative'
  return 'neutral'
}

/**
 * Reconstructs category competition and routing review hints from matched
 * evidence. It works both on a live score and on keywords stored in the DB.
 */
export function deriveCategoryInsights(matchedEntries = [], primaryCategory, configOverrides = {}) {
  const cfg = resolvedConfig(configOverrides)
  const scores = categoryScoreTotals(matchedEntries)
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const topScore = ranked[0]?.[1] || 0
  const secondScore = ranked[1]?.[1] || 0
  const smoothing = cfg.categoryConfidenceSmoothing ?? 5
  const evidenceByCategory = matchedEntries.reduce((groups, entry) => {
    if (!entry.complaint_category) return groups
    const term = entry.matched_term || entry.term || entry.canonical_term
    if (!groups[entry.complaint_category]) groups[entry.complaint_category] = []
    if (term && !groups[entry.complaint_category].includes(term)) groups[entry.complaint_category].push(term)
    return groups
  }, {})
  const categoryCandidates = ranked.map(([category, score]) => ({
    category,
    score,
    confidence: Math.min(99, Math.round((score / (score + smoothing)) * 100)),
    relative_strength: topScore ? Math.round((score / topScore) * 100) : 0,
    matched_terms: evidenceByCategory[category] || [],
  }))
  const minimumScore = cfg.secondaryCategoryMinimumScore ?? 4
  const minimumRatio = cfg.secondaryCategoryMinimumRatio ?? 0.25
  const secondaryCategories = categoryCandidates.filter(candidate =>
    candidate.category !== primaryCategory &&
    candidate.score >= minimumScore &&
    candidate.score / Math.max(1, topScore) >= minimumRatio
  )
  const categoryDominance = ranked.length > 1
    ? Math.round((topScore / Math.max(1, topScore + secondScore)) * 100)
    : (ranked.length ? 100 : 0)
  const classificationAmbiguous = ranked.length > 1 &&
    categoryDominance <= (cfg.categoryAmbiguityDominanceThreshold ?? 60)
  const involved = new Set([primaryCategory, ...secondaryCategories.map(item => item.category)].filter(Boolean))
  const hasOperational = [...involved].some(category => OPERATIONAL_CATEGORIES.has(category))
  const hasAccount = [...involved].some(category => ACCOUNT_CATEGORIES.has(category))
  const operationalCount = [...involved].filter(category => OPERATIONAL_CATEGORIES.has(category)).length
  const routingRecommendations = []

  if (hasOperational && hasAccount) {
    routingRecommendations.push({
      code: 'cross_workflow_review',
      label: 'Coordinate the service response with a customer-account review.',
    })
  } else if (operationalCount > 1) {
    routingRecommendations.push({
      code: 'combined_service_review',
      label: 'Review the related service symptoms together before dispatch.',
    })
  }
  if (classificationAmbiguous) {
    routingRecommendations.push({
      code: 'confirm_primary_issue',
      label: 'Confirm the primary complaint type during review.',
    })
  }

  return {
    category_candidates: categoryCandidates,
    secondary_categories: secondaryCategories,
    multi_issue: secondaryCategories.length > 0,
    classification_ambiguous: classificationAmbiguous,
    category_dominance: categoryDominance,
    routing_recommendations: routingRecommendations,
  }
}

export function scoreComplaint({ complaint_type, description, has_photo, base_severity_score }, configOverrides = {}) {
  const cfg = resolvedConfig(configOverrides)
  const reasons = []
  const { matched, negated, negatedMatches } = extractDatasetMatches(description)
  const categoryResult = classifyCategory(matched, complaint_type, Boolean(normalizeText(description)), cfg)
  const categoryInsights = deriveCategoryInsights(matched, categoryResult.predicted_category, cfg)
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

  const rawKeywordAdjustment = matched.reduce((sum, entry) => sum + (Number(entry.priority_weight) || 0), 0) *
    Number(cfg.keywordAdjustmentScale ?? 1)
  const keywordAdjustment = Math.max(
    cfg.keywordAdjustmentLimits?.minimum ?? -10,
    Math.min(rawKeywordAdjustment, cfg.keywordAdjustmentLimits?.maximum ?? 50)
  )
  const matchedEntryIds = new Set(matched.map(entry => entry.id))
  const strongestDeniedSeverity = negatedMatches
    .filter(entry => !matchedEntryIds.has(entry.id))
    .reduce((highest, entry) => Math.max(highest, Number(entry.priority_weight) || 0), 0)
  const negatedMitigationLimit = Math.abs(Number(cfg.negatedEvidenceMitigation ?? 0))
  const negatedAdjustment = strongestDeniedSeverity > 0
    ? -Math.min(strongestDeniedSeverity, negatedMitigationLimit)
    : 0
  const classification_sentiment = classifySentiment(matched, cfg)
  const sentimentAdjustment = Number(cfg.sentimentAdjustments?.[classification_sentiment] ?? 0)
  const photoAdjustment = has_photo ? (cfg.photoBonus ?? 10) : 0

  // Hybrid score: rule-based category severity + dataset keyword severity
  // + an explicit sentiment adjustment + supporting photo evidence, with a
  // small capped mitigation when the complainant explicitly denies a severe symptom.
  const sentiment_score = sentimentAdjustment
  const priority_score = Math.max(
    0,
    Math.min(rule_score + keywordAdjustment + negatedAdjustment + sentimentAdjustment + photoAdjustment, cfg.scoreCap ?? 100)
  )

  if (matched.length) {
    const visibleTerms = matched.slice(0, 6).map(entry => entry.matched_term || entry.term).join(', ')
    const sign = keywordAdjustment >= 0 ? '+' : ''
    reasons.push(`Dataset terms: "${visibleTerms}" (${sign}${keywordAdjustment})`)
  } else {
    reasons.push('No dataset phrase matched; selected category used as fallback')
  }
  for (const entry of matched.filter(item => item.match_quality === 'fuzzy').slice(0, 3)) {
    reasons.push(`Typo-tolerant match: "${entry.observed_term}" → "${entry.matched_term || entry.term}"`)
  }
  if (categoryResult.evidence_category && categoryResult.evidence_category !== categoryResult.predicted_category) {
    reasons.push(`Weak text evidence favored ${categoryResult.evidence_category} (${categoryResult.evidence_confidence}%); retained selected category ${categoryResult.predicted_category}`)
  } else {
    reasons.push(`Text classified as ${categoryResult.predicted_category} (${categoryResult.category_confidence}% confidence)`)
  }
  if (classification_mismatch) reasons.push(`Selected type differs from the text classification (${complaint_type})`)
  if (categoryInsights.multi_issue) {
    reasons.push(`Multiple issues detected: ${categoryInsights.secondary_categories.map(item => item.category).join(', ')}`)
  }
  if (categoryInsights.classification_ambiguous) reasons.push('Competing category evidence requires confirmation of the primary issue')
  for (const recommendation of categoryInsights.routing_recommendations) reasons.push(recommendation.label)
  if (negated.length) reasons.push(`Negated terms ignored: "${negated.slice(0, 4).join(', ')}"`)
  if (negatedAdjustment) reasons.push(`Explicitly denied severe symptom (${negatedAdjustment})`)
  reasons.push(`Sentiment adjustment (${classification_sentiment}, +${sentimentAdjustment})`)
  if (has_photo) reasons.push(`Photo evidence (+${photoAdjustment})`)
  else reasons.push('No photo evidence (+0)')

  const priority = priorityFromScore(priority_score, cfg)

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
    match_quality: entry.match_quality || 'exact',
    observed_term: entry.observed_term || entry.matched_term || entry.term,
  }))

  return {
    score: priority_score,
    priority,
    rule_score,
    sentiment_score,
    priority_score,
    keyword_adjustment: keywordAdjustment,
    negated_adjustment: negatedAdjustment,
    sentiment_adjustment: sentimentAdjustment,
    photo_adjustment: photoAdjustment,
    evidence_adjustment: photoAdjustment,
    predicted_category: categoryResult.predicted_category,
    category_confidence: categoryResult.category_confidence,
    category_scores: categoryResult.category_scores,
    evidence_category: categoryResult.evidence_category || null,
    evidence_confidence: categoryResult.evidence_confidence || 0,
    runner_up_category: categoryResult.runner_up_category || null,
    category_dominance: categoryInsights.category_dominance,
    category_candidates: categoryInsights.category_candidates,
    secondary_categories: categoryInsights.secondary_categories,
    multi_issue: categoryInsights.multi_issue,
    classification_ambiguous: categoryInsights.classification_ambiguous,
    routing_recommendations: categoryInsights.routing_recommendations,
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

export function priorityFromScore(score, configOverrides = {}) {
  const cfg = resolvedConfig(configOverrides)
  const normalized = Math.max(0, Math.min(100, Math.round(Number(score) || 0)))
  if (normalized >= cfg.priorityThresholds.high) return 'high'
  if (normalized >= cfg.priorityThresholds.medium) return 'medium'
  return 'low'
}
