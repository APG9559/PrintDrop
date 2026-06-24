'use strict';

/**
 * src/routes/upload.routes.js
 *
 * POST /api/upload
 *
 * Accepts a single file via multipart/form-data, validates it, uploads it to
 * Box, records it in the in-memory store, and returns a receipt to the client.
 *
 * Validation layers (in order):
 *   1. Multer — enforces file-size limit before the buffer is fully read
 *   2. Magic-byte MIME detection — cannot be spoofed by the browser
 *   3. Filename sanitisation — prevents path traversal in the Box filename
 */

const express = require('express');
const multer = require('multer');
const fileType = require('file-type');
const sanitize = require('sanitize-filename');

const config = require('../config');
const boxService = require('../services/box.service');
const store = require('../services/store.service');

const router = express.Router();

function log(step, message, meta) {
    const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[upload] ${step} — ${message}${suffix}`);
}

// ── Multer ────────────────────────────────────────────────────────────────────

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.upload.maxBytes },
});

/**
 * Multer error handler — must be registered as a named middleware before the
 * main route handler so Express routes the error through it first.
 */
function handleMulterError(err, req, res, next) {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: 'FILE_TOO_LARGE',
            message: 'Maximum file size is 50 MB.',
        });
    }
    next(err);
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
    '/upload',
    upload.single('file'),
    handleMulterError,
    async (req, res) => {
        log('1/6', 'request received');

        // 1. Presence check
        if (!req.file) {
            log('1/6', 'rejected — no file in request');
            return res.status(400).json({
                error: 'NO_FILE',
                message: 'No file was attached to the request.',
            });
        }

        log('2/6', 'file received', {
            originalName: req.file.originalname,
            reportedMime: req.file.mimetype,
            sizeBytes: req.file.size,
        });

        // 2. Magic-byte MIME validation — do not trust the browser's Content-Type
        const detected = await fileType.fromBuffer(req.file.buffer);
        let mime = detected?.mime;

        // Fallback to extension mapping for Office files since they are zip/cfb formats
        if (!mime || mime === 'application/zip' || mime === 'application/x-cfb') {
            const ext = (req.file.originalname || '').split('.').pop().toLowerCase();
            const officeMimeMap = {
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'doc': 'application/msword',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'xls': 'application/vnd.ms-excel',
                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'ppt': 'application/vnd.ms-powerpoint'
            };
            if (officeMimeMap[ext]) {
                mime = officeMimeMap[ext];
            }
        }

        if (!mime || !config.upload.allowedMimeTypes.has(mime)) {
            log('2/6', 'rejected — unsupported file type', {
                detectedMime: mime ?? null,
            });
            return res.status(415).json({
                error: 'UNSUPPORTED_TYPE',
                message: 'Only PDF, JPG, PNG, TIFF, DOCX, XLSX and PPT files are accepted.',
            });
        }

        log('3/6', 'MIME validated', { detectedMime: mime });

        // 3. Sanitise filename and prefix with timestamp to avoid Box name collisions
        const originalClean = sanitize(req.file.originalname).trim() || 'upload';
        const safeName = `${Date.now()}_${originalClean}`;

        // 4. Optional uploader identifier — capped at 100 chars
        const uploaderId = (req.body.uploader_id || '').trim().slice(0, 100) || null;

        log('4/6', 'prepared for Box upload', {
            originalName: originalClean,
            boxFilename: safeName,
            uploaderId,
        });

        try {
            log('5/6', 'resolving Box daily folder');
            const folderId = await boxService.getOrCreateDailyFolder();
            log('5/6', 'daily folder ready', { folderId });

            const { box_file_id, box_folder_id } = await boxService.uploadFile(
                req.file.buffer,
                safeName,
                req.file.size,
                folderId
            );

            // box_file_id is intentionally NOT stored in the in-memory record
            // so it cannot leak via the admin API.
            const entry = store.add({
                filename: originalClean,
                file_type: detected.mime,
                file_size_bytes: req.file.size,
                uploader_id: uploaderId,
                box_folder_id,
            });

            log('6/6', 'upload complete', {
                uploadId: entry.upload_id,
                boxFileId: box_file_id,
                boxFolderId: box_folder_id,
            });

            return res.status(200).json({
                upload_id: entry.upload_id,
                filename: entry.filename,
                status: 'uploaded',
                uploaded_at: entry.uploaded_at,
            });
        } catch (err) {
            console.error('[upload] failed', JSON.stringify({
                step: '5/6 or 6/6',
                message: err.message,
                statusCode: err.statusCode ?? null,
                code: err.code ?? null,
            }));
            return res.status(502).json({
                error: 'BOX_UPLOAD_FAILED',
                message: 'File could not be stored. Please try again.',
            });
        }
    }
);

module.exports = router;
