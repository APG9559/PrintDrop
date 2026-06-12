'use strict';

/**
 * src/app.js
 *
 * Express application factory.
 *
 * Wires up all middleware and routes but does NOT call app.listen().
 * Keeping the server binding in server.js makes this file cleanly testable:
 * tests can require('./src/app') without opening a port.
 */

const express = require('express');
const path = require('path');

const corsMiddleware = require('./middleware/cors');
const { uploadLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const uploadRoutes = require('./routes/upload.routes');
const adminRoutes = require('./routes/admin.routes');
const store = require('./services/store.service');

const app = express();

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── API routes ────────────────────────────────────────────────────────────────
// Rate-limit applies only to the upload endpoint
app.use('/api', uploadLimiter, uploadRoutes);
app.use('/api', adminRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime_seconds: Math.floor(process.uptime()),
        uploads_in_memory: store.uploads.length,
        server_started_at: store.startedAt,
    });
});

// ── Static frontend ───────────────────────────────────────────────────────────
// Must come AFTER all /api routes so API calls are never intercepted.
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA-style fallback: any non-API, non-file request returns index.html
app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
// Must be registered last — Express identifies error handlers by their
// 4-parameter (err, req, res, next) signature.
app.use(errorHandler);

module.exports = app;
