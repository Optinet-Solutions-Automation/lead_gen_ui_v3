import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

/**
 * POST /api/webhook/status
 * Called by n8n with the workflow result.
 *
 * Success: { "status": "Success", "message": "Successful Scraping" }
 * Error:   { "status": "error", "message": "...", "failed_node": "...", "timestamp": "..." }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Store result under a fixed key with a 10-minute TTL
  await redis.set('workflow_status', req.body, { ex: 600 })

  return res.status(200).json({ received: true })
}
