import { Redis } from '@upstash/redis'

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

/**
 * GET  /api/status  — polled by the frontend; returns { status: 'pending' } until n8n calls back
 * DELETE /api/status — clears any stale result before a new submission
 */
export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    await redis.del('workflow_status')
    return res.status(200).json({ cleared: true })
  }

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
