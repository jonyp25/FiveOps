import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { requireServerAccess } from '@/lib/telemetry'
import { queryOne } from '@/lib/db'

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { serverId } = await params
    const server = await requireServerAccess(user, serverId)
    if (!server) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const row = user.is_owner ? { permission_level: 'admin' } : await queryOne(
      'SELECT permission_level FROM server_admins WHERE server_id = ? AND discord_id = ? LIMIT 1',
      [server.id, user.discord_id]
    )
    if (!row) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const isAdmin = row.permission_level === 'admin'
    const isModerator = row.permission_level === 'moderator'
    return NextResponse.json({
      isGlobalAdmin: Boolean(user.is_owner),
      isServerAdmin: true,
      canManageChannels: isAdmin || isModerator,
      canManageUsers: isAdmin,
      canViewLogs: true,
      permissionLevel: row.permission_level
    })
  } catch (error) {
    console.error('Permissions lookup failed:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
