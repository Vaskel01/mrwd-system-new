import test from 'node:test'
import assert from 'node:assert/strict'
import { priorityFromScore, scoreComplaint } from '../src/lib/priorityScoring.js'
import { summarizeEvaluation } from '../src/lib/classifierEvaluation.js'
import { parseLabelledCsv, validateLabelledComplaints } from '../src/lib/labelledComplaintData.js'
import { presentComplaintForRole } from '../src/lib/shapeComplaint.js'
import { isPasswordValid, passwordStrength } from '../../src/lib/passwordPolicy.js'
import { customerProfileMatches, normalizeCustomerProfileInput } from '../src/lib/profileUpdate.js'
import { CAPABILITIES, capabilitiesForUser, hasCapability } from '../src/lib/accessControl.js'
import { homeForUser } from '../../src/lib/accessControl.js'
import { staffAccessLabel, TERMS } from '../../src/config/terminology.js'

test('classifier detects a severe water leak and assigns high priority', () => {
  const result = scoreComplaint({
    complaint_type: 'Billing Concern',
    description: 'A major pipe burst is flooding the road near the school.',
    has_photo: true,
    base_severity_score: 5,
  })
  assert.equal(result.predicted_category, 'Water Leak')
  assert.equal(result.classification_mismatch, true)
  assert.equal(result.priority, 'high')
  assert.ok(result.matched_keywords.length > 0)
})

test('classifier ignores a negated leak term', () => {
  const result = scoreComplaint({
    complaint_type: 'Meter Problem',
    description: 'There is no leak, but the meter keeps running while every faucet is closed.',
    has_photo: false,
    base_severity_score: 15,
  })
  assert.notEqual(result.predicted_category, 'Water Leak')
  assert.ok(result.negated_keywords.includes('leak'))
})

test('customer complaint response removes all classifier and priority fields', () => {
  const source = {
    id: '00000000-0000-0000-0000-000000000001',
    priority: 'high',
    priority_score: 88,
    algorithm_priority_score: 72,
    priority_override_reason: 'Verified emergency impact',
    priority_overridden_by: '00000000-0000-0000-0000-000000000002',
    priority_overridden_at: '2026-07-28T00:00:00.000Z',
    priority_is_overridden: true,
    classified_category: 'Water Leak',
    classification_confidence: 91,
    classification_keywords: [{ term: 'pipe burst' }],
    classifier_version: 'dataset-rule-v1.0.0',
  }
  const shown = presentComplaintForRole(source, 'customer')
  assert.equal(shown.priority, undefined)
  assert.equal(shown.priority_score, undefined)
  assert.equal(shown.algorithm_priority_score, undefined)
  assert.equal(shown.priority_override_reason, undefined)
  assert.equal(shown.priority_is_overridden, undefined)
  assert.equal(shown.classified_category, undefined)
  assert.equal(shown.classification_confidence, undefined)
  assert.equal(shown.classification_keywords, undefined)
  assert.equal(shown.classifier_version, undefined)
})

test('maintenance response keeps only operational category and priority', () => {
  const source = {
    priority: 'medium',
    priority_score: 45,
    classified_category: 'Meter Problem',
    classification_confidence: 84,
    classification_keywords: [{ term: 'meter running' }],
  }
  const shown = presentComplaintForRole(source, 'maintenance_personnel')
  assert.equal(shown.priority, 'medium')
  assert.equal(shown.classified_category, 'Meter Problem')
  assert.equal(shown.priority_score, undefined)
  assert.equal(shown.classification_confidence, undefined)
  assert.equal(shown.classification_keywords, undefined)
})

test('admin response retains complete classifier evidence', () => {
  const source = { priority: 'high', priority_score: 90, classification_keywords: [{ term: 'flooding' }] }
  assert.deepEqual(presentComplaintForRole(source, 'admin'), source)
})

