require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const authRoutes       = require('./routes/auth');
const plansRoutes      = require('./routes/plans');
const dashboardRoutes  = require('./routes/dashboard');
const analysisRoutes   = require('./routes/analysis');
const allocationRoutes = require('./routes/allocation');
const operationsRoutes = require('./routes/operations');
const assetsRoutes     = require('./routes/assets');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ─────────────────────────────────────────────── */
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());

/* ── Health ─────────────────────────────────────────────────── */
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ── Routes ─────────────────────────────────────────────────── */
app.use('/auth',       authRoutes);
app.use('/plans',      plansRoutes);
app.use('/dashboard',  dashboardRoutes);
app.use('/analysis',   analysisRoutes);
app.use('/allocation', allocationRoutes);
app.use('/operations', operationsRoutes);
app.use('/assets',     assetsRoutes);

/* ── 404 ────────────────────────────────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

/* ── Error handler ──────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
