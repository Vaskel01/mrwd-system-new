export const PASSWORD_MIN_LENGTH = 8

export function passwordChecks(password = '') {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  }
}

export function isPasswordValid(password = '') {
  return Object.values(passwordChecks(password)).every(Boolean)
}

export function passwordStrength(password = '') {
  const checks = passwordChecks(password)
  const base = Object.values(checks).filter(Boolean).length
  const extras = [
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length
  const score = Math.min(4, Math.max(0, base - 1 + extras))
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  return { score, label: labels[score], checks }
}
