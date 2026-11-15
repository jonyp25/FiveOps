require('dotenv').config();
const express = require('express');
const bootstrap = require('./elastic/bootstrap');
const logRoutes = require('./routes/log');
const searchRoutes = require('./routes/search');
const metaRoutes = require('./routes/meta');
const statsRoutes = require('./routes/stats');
const internalRoutes = require('./routes/internal');
const crypto = require('node:crypto');

const app = express();
const PORT = process.env.PORT || 3050;
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
app.use(express.json());

// All backend reads and internal database operations require the bridge secret.
// Keep Elasticsearch and MariaDB private; only HTTPS requests from the
// server-side Vercel application may pass through a tunnel.
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/log') return next();
  const expected = process.env.FIVEOPS_BRIDGE_KEY || '';
  if (expected.length < 32) {
    return res.status(503).json({ error: 'Backend bridge is not configured' });
  }
  const supplied = req.get('X-FiveOps-Bridge-Key') || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Routes
app.use('/', logRoutes);
app.use('/', searchRoutes);
app.use('/', metaRoutes);
app.use('/', statsRoutes);
app.use('/', internalRoutes);

app.get("/health", (req, res) => {
  res.json({ message: "Server is running", status: "active" });
});

// Start server
async function startServer() {
  await bootstrap();
  
  app.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
  });
}

startServer();
