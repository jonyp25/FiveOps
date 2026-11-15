import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserServers, getStaffAccessForDiscord } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ user: null }, { status: 401 })
    const staff = await getStaffAccessForDiscord(user.discord_id)
    const servers = staff.authorized ? await getUserServers(user.id) : []
    return NextResponse.json({
      user: {
        id: user.id,
        discordId: user.discord_id,
        username: user.discord_username,
        avatar: user.discord_avatar,
        isAdmin: staff.isAdmin,
        authorized: staff.authorized,
        staffRole: staff.role
      },
      servers: servers.map(({ id, name, identifier }) => ({ id, name, identifier }))
    })
  } catch (error) {
    console.error('Get current user failed:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
