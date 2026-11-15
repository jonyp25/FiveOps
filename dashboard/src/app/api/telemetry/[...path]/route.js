import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { fetchPrivateBackend, requireServerAccess } from '@/lib/telemetry'
import { getUserServers } from '@/lib/auth'

const allowed = new Set(['search','stats','stats/weapons','stats/vehicles','meta/terms'])

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { path } = await params
    const name = path.join('/')
    if (!allowed.has(name)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const searchParams = new URL(request.url).searchParams
    // Every telemetry path, including metadata, requires approved server access.
    const requested = searchParams.get('server_id') ||
      (name === 'meta/terms' ? (await getUserServers(user.id))[0]?.identifier : null)
    const server = await requireServerAccess(user, requested)
    if (!server) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    searchParams.set('server_id', server.identifier)

    const data = await fetchPrivateBackend('/' + name, searchParams)
    return NextResponse.json(data)
  } catch (error) {
    console.error('Private telemetry request failed:', error.message)
    return NextResponse.json({ error: 'Upstream service unavailable' }, { status: 503 })
  }
}
