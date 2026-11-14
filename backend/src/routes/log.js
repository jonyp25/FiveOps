const crypto = require('node:crypto');
const express = require('express');
const client = require('../elastic/client');

const router = express.Router();
const INDEX_NAME = process.env.ELASTICSEARCH_INDEX || 'fivem-logs';

router.post('/log', async (req, res) => {
  // Fail closed if a shared ingest key has not been configured on the server.
  const expectedKey = process.env.FIVEOPS_INGEST_KEY;
  if (!expectedKey || expectedKey.length < 32) {
    return res.status(503).json({ error: 'Log ingestion is not configured' });
  }

  const providedKey = req.get('X-FiveOps-Key') || '';
  const a = Buffer.from(providedKey);
  const b = Buffer.from(expectedKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const logEntry = req.body;

    // Normalize event_type from common variants
    const normalizedEventType =
      logEntry.event_type ||
      logEntry.eventType ||
      logEntry.type ||
      logEntry.event ||
      (logEntry.payload && (logEntry.payload.event_type || logEntry.payload.eventType));

    if (!normalizedEventType) {
      return res.status(400).json({ error: 'Missing event_type' });
    }

    // Ensure canonical field is set
    logEntry.event_type = normalizedEventType;

    // Ensure @timestamp exists
    if (!logEntry['@timestamp']) {
      logEntry['@timestamp'] = new Date().toISOString();
    }

    // Index the document
    const response = await client.index({
      index: INDEX_NAME,
      document: logEntry
    });

    res.status(201).json({
      ok: true,
      id: response._id
    });

  } catch (error) {
    console.error('Error indexing log:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

module.exports = router;
