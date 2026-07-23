import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreComplaint } from '../src/lib/priorityScoring.js'
import { presentComplaintForRole } from '../src/lib/shapeComplaint.js'

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
    classified_category: 'Water Leak',
    classification_confidence: 91,
    classification_keywords: [{ term: 'pipe burst' }],
    classifier_version: 'dataset-rule-v1.0.0',
  }
  const shown = presentComplaintForRole(source, 'customer')
  assert.equal(shown.priority, undefined)
  assert.equal(shown.priority_score, undefined)
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
