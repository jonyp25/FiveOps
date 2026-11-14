import { NextResponse } from 'next/server'
import { getCurrentUser, isOwnerDiscordId } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

async function adminAndServer() {
  const user = await getCurrentUser()
  if (!user || !user.is_admin) return null
  const server = await queryOne("SELECT id FROM servers WHERE identifier = 'VISEU RP' AND is_active = TRUE LIMIT 1")
  if (!server) return null
  return { user, serverId: server.id }
}

const validId = (id) => /^\d{16,22}$/.test(String(id || ''))

export async function GET() {
  try {
    const access = await adminAndServer()
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const [pending, staff] = await Promise.all([
      query(
        'SELECT u.discord_id, u.discord_username, usa.created_at FROM user_server_access usa INNER JOIN users u ON u.id = usa.user_id LEFT JOIN server_admins sa ON sa.server_id = usa.server_id AND sa.discord_id = u.discord_id WHERE usa.server_id = ? AND sa.discord_id IS NULL ORDER BY usa.created_at DESC LIMIT 100',
        [access.serverId]
      ),
      query(
        'SELECT sa.discord_id, sa.permission_level, u.discord_username FROM server_admins sa LEFT JOIN users u ON u.discord_id = sa.discord_id WHERE sa.server_id = ? ORDER BY sa.created_at DESC LIMIT 100',
        [access.serverId]
      )
    ])
    return NextResponse.json({ pending, staff })
  } catch (error) {
    console.error('Staff access list failed:', error.message)
    return NextResponse.json({ error: 'Unable to load staff access' }, { status: 503 })
  }
}

export async function POST(request) {
  try {
    const access = await adminAndServer()
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { discordId, permissionLevel } = await request.json()
    if (!validId(discordId) || !['admin', 'moderator', 'viewer'].includes(permissionLevel)) {
      return NextResponse.json({ error: 'Invalid Discord ID or permission' }, { status: 400 })
    }
    await query(
      'INSERT INTO server_admins (server_id, discord_id, permission_level) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE permission_level = VALUES(permission_level)',
      [access.serverId, discordId, permissionLevel]
    )
    await query(
      'DELETE FROM user_server_access WHERE server_id = ? AND user_id IN (SELECT id FROM users WHERE discord_id = ?)',
      [access.serverId, discordId]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Staff access grant failed:', error.message)
    return NextResponse.json({ error: 'Unable to grant access' }, { status: 503 })
  }
}

export async function DELETE(request) {
  try {
    const access = await adminAndServer()
    if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { discordId } = await request.json()
    if (!validId(discordId)) return NextResponse.json({ error: 'Invalid Discord ID' }, { status: 400 })
    if (isOwnerDiscordId(discordId)) {
      return NextResponse.json({ error: 'Root owner is managed through environment settings' }, { status: 403 })
    }
    if (String(discordId) === String(access.user.discord_id)) {
      return NextResponse.json({ error: 'Cannot revoke your own access' }, { status: 403 })
    }
    await query('DELETE FROM server_admins WHERE server_id = ? AND discord_id = ?', [access.serverId, discordId])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Staff access revoke failed:', error.message)
    return NextResponse.json({ error: 'Unable to revoke access' }, { status: 503 })
  }
}
