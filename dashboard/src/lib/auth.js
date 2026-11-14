import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { query, queryOne } from './db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || ''
)

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001/api/auth/callback')

// Generate Discord OAuth URL
export function getDiscordAuthUrl(state) {
  if (!DISCORD_CLIENT_ID || !DISCORD_REDIRECT_URI || !state) {
    throw new Error('Discord OAuth configuration incomplete')
  }
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email guilds guilds.members.read',
    state
  })
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

// Exchange code for tokens
export async function exchangeCodeForToken(code) {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: DISCORD_REDIRECT_URI
    })
  })
  
  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }
  
  return response.json()
}

// Get Discord user info
export async function getDiscordUser(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  
  if (!response.ok) {
    throw new Error('Failed to get Discord user')
  }
  
  return response.json()
}

// Get user's guilds (servers)
export async function getDiscordGuilds(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  
  if (!response.ok) {
    throw new Error('Failed to get Discord guilds')
  }
  
  return response.json()
}

// Get user's roles in a specific guild
export async function getGuildMember(accessToken, guildId) {
  const response = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })
  
  if (!response.ok) {
    return null // User not in guild or no access
  }
  
  return response.json()
}

// Create or update user in database
export async function upsertUser(discordUser) {
  const existing = await queryOne(
    'SELECT * FROM users WHERE discord_id = ?',
    [discordUser.id]
  )
  
  if (existing) {
    await query(
      `UPDATE users SET 
        discord_username = ?, 
        discord_avatar = ?, 
        discord_email = ?,
        last_login = NOW()
      WHERE discord_id = ?`,
      [
        discordUser.username,
        discordUser.avatar,
        discordUser.email || null,
        discordUser.id
      ]
    )
    return { ...existing, discord_username: discordUser.username }
  }
  
  const result = await query(
    `INSERT INTO users (discord_id, discord_username, discord_avatar, discord_email, last_login)
     VALUES (?, ?, ?, ?, NOW())`,
    [
      discordUser.id,
      discordUser.username,
      discordUser.avatar,
      discordUser.email || null
    ]
  )
  
  return {
    id: result.insertId,
    discord_id: discordUser.id,
    discord_username: discordUser.username,
    discord_avatar: discordUser.avatar
  }
}

// Create JWT token
export async function createToken(user) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters')
  }
  const token = await new SignJWT({
    userId: user.id,
    discordId: user.discord_id,
    username: user.discord_username
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)
  
  return token
}

// Create / update session with Discord tokens
export async function upsertSession({ userId, token, discordAccessToken, discordRefreshToken, discordExpiresIn }) {
  const expiresSeconds = 60 * 60 * 24 * 7 // 7 days for auth token
  const accessSeconds = discordExpiresIn || 3600
  await query(
    `INSERT INTO sessions (user_id, token, expires_at, discord_access_token, discord_refresh_token, discord_expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
     ON DUPLICATE KEY UPDATE 
       user_id = VALUES(user_id),
       expires_at = VALUES(expires_at),
       discord_access_token = VALUES(discord_access_token),
       discord_refresh_token = VALUES(discord_refresh_token),
       discord_expires_at = VALUES(discord_expires_at)`,
    [userId, token, expiresSeconds, discordAccessToken || null, discordRefreshToken || null, accessSeconds]
  )
}

export async function getSessionByToken(token) {
  return queryOne(
    `SELECT * FROM sessions WHERE token = ?`,
    [token]
  )
}

export async function refreshDiscordToken(refreshToken) {
  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  })

  if (!response.ok) {
    throw new Error('Failed to refresh Discord token')
  }

  return response.json()
}

// Verify JWT token
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload
  } catch {
    return null
  }
}

// Explicit owner bootstrap is controlled through a private Vercel environment
// variable. Never grant access because someone merely belongs to the Discord.
export function isOwnerDiscordId(discordId) {
  const ids = (process.env.FIVEOPS_OWNER_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.includes(String(discordId || ''))
}

export async function getStaffAccessForDiscord(discordId) {
  if (isOwnerDiscordId(discordId)) {
    return { authorized: true, isAdmin: true, isOwner: true, role: 'admin' }
  }
  const grants = await query(
    'SELECT sa.permission_level FROM server_admins sa INNER JOIN servers s ON s.id = sa.server_id WHERE sa.discord_id = ? AND s.is_active = TRUE',
    [String(discordId || '')]
  )
  const role = ['admin', 'moderator', 'viewer'].find((level) =>
    grants.some((grant) => grant.permission_level === level)
  ) || null
  return { authorized: Boolean(role), isAdmin: role === 'admin', isOwner: false, role }
}

// Authentication checks the signed JWT and server-side session but does not
// imply authorization to view personal log data. Pending members use this
// helper only on the auth/me and access-request endpoints.
export async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) return null

  const payload = await verifyToken(token)
  if (!payload) return null

  const session = await getSessionByToken(token)
  if (!session || new Date(session.expires_at) <= new Date()) return null

  return queryOne('SELECT * FROM users WHERE id = ?', [payload.userId])
}

// All existing data/admin APIs use getCurrentUser. This deliberately returns
// null for pending, unapproved and revoked accounts: fail closed by default.
export async function getCurrentUser() {
  const user = await getAuthenticatedUser()
  if (!user) return null
  const grant = await getStaffAccessForDiscord(user.discord_id)
  if (!grant.authorized) return null
  return {
    ...user,
    is_admin: grant.isAdmin,
    is_owner: grant.isOwner,
    staff_role: grant.role
  }
}

// The old user_server_access records are *requests only*, never access grants.
export async function getUserServers(userId) {
  const user = await queryOne('SELECT id, discord_id FROM users WHERE id = ?', [userId])
  if (!user) return []
  if (isOwnerDiscordId(user.discord_id)) {
    return query('SELECT id, name, identifier FROM servers WHERE is_active = TRUE ORDER BY created_at DESC')
  }
  return query(
    'SELECT s.id, s.name, s.identifier FROM servers s INNER JOIN server_admins sa ON sa.server_id = s.id WHERE sa.discord_id = ? AND s.is_active = TRUE ORDER BY s.created_at DESC',
    [user.discord_id]
  )
}

export async function canAccessChannel(userId, channelId) {
  const user = await queryOne('SELECT discord_id FROM users WHERE id = ?', [userId])
  if (!user) return false
  const row = await queryOne(
    'SELECT s.id FROM log_channels lc INNER JOIN servers s ON s.id = lc.server_id WHERE lc.id = ? AND s.is_active = TRUE LIMIT 1',
    [channelId]
  )
  if (!row) return false
  if (isOwnerDiscordId(user.discord_id)) return true
  const grant = await queryOne(
    'SELECT 1 FROM server_admins WHERE server_id = ? AND discord_id = ? LIMIT 1',
    [row.id, user.discord_id]
  )
  return Boolean(grant)
}
