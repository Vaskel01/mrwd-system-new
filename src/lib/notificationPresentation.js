// Informational status messages can contain words like "review" or "assigned".
// Do not infer a required response from free-text wording.
const ACTION_TYPES = new Set(['assignment', 'warning', 'feedback'])

export function needsAction(item) {
  return Boolean(item.related_complaint_id && ACTION_TYPES.has(item.notification_type))
}

export function actionLabel(item) {
  if (item.notification_type === 'assignment') return 'Review assignment →'
  if (item.notification_type === 'feedback') return 'Review feedback →'
  if (item.notification_type === 'warning') return 'Review issue →'
  if (item.notification_type === 'completed') return 'Review resolution →'
  return 'Open complaint →'
}
