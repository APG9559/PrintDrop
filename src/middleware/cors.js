'use strict';

/**
 * src/middleware/cors.js
 *
 * CORS middleware factory.
 * In production, restricts requests to ALLOWED_ORIGIN.
 * In development (no env var), allows all origins for local use.
 */

const cors = require('cors');
const config = require('../config');

function buildCorsMiddleware() {
    const { allowedOrigin } = config.cors;

    if (allowedOrigin) {
        return cors({
            origin: allowedOrigin,
            optionsSuccessStatus: 200,
        });
    }

    // No restriction in development
    return cors();
}

module.exports = buildCorsMiddleware();
