import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

/**
 * GET /api/status
 * Polled by the frontend to check if n8n has sent a callback yet.
 * Returns { status: 'pending' } if not yet received.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const data = await redis.get('workflow_status')

  if (!data) {
    return res.status(200).json({ status: 'pending' })
  }

  // Delete once retrieved so the next submission starts fresh
  await redis.del('workflow_status')

  return res.status(200).json(data)
}
