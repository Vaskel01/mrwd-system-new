import test from 'node:test'
import assert from 'node:assert/strict'
import { priorityFromScore, scoreComplaint } from '../src/lib/priorityScoring.js'
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
  const commercialAdmin = { role: 'admin', staff_position: 'commercial_staff', department: { code: 'COMMERCIAL' } }
  const ecmdAdmin = { role: 'admin', staff_position: 'department_staff', department: { code: 'ECMD' } }
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
})

test('department accounts use canonical labels and distinct home pages', () => {
  const commercialStaff = { role: 'admin', staff_position: 'commercial_staff', department: { code: 'COMMERCIAL' } }
  const ecmdStaff = { role: 'admin', staff_position: 'department_staff', department: { code: 'ECMD' } }
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
  assert.equal(negative.priority_score, Math.min(100, negative.rule_score + negative.keyword_adjustment + negative.sentiment_adjustment + negative.photo_adjustment))
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
