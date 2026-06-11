// ─────────────────────────────────────────────────────────
// HYBRID SENTIMENT-AWARE PRIORITY SCORING ALGORITHM
// Pure JavaScript — runs entirely on the frontend
// TODO: can be moved server-side later without changing logic
// ─────────────────────────────────────────────────────────

const HIGH_KEYWORDS = [
  'urgent', 'emergency', 'dangerous', 'no water', 'no supply',
  'burst', 'flooding', 'flood', 'contaminated', 'dirty water',
  'angry', 'furious', 'immediately', 'critical', 'health risk',
  'sick', 'hospital', 'baby', 'elderly', 'days without',
]

const MEDIUM_KEYWORDS = [
  'leak', 'leaking', 'pressure', 'low pressure', 'discolored',
  'brown water', 'smell', 'odor', 'interrupted', 'no supply for hours',
  'frustrated', 'concerned', 'problem', 'issue',
]

const LOW_KEYWORDS = [
  'billing', 'bill', 'meter', 'reading', 'inquiry',
  'question', 'request', 'when', 'schedule',
]

const TYPE_SCORES = {
  'Water Interruption':     40,
  'Water Leak':             35,
  'Dirty / Discolored Water': 30,
  'Low Water Pressure':     20,
  'Meter Problem':          15,
  'New Connection Request': 10,
  'Billing Concern':        5,
  'Other':                  10,
}

/**
 * Scores a complaint and returns priority level + numeric score
 * @param {{ complaint_type: string, description: string, has_photo: boolean }} input
 * @returns {{ score: number, priority: 'low' | 'medium' | 'high', reasons: string[] }}
 */
export function scorePriority({ complaint_type, description, has_photo }) {
  let score = 0
  const reasons = []
  const text = description.toLowerCase()

  // 1. Type-based score
  const typeScore = TYPE_SCORES[complaint_type] || 10
  score += typeScore
  reasons.push(`Type "${complaint_type}" (+${typeScore})`)

  // 2. Keyword sentiment analysis
  let highMatches = HIGH_KEYWORDS.filter(k => text.includes(k))
  let medMatches  = MEDIUM_KEYWORDS.filter(k => text.includes(k))
  let lowMatches  = LOW_KEYWORDS.filter(k => text.includes(k))

  if (highMatches.length > 0) {
    const add = Math.min(highMatches.length * 15, 45)
    score += add
    reasons.push(`Urgent keywords: "${highMatches.slice(0,3).join(', ')}" (+${add})`)
  }
  if (medMatches.length > 0) {
    const add = Math.min(medMatches.length * 8, 24)
    score += add
    reasons.push(`Concern keywords: "${medMatches.slice(0,3).join(', ')}" (+${add})`)
  }
  if (lowMatches.length > 0) {
    score -= 5
    reasons.push(`Low-urgency keywords detected (-5)`)
  }

  // 3. Photo attachment bonus
  if (has_photo) {
    score += 10
    reasons.push('Photo attached (+10)')
  }

  // 4. Clamp score
  score = Math.max(0, Math.min(score, 100))

  // 5. Classify
  let priority
  if (score >= 60)      priority = 'high'
  else if (score >= 30) priority = 'medium'
  else                  priority = 'low'

  return { score, priority, reasons }
}