test('department modules grant only their approved administrative capabilities', () => {
  const commercialAdmin = { role: 'admin', staff_position: 'commercial_staff', department: { code: 'COMMERCIAL' }, division: { code: 'NSCCCD' } }
  const ecmdAdmin = { role: 'admin', staff_position: 'department_staff', department: { code: 'ECMD' }, division: { code: 'WDLCD' } }
  const supervisor = { role: 'admin', staff_position: 'supervisor', department: null }
  const unassignedAdmin = { role: 'admin', staff_position: null, department: null }

  assert.equal(hasCapability(commercialAdmin, CAPABILITIES.COMMERCIAL_COMPLAINTS), true)
  assert.equal(hasCapability(commercialAdmin, CAPABILITIES.ECMD_DISPATCH), false)
  assert.equal(hasCapability(commercialAdmin, CAPABILITIES.SYSTEM_STAFF), false)
  assert.equal(hasCapability(ecmdAdmin, CAPABILITIES.ECMD_DISPATCH), true)
  assert.equal(hasCapability(ecmdAdmin, CAPABILITIES.COMMERCIAL_BILLING), false)
  assert.equal(hasCapability(ecmdAdmin, CAPABILITIES.SYSTEM_AUDIT), false)
  assert.equal(hasCapability(supervisor, CAPABILITIES.COMMERCIAL_REPORTS), false)
  assert.equal(hasCapability(supervisor, CAPABILITIES.ECMD_OPERATIONS), false)
  assert.equal(hasCapability(supervisor, CAPABILITIES.SYSTEM_APPROVALS), true)
  assert.deepEqual(capabilitiesForUser(unassignedAdmin), [])
  assert.deepEqual(capabilitiesForUser({ role: 'admin', staff_position: 'commercial_staff', department: { code: 'COMMERCIAL' } }), [])
  assert.deepEqual(capabilitiesForUser({ role: 'admin', staff_position: 'department_staff', department: { code: 'ECMD' }, division: { code: 'NSCCCD' } }), [])
})

test('department accounts use canonical labels and distinct home pages', () => {
  const commercialStaff = { role: 'admin', staff_position: 'commercial_staff', department: { code: 'COMMERCIAL' }, division: { code: 'NSCCCD' } }
  const ecmdStaff = { role: 'admin', staff_position: 'department_staff', department: { code: 'ECMD' }, division: { code: 'WDLCD' } }
  const systemSupervisor = { role: 'admin', staff_position: 'supervisor', department: null }
  const maintenancePersonnel = { role: 'maintenance_personnel' }

  assert.equal(staffAccessLabel(commercialStaff), TERMS.COMMERCIAL_STAFF)
  assert.equal(staffAccessLabel(ecmdStaff), TERMS.ECMD_STAFF)
  assert.equal(staffAccessLabel(systemSupervisor), TERMS.SYSTEM_SUPERVISOR)
  assert.equal(staffAccessLabel(maintenancePersonnel), TERMS.MAINTENANCE_PERSONNEL)
  assert.equal(homeForUser(commercialStaff), '/commercial/dashboard')
  assert.equal(homeForUser(ecmdStaff), '/ecmd/dashboard')
  assert.equal(homeForUser(systemSupervisor), '/system/dashboard')
})

test('ECMD administrative responses keep operational priority but hide classifier evidence', () => {
  const source = {
    priority: 'high',
    priority_score: 83,
    classified_category: 'Water Leak',
    classification_confidence: 91,
    classification_keywords: [{ term: 'burst pipe' }],
  }
  const shown = presentComplaintForRole(source, 'admin', { canViewClassifier: false })
  assert.equal(shown.priority, 'high')
  assert.equal(shown.classified_category, 'Water Leak')
  assert.equal(shown.priority_score, undefined)
  assert.equal(shown.classification_confidence, undefined)
  assert.equal(shown.classification_keywords, undefined)
})


test('hybrid score applies an explicit sentiment adjustment', () => {
  const negative = scoreComplaint({
    complaint_type: 'Billing Concern',
    description: 'I received an incorrect bill and an unexpected overcharge.',
    has_photo: false,
    base_severity_score: 5,
  })
  assert.equal(negative.classification_sentiment, 'negative')
  assert.equal(negative.sentiment_adjustment, 5)
  assert.equal(negative.sentiment_score, 5)
  assert.equal(negative.priority_score, Math.min(100, negative.rule_score + negative.keyword_adjustment + negative.negated_adjustment + negative.sentiment_adjustment + negative.photo_adjustment))
})

test('urgent sentiment receives a larger adjustment than neutral sentiment', () => {
  const urgent = scoreComplaint({
    complaint_type: 'Water Leak',
    description: 'Emergency! A pipe burst is flooding the road near the hospital.',
    has_photo: false,
    base_severity_score: 35,
  })
  const neutral = scoreComplaint({
    complaint_type: 'New Connection Request',
    description: 'I would like to ask about the requirements for a new connection.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(urgent.classification_sentiment, 'urgent')
  assert.equal(urgent.sentiment_adjustment, 10)
  assert.equal(neutral.classification_sentiment, 'neutral')
  assert.equal(neutral.sentiment_adjustment, 0)
})

test('classifier recognizes configured synonyms without duplicating canonical entry weight', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'A ruptured pipe is sending water across the street.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.predicted_category, 'Water Leak')
  assert.ok(result.matched_keywords.some(item =>
    item.canonical_term === 'burst pipe' && item.matched_term === 'ruptured pipe'))
  assert.equal(result.matched_keywords.filter(item => item.id === 'KW-014').length, 1)
})

test('classifier recognizes a suggestive phrase that does not use the canonical term', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'Nothing comes out of the faucet in our whole house.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.predicted_category, 'No Water')
  assert.ok(result.matched_keywords.some(item => item.matched_term === 'nothing comes out of the faucet'))
})

