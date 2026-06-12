'use strict';

/**
 * src/services/box.service.js
 *
 * Encapsulates all interaction with the Box Platform API:
 *   - SDK initialisation (JWT app auth)
 *   - Daily folder lookup / creation with in-process caching
 *   - File upload (simple for ≤ 20 MB, chunked for > 20 MB)
 *
 * The SDK client is a module-level singleton — it is created once when the
 * module is first required and reused for every request. Box's SDK handles
 * token refresh internally.
 */

const BoxSDK = require('box-node-sdk');
const { Readable } = require('stream');
const config = require('../config');

// ── SDK initialisation ────────────────────────────────────────────────────────

const sdk = new BoxSDK({
    clientID: config.box.clientId,
    clientSecret: config.box.clientSecret,
    appAuth: {
        keyID: config.box.keyId,
        privateKey: config.box.privateKey,
        passphrase: config.box.passphrase,
    },
});

const client = sdk.getAppAuthClient('enterprise', config.box.enterpriseId);

function log(step, message, meta) {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[box] ${step} — ${message}${suffix}`);
}

/**
 * Verifies Box auth and upload folder access. Call once at startup.
 *
 * @returns {Promise<{ uploadRootId: string, uploadRootName: string }>}
 */
async function verifyBoxConnection() {
    const rootId = config.box.uploadFolderId;
    log('startup', 'verifying Box connection', {
        enterpriseId: config.box.enterpriseId,
        uploadFolderId: rootId,
    });
    const folder = await client.folders.get(rootId, { fields: 'name' });
    log('startup', 'Box connection OK', { uploadRootName: folder.name, uploadRootId: rootId });
    return { uploadRootId: rootId, uploadRootName: folder.name };
}

// ── Daily folder management ───────────────────────────────────────────────────

/**
 * Cache: ISO date string → Box folder ID.
 * Prevents redundant API calls within the same day.
 * @type {Map<string, string>}
 */
const folderCache = new Map();

/**
 * Returns today's subfolder ID inside the root upload folder.
 * Creates the subfolder if it does not already exist.
 *
 * @returns {Promise<string>} Box folder ID for today
 */
async function getOrCreateDailyFolder() {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    if (folderCache.has(today)) {
        log('daily', 'using cached daily folder', { date: today, folderId: folderCache.get(today) });
        return folderCache.get(today);
    }

    const rootId = config.box.uploadFolderId;
    log('daily', 'looking for today\'s folder', { date: today, parentId: rootId });

    const items = await client.folders.getItems(rootId, {
        fields: 'id,name,type',
        limit: 100,
    });

    const existing = items.entries.find(
        (entry) => entry.type === 'folder' && entry.name === today
    );

    let folderId;
    if (existing) {
        folderId = existing.id;
        log('daily', 'found existing daily folder', { date: today, folderId });
    } else {
        log('daily', 'creating daily folder', { date: today, parentId: rootId });
        folderId = (await client.folders.create(rootId, today)).id;
        log('daily', 'daily folder created', { date: today, folderId });
    }

    folderCache.set(today, folderId);
    return folderId;
}

// ── File upload ───────────────────────────────────────────────────────────────

/**
 * Upload a file buffer to Box.
 * Uses chunked upload for files above the configured threshold, simple upload otherwise.
 *
 * @param {Buffer}  buffer     Raw file data
 * @param {string}  filename   Already sanitised filename
 * @param {number}  sizeBytes  File size in bytes
 * @param {string}  folderId   Destination Box folder ID
 * @returns {Promise<{ box_file_id: string, box_folder_id: string }>}
 */
async function uploadFile(buffer, filename, sizeBytes, folderId) {
    const mode = sizeBytes > config.upload.chunkThresholdBytes ? 'chunked' : 'simple';
    log('upload', 'starting file upload', { filename, sizeBytes, folderId, mode });
    const result = mode === 'chunked'
        ? await _chunkedUpload(buffer, filename, sizeBytes, folderId)
        : await _simpleUpload(buffer, filename, folderId);
    log('upload', 'file upload complete', result);
    return result;
}

/**
 * @private
 * Simple single-request upload for smaller files.
 */
async function _simpleUpload(buffer, filename, folderId) {
    const stream = Readable.from(buffer);
    const response = await client.files.uploadFile(folderId, filename, stream);
    return {
        box_file_id: response.entries[0].id,
        box_folder_id: folderId,
    };
}

/**
 * @private
 * Chunked upload for larger files (> 20 MB by default).
 * Avoids memory pressure and upload timeouts on large payloads.
 */
async function _chunkedUpload(buffer, filename, sizeBytes, folderId) {
    const stream = Readable.from(buffer);
    const uploader = await client.files.getChunkedUploader(
        folderId,
        sizeBytes,
        filename,
        stream
    );
    const file = await uploader.start();
    return {
        box_file_id: file.id,
        box_folder_id: folderId,
    };
}

module.exports = { uploadFile, getOrCreateDailyFolder, verifyBoxConnection };
