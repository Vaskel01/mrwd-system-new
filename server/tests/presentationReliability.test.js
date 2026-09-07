import test from 'node:test'
import assert from 'node:assert/strict'
import { needsAction, actionLabel } from '../../src/lib/notificationPresentation.js'
import { loginFailure } from '../src/lib/loginFailure.js'

test('status notifications never infer a required response from text', () => {
  const item = { related_complaint_id: 'qa', notification_type: 'status', title: 'Personnel assigned', message: 'NSCCCD completed its review and sent your complaint.' }
  assert.equal(needsAction(item), false)
  assert.equal(actionLabel(item), 'Open complaint →')
})
test('explicit action types require a linked complaint', () => {
  for (const notification_type of ['assignment', 'warning', 'feedback']) {
    assert.equal(needsAction({ notification_type, related_complaint_id: 'qa' }), true)
    assert.equal(needsAction({ notification_type }), false)
  }
  assert.equal(actionLabel({notification_type:'completed'}), 'Review resolution →')
})
test('network/provider outages are not labelled wrong passwords', () => {
  for (const error of [undefined, {status:0}, {status:503}, {status:502}, {name:'AuthRetryableFetchError',status:400}]) {
    assert.equal(loginFailure(error).status,503)
    assert.equal(loginFailure(error).reason,'auth_unavailable')
  }
  assert.equal(loginFailure({status:429}).status,429)
  assert.equal(loginFailure({status:400,code:'invalid_credentials'}).status,401)
  assert.equal(loginFailure({status:401}).reason,'invalid_credentials')
})
