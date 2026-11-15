import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getDiscordAuthUrl } from '@/lib/auth'

export async function GET() {
  const state = randomBytes(32).toString('hex')
  const response = NextResponse.redirect(getDiscordAuthUrl(state))
  response.cookies.set('discord_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600
  })
  return response
}
