import app from '../server/app.js'

// Every route in server/app.js is mounted under /api/... (e.g.
// app.use('/api/auth', ...)). Depending on exactly how Vercel invokes
// a filesystem-routed catch-all function, req.url may arrive either
// as the full original path ('/api/auth/login') or with the /api
// prefix already stripped ('/auth/login'). Rather than depend on
// which one this Vercel project version actually does, normalize it
// here so the Express app always sees the /api-prefixed path it
// expects either way.
export default function handler(req, res) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url
  }
  return app(req, res)
}
