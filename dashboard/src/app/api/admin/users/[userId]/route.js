import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

// Get single user details
export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser()
    
    if (!user || !Boolean(user.is_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { userId } = await params
    
    const targetUser = await queryOne(
      `SELECT id, discord_id, discord_username, discord_avatar, discord_email, is_admin, last_login, created_at
       FROM users WHERE id = ?`,
      [userId]
    )
    
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    
    // A previous Discord guild entry is a pending request, not a grant.
    const serverAccess = await query(
      'SELECT sa.server_id, s.name AS server_name, s.identifier, sa.permission_level AS role FROM server_admins sa JOIN servers s ON s.id = sa.server_id WHERE sa.discord_id = ?',
      [targetUser.discord_id]
    )

    return NextResponse.json({ user: targetUser, serverAccess })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Global is_admin flags no longer grant privileges: use explicit staff access.
export async function PUT() {
  return NextResponse.json({ error: 'Use /admin/access to manage staff permissions' }, { status: 410 })
}

// Delete user
export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser()
    
    if (!user || !Boolean(user.is_admin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { userId } = await params
    
    // Don't allow self-deletion
    if (user.id === parseInt(userId)) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
    }
    
    await query(`DELETE FROM users WHERE id = ?`, [userId])
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Legacy user access action is intentionally disabled to avoid confusing
// pending request records with authorization grants.
export async function PATCH() {
  return NextResponse.json({ error: 'Use /admin/access to manage staff permissions' }, { status: 410 })
}
