'use strict';

/**
 * src/routes/admin.routes.js
 *
 * GET /api/admin/uploads
 *
 * Returns the in-memory upload log for the current server session.
 *
 * Security note: this endpoint has no authentication by design — it is
 * intended to be restricted at the network / reverse-proxy level (e.g. an
 * nginx `allow` rule that restricts access to the shop owner's IP).
 * Add an auth middleware here if a broader deployment is required.
 */

const express = require('express');
const store = require('../services/store.service');
const config = require('../config');

const router = express.Router();

router.get('/admin/uploads', (req, res) => {
    const requested = parseInt(req.query.limit, 10) || 100;
    const limit = Math.min(requested, config.upload.storeMaxEntries);
    const uploads = store.list(limit);

    res.json({
        server_started_at: store.startedAt,
        count: uploads.length,
        uploads,
    });
});

module.exports = router;
