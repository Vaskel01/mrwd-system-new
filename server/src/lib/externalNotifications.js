const MAX_PROVIDER_ERROR_LENGTH = 500

function text(value) {
  return String(value ?? '').trim()
}

function safeProviderError(value) {
  return text(value).replace(/\s+/g, ' ').slice(0, MAX_PROVIDER_ERROR_LENGTH) || 'Provider request failed.'
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function normalizeSmsDestination(value) {
  const raw = text(value).replace(/[\s()-]/g, '')
  if (/^09\d{9}$/.test(raw)) return `+63${raw.slice(1)}`
  if (/^9\d{9}$/.test(raw)) return `+63${raw}`
  if (/^\+\d{8,15}$/.test(raw)) return raw
  return null
}

export function externalProviderReadiness(environment = process.env) {
  const emailMissing = ['RESEND_API_KEY', 'NOTIFICATION_EMAIL_FROM']
    .filter(key => !text(environment[key]))
  const smsMissing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']
    .filter(key => !text(environment[key]))
  if (!text(environment.TWILIO_MESSAGING_SERVICE_SID) && !text(environment.TWILIO_FROM_NUMBER)) {
    smsMissing.push('TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER')
  }

  return {
    email: { configured: emailMissing.length === 0, missing: emailMissing },
    sms: { configured: smsMissing.length === 0, missing: smsMissing },
  }
}

function notificationUrl(notification, environment) {
  const base = text(environment.APP_BASE_URL).replace(/\/$/, '')
  return base && notification?.related_complaint_id
    ? `${base}/complaints/${encodeURIComponent(notification.related_complaint_id)}`
    : ''
}

async function providerJson(response, label) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${safeProviderError(payload.message || payload.error || payload.code)}`)
  }
  return payload
}

async function sendEmail(delivery, notification, environment, fetchImpl) {
  const link = notificationUrl(notification, environment)
  const title = text(notification.title) || 'MRWD notification'
  const message = text(notification.message)
  const plainText = [message, link].filter(Boolean).join('\n\n')
  const linkHtml = link
    ? `<p><a href="${escapeHtml(link)}">Open complaint in MRWD</a></p>`
    : ''
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${environment.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `mrwd_notification_${delivery.id}`,
    },
    body: JSON.stringify({
      from: environment.NOTIFICATION_EMAIL_FROM,
      to: [delivery.destination],
      subject: `[MRWD] ${title}`.slice(0, 200),
      text: plainText,
      html: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${linkHtml}`,
    }),
    signal: AbortSignal.timeout(10000),
  })
  const payload = await providerJson(response, 'Email provider')
  return text(payload.id) || null
}

async function sendSms(delivery, notification, environment, fetchImpl) {
  const destination = normalizeSmsDestination(delivery.destination)
  if (!destination) throw new Error('SMS destination is not a valid Philippine or E.164 phone number.')

  const link = notificationUrl(notification, environment)
  const body = [`MRWD: ${text(notification.title)}`, text(notification.message), link]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1500)
  const form = new URLSearchParams({ To: destination, Body: body })
  if (text(environment.TWILIO_MESSAGING_SERVICE_SID)) {
    form.set('MessagingServiceSid', environment.TWILIO_MESSAGING_SERVICE_SID)
  } else {
    form.set('From', environment.TWILIO_FROM_NUMBER)
  }

  const credentials = Buffer.from(`${environment.TWILIO_ACCOUNT_SID}:${environment.TWILIO_AUTH_TOKEN}`).toString('base64')
  const response = await fetchImpl(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(environment.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(10000),
    },
  )
  const payload = await providerJson(response, 'SMS provider')
  return text(payload.sid) || null
}

export async function sendExternalNotification(delivery, notification, {
  environment = process.env,
  fetchImpl = fetch,
} = {}) {
  const readiness = externalProviderReadiness(environment)
  if (!readiness[delivery.channel]?.configured) {
    throw new Error(`${delivery.channel === 'sms' ? 'SMS' : 'Email'} provider is not configured.`)
  }
  if (delivery.channel === 'email') return sendEmail(delivery, notification, environment, fetchImpl)
  if (delivery.channel === 'sms') return sendSms(delivery, notification, environment, fetchImpl)
  throw new Error('Unsupported notification delivery channel.')
}

function retryAt(attemptCount, now = new Date()) {
  if (attemptCount >= 3) return null
  const delayMinutes = attemptCount === 1 ? 5 : 30
  return new Date(now.getTime() + delayMinutes * 60000).toISOString()
}

export async function runExternalNotificationBatch(client, {
  environment = process.env,
  fetchImpl = fetch,
  limit = 25,
} = {}) {
  const readiness = externalProviderReadiness(environment)
  const channels = Object.entries(readiness)
    .filter(([, value]) => value.configured)
    .map(([channel]) => channel)
  if (!channels.length) return { claimed: 0, sent: 0, failed: 0, providers: readiness, results: [] }

  const { data: deliveries, error: claimError } = await client.rpc('claim_notification_deliveries', {
    p_limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
    p_channels: channels,
  })
  if (claimError) throw claimError
  if (!deliveries?.length) return { claimed: 0, sent: 0, failed: 0, providers: readiness, results: [] }

  const notificationIds = [...new Set(deliveries.map(item => item.notification_id))]
  const { data: notifications, error: notificationError } = await client
    .from('notifications')
    .select('id, title, message, related_complaint_id')
    .in('id', notificationIds)
  if (notificationError) throw notificationError
  const notificationMap = new Map((notifications || []).map(item => [item.id, item]))
  const results = []

  for (const delivery of deliveries) {
    const notification = notificationMap.get(delivery.notification_id)
    let providerMessageId

    try {
      if (!notification) throw new Error('The source notification no longer exists.')
      providerMessageId = await sendExternalNotification(delivery, notification, { environment, fetchImpl })
    } catch (error) {
      const message = safeProviderError(error?.message || error)
      const nextAttemptAt = retryAt(delivery.attempt_count)
      const { error: updateError } = await client.from('notification_deliveries').update({
        status: 'failed', last_error: message, next_attempt_at: nextAttemptAt,
      }).eq('id', delivery.id).eq('status', 'processing')
      results.push({
        id: delivery.id,
        channel: delivery.channel,
        status: 'failed',
        retry_scheduled: Boolean(nextAttemptAt),
        error: updateError ? 'Delivery and status recording failed.' : message,
      })
      continue
    }

    // The provider has accepted the message. If this state write fails, leave the
    // row in processing instead of scheduling an automatic retry that could send
    // a duplicate SMS. A System Supervisor can reconcile it manually.
    const { error: sentUpdateError } = await client.from('notification_deliveries').update({
      status: 'sent', provider_message_id: providerMessageId, last_error: null,
      next_attempt_at: null, sent_at: new Date().toISOString(),
    }).eq('id', delivery.id).eq('status', 'processing')
    if (sentUpdateError) {
      results.push({
        id: delivery.id,
        channel: delivery.channel,
        status: 'recording_failed',
        error: 'The provider accepted the message, but the delivery receipt could not be recorded.',
      })
    } else {
      results.push({ id: delivery.id, channel: delivery.channel, status: 'sent' })
    }
  }

  return {
    claimed: deliveries.length,
    sent: results.filter(item => item.status === 'sent').length,
    failed: results.filter(item => item.status === 'failed').length,
    recording_failed: results.filter(item => item.status === 'recording_failed').length,
    providers: readiness,
    results,
  }
}
