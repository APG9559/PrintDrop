'use strict';

/**
 * server.js — Entry point
 *
 * Loads environment variables, then starts the HTTP server.
 * All application logic lives in src/; this file only calls app.listen().
 */

require('dotenv').config();

const config = require('./src/config');
const app = require('./src/app');
const boxService = require('./src/services/box.service');

const PORT = config.port;

app.listen(PORT, () => {
    console.log(`PrintDrop running → http://localhost:${PORT}`);
    console.log(`  Upload page  → http://localhost:${PORT}/`);
    console.log(`  Admin panel  → http://localhost:${PORT}/admin.html`);
    console.log(`  Health check → http://localhost:${PORT}/api/health`);

    boxService.verifyBoxConnection()
        .then(({ uploadRootId, uploadRootName }) => {
            console.log(`  Box upload folder → ${uploadRootName} (${uploadRootId})`);
        })
        .catch((err) => {
            console.error(`  Box connection failed → ${err.message}`);
        });
});
