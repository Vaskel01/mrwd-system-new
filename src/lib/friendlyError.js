const PATTERNS = [
  [/failed to fetch|network ?error|load failed/i,
    "Can't reach the server right now. Check your internet connection and try again."],
  [/missing authorization|invalid or expired session/i,
    'Your session has expired. Please sign in again.'],
  [/incorrect email or password/i,
    "That email or password isn't right. Double-check and try again."],
  [/no profile found/i,
    "This account isn't fully set up yet. Contact the district office."],
  [/password must be at least/i,
    'Password needs to be at least 6 characters.'],
  [/duplicate key value|already registered|user already exists/i,
    'That email is already in use.'],
  [/violates row-level security/i,
    "You don't have permission to do that."],
  [/violates foreign key/i,
    'That record no longer exists — try refreshing the page.'],
  [/could not find the table/i,
    'This part of the system isn\'t set up yet. Contact the developer.'],
  [/infinite recursion/i,
    'A system configuration error occurred. Contact the developer.'],
]

// Runs a raw error message through the table above. If nothing
// matches, falls back to the original message so nothing is ever
// silently swallowed — just returns it dressed with a period if needed.
export function friendlyError(message) {
  if (!message) return 'Something went wrong. Please try again.'
  for (const [pattern, friendly] of PATTERNS) {
    if (pattern.test(message)) return friendly
  }
  return message
}
