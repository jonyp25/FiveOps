import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getStaffAccessForDiscord } from '@/lib/auth'

// Staff access is approved manually by Discord ID, not synced from guild roles.
export async function POST() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const staff = await getStaffAccessForDiscord(user.discord_id)
    return NextResponse.json({ success: true, authorized: staff.authorized, role: staff.role })
  } catch (error) {
    console.error('Access refresh failed:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
