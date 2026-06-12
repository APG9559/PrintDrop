'use strict';

/**
 * src/middleware/errorHandler.js
 *
 * Global Express error handler.
 * Catches anything unhandled upstream (e.g. JSON parse errors from body-parser)
 * and returns a consistent JSON response instead of crashing or leaking stack traces.
 *
 * Must be registered LAST in app.js — Express identifies error-handlers by their
 * 4-parameter signature (err, req, res, next).
 */

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    console.error('[error]', err.message);
    res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'Something went wrong.',
    });
}

module.exports = errorHandler;
