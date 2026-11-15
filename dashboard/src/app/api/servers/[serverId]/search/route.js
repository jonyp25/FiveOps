import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { requireServerAccess, fetchPrivateBackend } from '@/lib/telemetry'

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { serverId } = await params
    const server = await requireServerAccess(user, serverId)
    if (!server) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const qs = new URL(request.url).searchParams
    qs.set('server_id', server.identifier)
    const data = await fetchPrivateBackend('/search', qs)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Private server search failed:', error.message)
    return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 })
  }
}