test('priority thresholds include exact boundary values', () => {
  assert.equal(priorityFromScore(29), 'low')
  assert.equal(priorityFromScore(30), 'medium')
  assert.equal(priorityFromScore(59), 'medium')
  assert.equal(priorityFromScore(60), 'high')
  assert.equal(priorityFromScore(55, { priorityThresholds: { high: 55, medium: 25 } }), 'high')
})

test('password policy rejects short or single-character-class passwords', () => {
  assert.equal(isPasswordValid('short1'), false)
  assert.equal(isPasswordValid('onlyletters'), false)
  assert.equal(isPasswordValid('12345678'), false)
  assert.equal(isPasswordValid('Secure123'), true)
  assert.ok(passwordStrength('Secure123!').score >= passwordStrength('password1').score)
})

test('customer profile fields are trimmed, nullable, and verifiable after saving', () => {
  const normalized = normalizeCustomerProfileInput({
    account_number: '  MRWD-00123  ',
    phone: ' 0917 123 4567 ',
    service_address: '  12 Mabini Street, Roxas City  ',
    barangay: '  Tiza ',
  })
  assert.deepEqual(normalized, {
    account_number: 'MRWD-00123',
    phone: '0917 123 4567',
    service_address: '12 Mabini Street, Roxas City',
    barangay: 'Tiza',
  })
  assert.equal(customerProfileMatches(normalized, normalized), true)
  assert.equal(customerProfileMatches({ ...normalized, phone: null }, normalized), false)
  assert.equal(normalizeCustomerProfileInput({ phone: '   ' }).phone, null)
})

test('expanded local suggestive phrases classify No Water and water-quality concerns', () => {
  const noWater = scoreComplaint({
    complaint_type: 'Other',
    description: 'Wala ga agas tubig sa amon halin sang aga.',
    has_photo: false,
    base_severity_score: 10,
  })
  const quality = scoreComplaint({
    complaint_type: 'Other',
    description: 'Maputik na tubig ang lumalabas sa gripo.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(noWater.predicted_category, 'No Water')
  assert.equal(quality.predicted_category, 'Dirty / Discolored Water')
})

test('negation stays inside punctuation and contrast-clause boundaries', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'No leak; burst pipe flooding the street.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.predicted_category, 'Water Leak')
  assert.equal(result.priority, 'high')
  assert.ok(result.matched_keywords.some(item => item.matched_term === 'burst pipe'))
  assert.ok(result.matched_keywords.some(item => item.matched_term === 'flooding'))
})

test('a later positive occurrence can match after an earlier negated occurrence', () => {
  const result = scoreComplaint({
    complaint_type: 'Water Leak',
    description: 'No leak was visible yesterday, but now there is a leak flooding the road.',
    has_photo: false,
    base_severity_score: 35,
  })
  assert.ok(result.negated_keywords.includes('leak'))
  assert.ok(result.matched_keywords.some(item => item.matched_term === 'leak'))
  assert.equal(result.negated_adjustment, 0)
  assert.equal(result.priority, 'high')
})

test('contractions and local-language negation suppress denied symptoms', () => {
  const contraction = scoreComplaint({
    complaint_type: 'Water Leak',
    description: "It isn't flooding, only a small leak beside the meter.",
    has_photo: false,
    base_severity_score: 35,
  })
  const local = scoreComplaint({
    complaint_type: 'Meter Problem',
    description: 'Hindi tagas ang problema, meter reading lamang.',
    has_photo: false,
    base_severity_score: 15,
  })
  assert.ok(contraction.negated_keywords.includes('flooding'))
  assert.equal(contraction.negated_adjustment, -5)
  assert.equal(contraction.priority, 'medium')
  assert.ok(local.negated_keywords.includes('tagas'))
  assert.equal(local.predicted_category, 'Meter Problem')
  assert.equal(local.priority, 'low')
})

test('weak competing evidence keeps the selected category for safe routing', () => {
  const result = scoreComplaint({
    complaint_type: 'Billing Concern',
    description: 'This is only a meter question.',
    has_photo: false,
    base_severity_score: 5,
  })
  assert.equal(result.predicted_category, 'Billing Concern')
  assert.equal(result.evidence_category, 'Meter Problem')
  assert.ok(result.evidence_confidence < 60)
  assert.equal(result.classification_mismatch, false)
  assert.match(result.classification_basis, /low-confidence text evidence/)
})

test('classifier tolerates one typo inside a strong multi-word phrase', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'A brst pipe is floding the road.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.predicted_category, 'Water Leak')
  assert.equal(result.priority, 'high')
  assert.ok(result.matched_keywords.some(item =>
    item.canonical_term === 'burst pipe' && item.match_quality === 'fuzzy' && item.observed_term === 'brst pipe'))
})

