import express from 'express'
import cors from 'cors'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Active SSE clients
const clients = new Set()

/**
 * GET /events
 * React frontend connects here to receive real-time status updates via SSE.
 */
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Keep-alive ping every 30s
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30000)

  clients.add(res)

  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
})

/**
 * POST /webhook/status
 * n8n calls this endpoint with the workflow result.
 * Expected bodies:
 *   Success: { "status": "Success", "message": "Successful Scraping" }
 *   Error:   { "status": "error", "message": "...", "failed_node": "...", "timestamp": "..." }
 */
app.post('/webhook/status', (req, res) => {
  const payload = req.body
  console.log('[webhook/status] received:', payload)

  const event = `data: ${JSON.stringify(payload)}\n\n`
  clients.forEach((client) => client.write(event))

  res.json({ received: true })
})

app.listen(PORT, () => {
  console.log(`Webhook listener running on http://localhost:${PORT}`)
  console.log(`n8n callback URL → http://localhost:${PORT}/webhook/status`)
})
