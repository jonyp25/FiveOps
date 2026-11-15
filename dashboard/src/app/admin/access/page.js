"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/useAuth"

const roles = [
  { value: 'admin', label: 'Fundador / Desenvolvedor — acesso total' },
  { value: 'moderator', label: 'Administração — gestão operacional' },
  { value: 'viewer', label: 'Moderação — consulta de logs' }
]
const roleLabel = (role) => roles.find(item => item.value === role)?.label || role

export default function StaffAccessPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState([])
  const [staff, setStaff] = useState([])
  const [discordId, setDiscordId] = useState('')
  const [permissionLevel, setPermissionLevel] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    else if (!loading && !user?.isAdmin) router.replace('/access')
    else if (user?.isAdmin) load()
  }, [user, loading, router])

  async function load() {
    const res = await fetch('/api/admin/access', { cache: 'no-store' })
    if (!res.ok) { setMessage('Não foi possível carregar os acessos.'); return }
    const data = await res.json()
    setPending(data.pending || [])
    setStaff(data.staff || [])
  }

  async function grant(id, role) {
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: id.trim(), permissionLevel: role })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro na atribuição')
      setDiscordId('')
      setMessage('Acesso atualizado com sucesso.')
      await load()
    } catch (error) {
      setMessage(error.message)
    } finally { setBusy(false) }
  }

  async function revoke(id) {
    if (!window.confirm('Revogar acesso deste membro?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/access', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: id })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Erro ao revogar')
      setMessage('Acesso revogado.')
      await load()
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  if (loading || !user?.isAdmin) return <main className="bg-black text-white min-h-screen p-6">A verificar permissões...</main>

  return (
    <main className="min-h-screen bg-black text-white p-4 sm:p-8">
      <section className="max-w-3xl mx-auto space-y-6">
        <Link href="/admin" className="text-zinc-400 underline text-sm">Voltar à administração</Link>
        <div>
          <h1 className="text-2xl font-semibold">Gestão de acessos · Viseu RP</h1>
          <p className="text-zinc-400 mt-2">Apenas IDs Discord aprovados podem consultar os logs. O acesso pode ser atribuído antes do primeiro login.</p>
        </div>
        {message && <p className="rounded-xl border border-zinc-700 p-3 text-sm">{message}</p>}
        <form className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); grant(discordId, permissionLevel) }}>
          <h2 className="font-semibold">Autorizar manualmente</h2>
          <label className="block text-sm text-zinc-400" htmlFor="discord-id">ID Discord do membro</label>
          <input id="discord-id" required pattern="[0-9]{16,22}" inputMode="numeric" value={discordId} onChange={(e) => setDiscordId(e.target.value)} placeholder="123456789012345678" className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-3 font-mono" />
          <label className="block text-sm text-zinc-400" htmlFor="staff-role">Cargo / permissão</label>
          <select id="staff-role" value={permissionLevel} onChange={(e) => setPermissionLevel(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3">
            {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button disabled={busy} className="w-full bg-white text-black font-semibold rounded-lg p-3 disabled:opacity-50">Guardar autorização</button>
        </form>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pedidos pendentes ({pending.length})</h2>
          {pending.length === 0 && <p className="text-zinc-500 text-sm">Sem pedidos pendentes.</p>}
          {pending.map(p => (
            <div key={p.discord_id} className="border border-zinc-800 rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
              <div><div className="font-medium">{p.discord_username}</div><div className="font-mono text-xs text-zinc-400">{p.discord_id}</div></div>
              <button disabled={busy} onClick={() => grant(p.discord_id, permissionLevel)} className="rounded-lg border border-zinc-600 px-4 py-2 text-sm">Aprovar como {permissionLevel === 'admin' ? 'acesso total' : permissionLevel === 'moderator' ? 'administração' : 'moderação'}</button>
            </div>
          ))}
        </section>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Membros autorizados ({staff.length})</h2>
          {staff.map(p => (
            <div key={p.discord_id} className="border border-zinc-800 rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
              <div><div className="font-medium">{p.discord_username || 'Membro ainda sem login'}</div><div className="font-mono text-xs text-zinc-400 break-all">{p.discord_id}</div><div className="text-xs text-zinc-500 mt-1">{roleLabel(p.permission_level)}</div></div>
              <button disabled={busy} onClick={() => revoke(p.discord_id)} className="text-red-400 border border-red-900 rounded-lg px-4 py-2 text-sm">Revogar</button>
            </div>
          ))}
        </section>
      </section>
    </main>
  )
}