test('classifier expands conservative mixed-language complaint abbreviations', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'Wlang wtr sa buong brgy since 6 hrs.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.predicted_category, 'No Water')
  assert.equal(result.priority, 'high')
  assert.ok(result.matched_keywords.some(item => item.matched_term === 'walang water'))
})

test('classifier exposes cross-workflow evidence for a multi-issue complaint', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'No water since yesterday and my payment is not reflected.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.predicted_category, 'No Water')
  assert.equal(result.multi_issue, true)
  assert.ok(result.secondary_categories.some(item => item.category === 'Billing Concern'))
  assert.ok(result.routing_recommendations.some(item => item.code === 'cross_workflow_review'))
})

test('classifier flags equally supported service symptoms as ambiguous', () => {
  const result = scoreComplaint({
    complaint_type: 'Other',
    description: 'Brown water with low pressure is coming from the faucet.',
    has_photo: false,
    base_severity_score: 10,
  })
  assert.equal(result.multi_issue, true)
  assert.equal(result.classification_ambiguous, true)
  assert.equal(result.category_dominance, 50)
  assert.ok(result.routing_recommendations.some(item => item.code === 'confirm_primary_issue'))
})

test('non-classifier roles cannot see multi-issue evidence or routing hints', () => {
  const source = {
    priority: 'high',
    classified_category: 'No Water',
    classification_multi_issue: true,
    classification_ambiguous: true,
    classification_category_candidates: [{ category: 'No Water', score: 9 }],
    classification_secondary_categories: [{ category: 'Billing Concern', score: 4 }],
    classification_category_dominance: 69,
    classification_routing_recommendations: [{ code: 'cross_workflow_review', label: 'Review both.' }],
  }
  for (const role of ['customer', 'maintenance_personnel']) {
    const shown = presentComplaintForRole(source, role)
    assert.equal(shown.classification_multi_issue, undefined)
    assert.equal(shown.classification_ambiguous, undefined)
    assert.equal(shown.classification_category_candidates, undefined)
    assert.equal(shown.classification_secondary_categories, undefined)
    assert.equal(shown.classification_category_dominance, undefined)
    assert.equal(shown.classification_routing_recommendations, undefined)
  }
})

test('evaluation reports per-class metrics and warns about imbalanced small samples', () => {
  const results = [
    { expected_category: 'No Water', predicted_category: 'No Water', expected_priority: 'high', predicted_priority: 'high' },
    { expected_category: 'No Water', predicted_category: 'Water Leak', expected_priority: 'high', predicted_priority: 'medium' },
    { expected_category: 'No Water', predicted_category: 'No Water', expected_priority: 'high', predicted_priority: 'high' },
    { expected_category: 'No Water', predicted_category: 'No Water', expected_priority: 'medium', predicted_priority: 'medium' },
    { expected_category: 'Water Leak', predicted_category: 'Water Leak', expected_priority: 'high', predicted_priority: 'high' },
  ]
  const summary = summarizeEvaluation(results)
  assert.equal(summary.category_accuracy, 80)
  assert.equal(summary.category_metrics.per_class['Water Leak'].recall, 100)
  assert.equal(summary.category_imbalance_ratio, 4)
  assert.ok(summary.warnings.some(warning => warning.includes('imbalance')))
})

test('labelled CSV parsing handles quoted commas and validates fields', () => {
  const parsed = parseLabelledCsv('id,split,selected_type,description,has_photo,expected_category,expected_priority\nL1,validation,Other,"No water, since noon",false,No Water,high\n')
  const validated = validateLabelledComplaints(parsed, ['Other', 'No Water'])
  assert.equal(validated[0].description, 'No water, since noon')
  assert.equal(validated[0].has_photo, false)
})
