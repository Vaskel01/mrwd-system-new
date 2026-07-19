import express from 'express'
import cors from 'cors'

import authRoutes from './src/routes/auth.js'
import complaintsRoutes from './src/routes/complaints.js'
import billingRoutes from './src/routes/billing.js'
import announcementsRoutes from './src/routes/announcements.js'
import usersRoutes from './src/routes/users.js'

const app = express()

// In production (Vercel) the frontend and this API are served from the
// same domain, so CORS doesn't come into play there — this only matters
// for local dev, where the Vite dev server (5173) calls this API (4000)
// from a different origin.
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.use('/api/auth', authRoutes)
app.use('/api/complaints', complaintsRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/announcements', announcementsRoutes)
app.use('/api/users', usersRoutes)

// Centralized error handler — catches anything a route forgot to try/catch
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
})

export default app
