const express = require('express');
const mysql = require('mysql2/promise');

const router = express.Router();
let pool;

function getPool() {
  if (!pool) {
    const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
    for (const key of required) {
      if (!process.env[key]) throw new Error(`Missing backend database setting: ${key}`);
    }
    if (process.env.MYSQL_DATABASE !== 'fivem_logs') {
      throw new Error('FiveOps bridge only supports the dedicated fivem_logs database');
    }
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3309),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: 'fivem_logs',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 10,
      multipleStatements: false
    });
  }
  return pool;
}

// Only parameterized DML, never schema changes or multistatements.
// Use a restricted database account with access ONLY to fivem_logs.
router.post('/internal/query', async (req, res) => {
  const { sql, params = [] } = req.body || {};
  if (typeof sql !== 'string' || !Array.isArray(params) || params.length > 200 ||
      sql.length > 16000 || !/^(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql.trim()) ||
      /;|--|\/\*|\*\/|#|\b(?:SLEEP|BENCHMARK|LOAD_FILE|INFORMATION_SCHEMA|PERFORMANCE_SCHEMA|INTO\s+(?:OUTFILE|DUMPFILE))\b/i.test(sql)) {
    return res.status(400).json({ error: 'Unsupported database query' });
  }

  try {
    const [rows] = await getPool().execute(sql, params);
    return res.json({ rows });
  } catch (error) {
    console.error('[FiveOps bridge] Database request failed:', error.code || error.message);
    return res.status(500).json({ error: 'Database operation failed' });
  }
});

module.exports = router;
