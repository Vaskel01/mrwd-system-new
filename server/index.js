import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import authRoutes from './src/routes/auth.js'
import complaintsRoutes from './src/routes/complaints.js'
import billingRoutes from './src/routes/billing.js'
import announcementsRoutes from './src/routes/announcements.js'
import usersRoutes from './src/routes/users.js'

const app = express()
const PORT = process.env.PORT || 4000

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

app.listen(PORT, () => {
  console.log(`MRWD CMS API listening on http://localhost:${PORT}`)
})
