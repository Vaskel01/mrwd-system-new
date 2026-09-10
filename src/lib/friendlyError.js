const PATTERNS = [
  [/complaints_description_min_length|description.{0,40}(minimum|min(?:imum)? length)/i,
    'Please provide at least 20 characters so MRWD can understand the issue.'],
  [/failed to fetch|network ?error|load failed/i,
    "Can't reach the server right now. Check your internet connection and try again."],
  [/missing authorization|invalid or expired session/i,
    'Your session has expired. Please sign in again.'],
  [/incorrect email or password/i,
    "That email or password isn't right. Double-check and try again."],
  [/no profile found/i,
    "This account isn't fully set up yet. Contact the district office."],
  [/password must be at least/i,
    'Use at least 8 characters with at least one letter and one number.'],
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

const TECHNICAL_ERROR_PATTERN = /violates?\s+(?:check\s+)?constraint|new row for relation|duplicate key value|null value in column|value too long for type|invalid input syntax|syntax error at or near|(?:operator|function) .+ does not exist|(?:relation|column) ["'][^"']+["'] does not exist|permission denied for (?:table|schema|function)|deadlock detected|could not serialize access|internal database|database (?:error|failure)|postgres(?:ql)?|\b(?:detail|context):|sqlstate|postgrest|pgrst\d+|schema cache|at .+\([^)]*:\d+:\d+\)/i

// Known failures are translated to specific guidance. Unexpected database,
// PostgREST, SQL, and stack-trace text is replaced with a safe fallback so
// implementation details never reach the interface.
export function friendlyError(message) {
  if (!message) return 'Something went wrong. Please try again.'
  const text = String(message).trim()
  for (const [pattern, friendly] of PATTERNS) {
    if (pattern.test(text)) return friendly
  }
  if (TECHNICAL_ERROR_PATTERN.test(text)) {
    return "Something went wrong while processing your request. Your entries have been kept; please try again or contact MRWD if the problem continues."
  }
  return text
}
