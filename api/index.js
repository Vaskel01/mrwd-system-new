import app from '../server/app.js'

// Reached via the /api/(.*) -> /api rewrite in vercel.json, which
// preserves the original request path (e.g. '/api/auth/login') in
// req.url rather than rewriting it to just '/api'. The guard below is
// just a safety net in case that assumption is ever wrong.
export default function handler(req, res) {
  console.log(`[api] ${req.method} ${req.url}`)
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url
  }
  return app(req, res)
}
