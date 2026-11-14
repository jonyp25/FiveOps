// Database calls stay on the Next.js server. In Vercel, connect through
// an HTTPS tunnel to the VPS bridge, never to the public MariaDB TCP port.
import mysql from 'mysql2/promise'

let pool

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'fivem_logs',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    })
  }
  return pool
}

export async function query(sql, params = []) {
  const base = process.env.FIVEOPS_BACKEND_URL
  if (base) {
    const key = process.env.FIVEOPS_BRIDGE_KEY
    if (!key || key.length < 32 || !base.startsWith('https://')) {
      throw new Error('Secure backend bridge is not configured')
    }

    const response = await fetch(new URL('/internal/query', base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FiveOps-Bridge-Key': key
      },
      body: JSON.stringify({ sql, params }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12000)
    })
    if (!response.ok) {
      throw new Error(`FiveOps database bridge unavailable (${response.status})`)
    }
    const data = await response.json()
    return data.rows
  }

  if (process.env.VERCEL) {
    throw new Error('Vercel must use FIVEOPS_BACKEND_URL, not a direct MySQL connection')
  }

  const [rows] = await getPool().execute(sql, params)
  return rows
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params)
  return rows[0] || null
}
