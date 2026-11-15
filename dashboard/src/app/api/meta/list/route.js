import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { fetchPrivateBackend } from '@/lib/telemetry'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { categories, eventTypes } = await fetchPrivateBackend('/meta/terms')
    return NextResponse.json({ categories, eventTypes })
  } catch (error) {
    console.error('Metadata listing unavailable:', error.message)
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 503 })
  }
}
