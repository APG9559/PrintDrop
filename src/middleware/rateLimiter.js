'use strict';

/**
 * src/middleware/rateLimiter.js
 *
 * Rate-limiting middleware for the upload endpoint.
 * Limits each IP to a configurable number of requests per window.
 */

const rateLimit = require('express-rate-limit');
const config = require('../config');

const uploadLimiter = rateLimit({
    windowMs: config.upload.rateLimitWindowMs,
    max: config.upload.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many uploads from this device. Please wait and try again.',
    },
});

module.exports = { uploadLimiter };
