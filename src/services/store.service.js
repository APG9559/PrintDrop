'use strict';

/**
 * src/services/store.service.js
 *
 * In-memory storage for upload records.
 * Keeps the most recent N entries, newest first.
 *
 * NOTE: Data is lost on server restart by design — this is a simple session-scoped
 * log, not a persistent database. Replace with a DB adapter if persistence is needed.
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const { storeMaxEntries } = config.upload;

const store = {
    startedAt: new Date().toISOString(),

    /** @type {Array<UploadEntry>} */
    uploads: [],

    /**
     * Record a new upload and return the saved entry.
     *
     * @param {{
     *   filename: string,
     *   file_type: string,
     *   file_size_bytes: number,
     *   uploader_id: string|null,
     *   box_folder_id: string
     * }} upload
     * @returns {UploadEntry}
     */
    add(upload) {
        /** @type {UploadEntry} */
        const entry = {
            upload_id: uuidv4(),
            filename: upload.filename,
            file_type: upload.file_type,
            file_size_bytes: upload.file_size_bytes,
            uploaded_at: new Date().toISOString(),
            uploader_id: upload.uploader_id || null,
            box_folder_id: upload.box_folder_id,
        };

        this.uploads.unshift(entry); // newest first

        // Evict oldest entries beyond the cap
        if (this.uploads.length > storeMaxEntries) {
            this.uploads.length = storeMaxEntries;
        }

        return entry;
    },

    /**
     * Return the most recent `limit` entries.
     *
     * @param {number} [limit=100]
     * @returns {UploadEntry[]}
     */
    list(limit = 100) {
        return this.uploads.slice(0, Math.min(limit, storeMaxEntries));
    },
};

module.exports = store;

/**
 * @typedef {Object} UploadEntry
 * @property {string}      upload_id
 * @property {string}      filename
 * @property {string}      file_type
 * @property {number}      file_size_bytes
 * @property {string}      uploaded_at
 * @property {string|null} uploader_id
 * @property {string}      box_folder_id
 */
