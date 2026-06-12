'use strict';

/**
 * src/config/index.js
 *
 * Single source of truth for all environment variables.
 * Validates required values at startup so misconfiguration is caught immediately.
 */

const REQUIRED_VARS = [
    'BOX_CLIENT_ID',
    'BOX_CLIENT_SECRET',
    'BOX_ENTERPRISE_ID',
    'BOX_KEY_ID',
    'BOX_PRIVATE_KEY',
    'BOX_PASSPHRASE',
    'BOX_UPLOAD_FOLDER_ID',
];

function validate() {
    const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
    if (missing.length) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}\n` +
            'Copy env.example to .env and fill in the values.'
        );
    }
}

validate();

const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3001,

    cors: {
        allowedOrigin: process.env.ALLOWED_ORIGIN || null,
    },

    upload: {
        maxBytes: 50 * 1024 * 1024,           // 50 MB
        chunkThresholdBytes: 20 * 1024 * 1024, // 20 MB — use chunked upload above this
        allowedMimeTypes: new Set([
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/tiff',
        ]),
        rateLimitWindowMs: 15 * 60 * 1000,     // 15 minutes
        rateLimitMaxRequests: 10,
        storeMaxEntries: 500,
    },

    box: {
        clientId: process.env.BOX_CLIENT_ID,
        clientSecret: process.env.BOX_CLIENT_SECRET,
        enterpriseId: process.env.BOX_ENTERPRISE_ID,
        keyId: process.env.BOX_KEY_ID,
        // Box stores the private key with literal '\n' strings; convert them to real newlines
        privateKey: (process.env.BOX_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        passphrase: process.env.BOX_PASSPHRASE,
        uploadFolderId: process.env.BOX_UPLOAD_FOLDER_ID,
    },
};

module.exports = config;
