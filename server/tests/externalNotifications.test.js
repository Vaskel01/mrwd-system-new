import test from 'node:test'
import assert from 'node:assert/strict'
import {
  externalProviderReadiness,
  normalizeSmsDestination,
  runExternalNotificationBatch,
  sendExternalNotification,
} from '../src/lib/externalNotifications.js'

const emailEnvironment = {
  RESEND_API_KEY: 'test-key',
  NOTIFICATION_EMAIL_FROM: 'MRWD <notifications@example.invalid>',
  APP_BASE_URL: 'https://mrwd.example.invalid',
}

test('provider readiness reports only missing variable names', () => {
  assert.deepEqual(externalProviderReadiness({}), {
    email: { configured: false, missing: ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM'] },
    sms: { configured: false, missing: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER'] },
  })
  assert.equal(externalProviderReadiness(emailEnvironment).email.configured, true)
})

test('Philippine mobile numbers are normalized before SMS delivery', () => {
  assert.equal(normalizeSmsDestination('0917 123 4567'), '+639171234567')
  assert.equal(normalizeSmsDestination('917-123-4567'), '+639171234567')
  assert.equal(normalizeSmsDestination('+14155552671'), '+14155552671')
  assert.equal(normalizeSmsDestination('not-a-number'), null)
})

test('email delivery uses an idempotency key and includes the complaint link', async () => {
  let request
  const providerId = await sendExternalNotification(
    { id: 'delivery-1', channel: 'email', destination: 'customer@example.invalid' },
    { title: 'Task assigned', message: 'A crew was assigned.', related_complaint_id: 'complaint/1' },
    {
      environment: emailEnvironment,
      fetchImpl: async (url, options) => {
        request = { url, options }
        return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 })
      },
    },
  )

  assert.equal(providerId, 'email-1')
  assert.equal(request.url, 'https://api.resend.com/emails')
  assert.equal(request.options.headers['Idempotency-Key'], 'mrwd_notification_delivery-1')
  const body = JSON.parse(request.options.body)
  assert.deepEqual(body.to, ['customer@example.invalid'])
  assert.match(body.text, /complaints\/complaint%2F1/)
})

test('SMS delivery uses the configured Twilio messaging service', async () => {
  let request
  const providerId = await sendExternalNotification(
    { id: 'delivery-2', channel: 'sms', destination: '0917 123 4567' },
    { title: 'Task update', message: 'The crew is en route.' },
    {
      environment: {
        TWILIO_ACCOUNT_SID: 'AC-test',
        TWILIO_AUTH_TOKEN: 'token-test',
        TWILIO_MESSAGING_SERVICE_SID: 'MG-test',
      },
      fetchImpl: async (url, options) => {
        request = { url, options }
        return new Response(JSON.stringify({ sid: 'SM-test' }), { status: 201 })
      },
    },
  )

  assert.equal(providerId, 'SM-test')
  assert.match(request.url, /AC-test\/Messages\.json$/)
  assert.equal(request.options.body.get('To'), '+639171234567')
  assert.equal(request.options.body.get('MessagingServiceSid'), 'MG-test')
})

function workerClient(deliveries, notifications, { updateError = null } = {}) {
  const updates = []
  return {
    updates,
    async rpc(name, parameters) {
      assert.equal(name, 'claim_notification_deliveries')
      assert.deepEqual(parameters.p_channels, ['email'])
      return { data: deliveries, error: null }
    },
    from(table) {
      if (table === 'notifications') {
        return { select: () => ({ in: async () => ({ data: notifications, error: null }) }) }
      }
      return {
        update(patch) {
          return {
            eq(field, id) {
              return {
                async eq(statusField, status) {
                  updates.push({ patch, field, id, statusField, status })
                  return { error: updateError }
                },
              }
            },
          }
        },
      }
    },
  }
}

test('worker claims a queued email and records the provider receipt', async () => {
  const delivery = { id: 'delivery-3', notification_id: 'notice-1', channel: 'email', destination: 'customer@example.invalid', attempt_count: 1 }
  const client = workerClient([delivery], [{ id: 'notice-1', title: 'Update', message: 'Ready', related_complaint_id: null }])
  const result = await runExternalNotificationBatch(client, {
    environment: emailEnvironment,
    fetchImpl: async () => new Response(JSON.stringify({ id: 'email-3' }), { status: 200 }),
  })

  assert.equal(result.claimed, 1)
  assert.equal(result.sent, 1)
  assert.equal(client.updates[0].patch.status, 'sent')
  assert.equal(client.updates[0].patch.provider_message_id, 'email-3')
})

test('worker schedules bounded retries after a provider rejection', async () => {
  const delivery = { id: 'delivery-4', notification_id: 'notice-2', channel: 'email', destination: 'customer@example.invalid', attempt_count: 3 }
  const client = workerClient([delivery], [{ id: 'notice-2', title: 'Update', message: 'Ready', related_complaint_id: null }])
  const result = await runExternalNotificationBatch(client, {
    environment: emailEnvironment,
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Temporary rejection' }), { status: 503 }),
  })

  assert.equal(result.failed, 1)
  assert.equal(client.updates[0].patch.status, 'failed')
  assert.equal(client.updates[0].patch.next_attempt_at, null)
  assert.match(client.updates[0].patch.last_error, /HTTP 503/)
})

test('worker does not retry automatically when provider acceptance cannot be recorded', async () => {
  const delivery = { id: 'delivery-5', notification_id: 'notice-3', channel: 'email', destination: 'customer@example.invalid', attempt_count: 1 }
  const client = workerClient(
    [delivery],
    [{ id: 'notice-3', title: 'Update', message: 'Ready', related_complaint_id: null }],
    { updateError: new Error('database unavailable') },
  )
  const result = await runExternalNotificationBatch(client, {
    environment: emailEnvironment,
    fetchImpl: async () => new Response(JSON.stringify({ id: 'email-5' }), { status: 200 }),
  })

  assert.equal(result.recording_failed, 1)
  assert.equal(result.failed, 0)
  assert.equal(client.updates.length, 1)
  assert.equal(client.updates[0].patch.status, 'sent')
})
