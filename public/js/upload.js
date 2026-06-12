/* global fetch */
'use strict';

/**
 * public/js/upload.js
 *
 * Upload page logic — split into three focused layers:
 *   1. Validation  — client-side file checks (size, type)
 *   2. UI          — DOM state transitions (file preview, loading, status)
 *   3. API         — multipart POST to /api/upload
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
]);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

// ── DOM references ────────────────────────────────────────────────────────────

const els = {
    dropzone:      document.getElementById('dropzone'),
    fileInput:     document.getElementById('fileInput'),
    filePreview:   document.getElementById('filePreview'),
    previewName:   document.getElementById('previewName'),
    previewSize:   document.getElementById('previewSize'),
    removeBtn:     document.getElementById('removeFile'),
    submitBtn:     document.getElementById('submitBtn'),
    uploaderInput: document.getElementById('uploaderInput'),
    statusSuccess: document.getElementById('statusSuccess'),
    statusError:   document.getElementById('statusError'),
    successDetail: document.getElementById('successDetail'),
    errorTitle:    document.getElementById('errorTitle'),
    errorDetail:   document.getElementById('errorDetail'),
};

// ── State ─────────────────────────────────────────────────────────────────────

let selectedFile = null;

// ── Validation layer ──────────────────────────────────────────────────────────

/**
 * Validates a candidate file against type and size constraints.
 * Returns null on success, or an error object { title, detail } on failure.
 *
 * @param {File} file
 * @returns {{ title: string, detail: string } | null}
 */
function validate(file) {
    if (!ALLOWED_TYPES.has(file.type)) {
        return {
            title: 'Unsupported file type',
            detail: 'Please upload a PDF, JPG, PNG or TIFF file.',
        };
    }
    if (file.size > MAX_BYTES) {
        return {
            title: 'File too large',
            detail: `Maximum size is 50 MB. Your file is ${formatBytes(file.size)}.`,
        };
    }
    return null;
}

// ── API layer ─────────────────────────────────────────────────────────────────

/**
 * Posts the selected file (and optional uploader ID) to the API.
 *
 * @param {File}   file
 * @param {string} uploaderId  Optional — may be empty string
 * @returns {Promise<{ ok: boolean, data: object }>}
 */
async function postUpload(file, uploaderId) {
    const formData = new FormData();
    formData.append('file', file);
    if (uploaderId) formData.append('uploader_id', uploaderId);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    return { ok: res.ok, data };
}

// ── UI layer ──────────────────────────────────────────────────────────────────

/** Format bytes into a human-readable string. */
function formatBytes(bytes) {
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

/** Map API error codes to user-friendly titles. */
function friendlyError(code) {
    const messages = {
        FILE_TOO_LARGE:    'File too large',
        UNSUPPORTED_TYPE:  'Unsupported file type',
        BOX_UPLOAD_FAILED: 'Storage error',
        TOO_MANY_REQUESTS: 'Too many uploads',
        NO_FILE:           'No file selected',
    };
    return messages[code] || 'Upload failed';
}

function clearStatus() {
    els.statusSuccess.classList.remove('visible');
    els.statusError.classList.remove('visible');
}

function showError(title, detail) {
    els.errorTitle.textContent  = title;
    els.errorDetail.textContent = detail;
    els.statusError.classList.add('visible');
    els.statusSuccess.classList.remove('visible');
}

function showSuccess(detail) {
    els.successDetail.textContent = detail;
    els.statusSuccess.classList.add('visible');
    els.statusError.classList.remove('visible');
}

function showFilePreview(file) {
    els.previewName.textContent = file.name;
    els.previewSize.textContent = formatBytes(file.size);
    els.filePreview.classList.add('visible');
    els.submitBtn.disabled = false;
}

function hideFilePreview() {
    els.filePreview.classList.remove('visible');
    els.submitBtn.disabled = true;
}

function setLoadingState() {
    els.submitBtn.disabled = true;
    els.submitBtn.innerHTML = `<div class="spinner"></div> Uploading…`;
}

function resetSubmitButton() {
    els.submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      Send to print shop
    `;
    els.submitBtn.disabled = !selectedFile;
}

// ── File selection logic ──────────────────────────────────────────────────────

function selectFile(file) {
    if (!file) return;

    const err = validate(file);
    if (err) {
        showError(err.title, err.detail);
        return;
    }

    clearStatus();
    selectedFile = file;
    showFilePreview(file);
}

function clearFile() {
    selectedFile = null;
    els.fileInput.value = '';
    hideFilePreview();
    clearStatus();
}

// ── Event handlers ────────────────────────────────────────────────────────────

// Drag & drop
els.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.dropzone.classList.add('drag-over');
});

['dragleave', 'dragend'].forEach((evt) => {
    els.dropzone.addEventListener(evt, () =>
        els.dropzone.classList.remove('drag-over')
    );
});

els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) selectFile(file);
});

// File input change
els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files[0]) selectFile(els.fileInput.files[0]);
});

// Remove file
els.removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
});

// Submit
els.submitBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    clearStatus();
    setLoadingState();

    const uploaderId = els.uploaderInput.value.trim();

    try {
        const { ok, data } = await postUpload(selectedFile, uploaderId);

        if (ok) {
            showSuccess(`"${data.filename}" has been sent to the print queue.`);
            clearFile();
            els.uploaderInput.value = '';
        } else {
            showError(friendlyError(data.error), data.message || 'Please try again.');
        }
    } catch {
        showError('Connection error', 'Could not reach the server. Check your internet connection.');
    } finally {
        resetSubmitButton();
    }
});
