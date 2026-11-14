import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getStaffAccessForDiscord } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

async function getServer() {
  return queryOne("SELECT id, name FROM servers WHERE identifier = 'VISEU RP' AND is_active = TRUE LIMIT 1")
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const server = await getServer()
    if (!server) return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
    const grant = await getStaffAccessForDiscord(user.discord_id)
    const pending = await queryOne('SELECT 1 FROM user_server_access WHERE user_id = ? AND server_id = ? LIMIT 1', [user.id, server.id])
    return NextResponse.json({ authorized: grant.authorized, pending: Boolean(pending), server: server.name })
  } catch (error) {
    console.error('Access status failed:', error.message)
    return NextResponse.json({ error: 'Unable to check access' }, { status: 503 })
  }
}

export async function POST() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const server = await getServer()
    if (!server) return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
    const grant = await getStaffAccessForDiscord(user.discord_id)
    if (grant.authorized) return NextResponse.json({ authorized: true })
    await query(
      'INSERT INTO user_server_access (user_id, server_id, last_verified) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_verified = NOW()',
      [user.id, server.id]
    )
    return NextResponse.json({ pending: true })
  } catch (error) {
    console.error('Request access failed:', error.message)
    return NextResponse.json({ error: 'Unable to request access' }, { status: 503 })
  }
}
