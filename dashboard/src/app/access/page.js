"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/useAuth"

export default function AccessPage() {
  const { user, loading, refresh, logout } = useAuth()
  const router = useRouter()
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user?.authorized) router.replace('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user || user.authorized) return
    fetch('/api/access/request')
      .then(async (res) => res.ok ? res.json() : Promise.reject(new Error('Falha a verificar acesso')))
      .then(setStatus)
      .catch(() => setMessage('Não foi possível confirmar o pedido.'))
  }, [user])

  async function requestAccess() {
    setSubmitting(true)
    setMessage("")
    try {
      const res = await fetch('/api/access/request', { method: 'POST' })
      if (!res.ok) throw new Error('Falha a enviar pedido')
      setStatus(await res.json())
      setMessage('Pedido enviado. A staff responsável terá de aprovar o teu Discord ID.')
    } catch {
      setMessage('Não foi possível enviar o pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user || user.authorized) return <div className="min-h-screen bg-black text-white p-8">A verificar acesso...</div>

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-5">
      <section className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Viseu RP Logs</p>
          <h1 className="text-2xl font-semibold mt-2">Acesso sujeito a aprovação</h1>
          <p className="text-zinc-400 mt-2">O login Discord não concede acesso aos logs. Apenas a staff aprovada pode consultar os registos.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <p className="text-zinc-300">{user.username}</p>
          <p className="text-sm text-zinc-500">Discord ID</p>
          <p className="font-mono text-sm select-all break-all">{user.discordId}</p>
          <p className="text-sm text-amber-400">{status?.pending ? 'Pedido pendente de aprovação' : 'Ainda sem autorização'}</p>
        </div>
        {message && <p className="text-sm text-zinc-300">{message}</p>}
        <button onClick={requestAccess} disabled={submitting || status?.pending} className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold disabled:opacity-50">
          {status?.pending ? 'Pedido já enviado' : submitting ? 'A enviar...' : 'Pedir acesso à staff'}
        </button>
        <button onClick={() => refresh()} className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm">Verificar aprovação</button>
        <button onClick={logout} className="w-full text-zinc-500 text-sm underline">Sair da conta Discord</button>
      </section>
    </main>
  )
}
