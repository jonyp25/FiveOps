import { queryOne } from '@/lib/db'
import { isOwnerDiscordId } from '@/lib/auth'

// This helper runs ONLY in Next.js server routes. Never expose bridge credentials
// or the upstream URL via NEXT_PUBLIC_ environment variables.
export async function fetchPrivateBackend(path, searchParams = new URLSearchParams()) {
  const base = process.env.FIVEOPS_BACKEND_URL
  const key = process.env.FIVEOPS_BRIDGE_KEY
  if (!base?.startsWith('https://') || !key || key.length < 32) {
    throw new Error('Secure FiveOps backend connection is not configured')
  }
  const url = new URL(path, base)
  url.search = searchParams.toString()
  const response = await fetch(url, {
    headers: { 'X-FiveOps-Bridge-Key': key },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000)
  })
  if (!response.ok) {
    throw new Error(`Backend request failed (${response.status})`)
  }
  return response.json()
}

export async function requireServerAccess(user, serverIdentifier) {
  if (!user || !serverIdentifier) return null
  const server = await queryOne(
    'SELECT id, identifier FROM servers WHERE is_active = TRUE AND (identifier = ? OR id = ?) LIMIT 1',
    [serverIdentifier, serverIdentifier]
  )
  if (!server) return null
  if (isOwnerDiscordId(user.discord_id)) return server

  const approved = await queryOne(
    'SELECT 1 FROM server_admins WHERE server_id = ? AND discord_id = ? LIMIT 1',
    [server.id, user.discord_id]
  )
  return approved ? server : null
}
