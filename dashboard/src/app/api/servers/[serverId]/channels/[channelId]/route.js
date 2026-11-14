import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { requireServerAccess } from '@/lib/telemetry'
import { query, queryOne } from '@/lib/db'

async function canManageChannel(user, serverId) {
  const server = await requireServerAccess(user, serverId)
  if (!server) return null
  if (user.is_owner) return server
  const grant = await queryOne(
    "SELECT 1 FROM server_admins WHERE server_id = ? AND discord_id = ? AND permission_level IN ('admin', 'moderator') LIMIT 1",
    [server.id, user.discord_id]
  )
  return grant ? server : null
}

export async function PUT(request, { params }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { serverId, channelId } = await params
    const server = await canManageChannel(user, serverId)
    if (!server) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await request.json()
    const { name, slug, description, eventTypes, color, icon, isActive } = body
    await query(
      'UPDATE log_channels SET name = COALESCE(?, name), slug = COALESCE(?, slug), description = COALESCE(?, description), event_types = COALESCE(?, event_types), color = COALESCE(?, color), icon = COALESCE(?, icon), is_active = COALESCE(?, is_active) WHERE id = ? AND server_id = ?',
      [name ?? null, slug ?? null, description ?? null, eventTypes ? JSON.stringify(eventTypes) : null, color ?? null, icon ?? null, isActive ?? null, channelId, server.id]
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update channel error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { serverId, channelId } = await params
    const server = await canManageChannel(user, serverId)
    if (!server) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await query('DELETE FROM log_channels WHERE id = ? AND server_id = ?', [channelId, server.id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete channel error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
