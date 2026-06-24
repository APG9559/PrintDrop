/* global fetch */
'use strict';

/**
 * public/js/upload.js
 *
 * Upload page logic — split into three focused layers:
 *   1. Validation  — client-side file checks (size, type)
 *   2. UI          — DOM state transitions (file preview, loading, status)
 *   3. API         — multipart POST to /api/upload (one request per file)
 */

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
]);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const FILE_ICON_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>`;

const REMOVE_ICON_SVG = `
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

// ── DOM references ────────────────────────────────────────────────────────────

const els = {
    uploadForm:           document.getElementById('uploadForm'),
    uploadSuccess:        document.getElementById('uploadSuccess'),
    uploadSuccessMessage: document.getElementById('uploadSuccessMessage'),
    uploadAgainBtn:       document.getElementById('uploadAgainBtn'),
    dropzone:             document.getElementById('dropzone'),
    fileInput:            document.getElementById('fileInput'),
    filePreviewList:      document.getElementById('filePreviewList'),
    submitBtn:            document.getElementById('submitBtn'),
    uploaderInput:        document.getElementById('uploaderInput'),
    statusError:          document.getElementById('statusError'),
    errorTitle:           document.getElementById('errorTitle'),
    errorDetail:          document.getElementById('errorDetail'),
};

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {File[]} */
let selectedFiles = [];

// ── Validation layer ──────────────────────────────────────────────────────────

/**
 * Validates a candidate file against type and size constraints.
 * Returns null on success, or an error object { title, detail } on failure.
 *
 * @param {File} file
 * @returns {{ title: string, detail: string } | null}
 */
function validate(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const officeExts = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'pdf', 'jpg', 'jpeg', 'png', 'tif', 'tiff']);

    if (!ALLOWED_TYPES.has(file.type) && !officeExts.has(ext)) {
        return {
            title: 'Unsupported file type',
            detail: `"${file.name}" is not a PDF, JPG, PNG, TIFF, DOCX, XLSX or PPT file.`,
        };
    }
    if (file.size > MAX_BYTES) {
        return {
            title: 'File too large',
            detail: `"${file.name}" is ${formatBytes(file.size)}. Maximum size is 50 MB per file.`,
        };
    }
    return null;
}

// ── API layer ─────────────────────────────────────────────────────────────────

/**
 * Posts a single file (and optional uploader ID) to the API.
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
    els.statusError.classList.remove('visible');
}

function showError(title, detail) {
    els.errorTitle.textContent  = title;
    els.errorDetail.textContent = detail;
    els.statusError.classList.add('visible');
}

function showSuccess(message) {
    els.uploadSuccessMessage.textContent = message;
    els.uploadForm.hidden = true;
    els.uploadSuccess.hidden = false;
}

function resetUploadPage() {
    els.uploadSuccess.hidden = true;
    els.uploadForm.hidden = false;
    clearFiles();
    els.uploaderInput.value = '';
    clearStatus();
    updateSubmitButton();
}

function isDuplicate(file) {
    return selectedFiles.some((f) => f.name === file.name && f.size === file.size);
}

function renderFilePreview() {
    els.filePreviewList.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const row = document.createElement('div');
        row.className = 'file-preview visible';
        row.innerHTML = `
          <span class="file-preview__icon">${FILE_ICON_SVG}</span>
          <span class="file-preview__name">${escapeHtml(file.name)}</span>
          <span class="file-preview__size">${formatBytes(file.size)}</span>
          <button type="button" class="file-preview__remove" data-index="${index}"
                  aria-label="Remove ${escapeHtml(file.name)}">
            ${REMOVE_ICON_SVG}
          </button>`;
        els.filePreviewList.appendChild(row);
    });

    els.filePreviewList.classList.toggle('visible', selectedFiles.length > 0);
    updateSubmitButton();
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function updateSubmitButton() {
    const count = selectedFiles.length;
    els.submitBtn.disabled = count === 0;

    if (count === 0) {
        els.submitBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Send`;
        return;
    }

    const label = count === 1 ? 'Send 1 file' : `Send ${count} files`;
    els.submitBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      ${label}`;
}

function setLoadingState(current, total) {
    els.submitBtn.disabled = true;
    const label = total === 1
        ? 'Uploading…'
        : `Uploading ${current} of ${total}…`;
    els.submitBtn.innerHTML = `<div class="spinner"></div> ${label}`;
}

// ── File selection logic ──────────────────────────────────────────────────────

function selectFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length) return;

    clearStatus();

    const rejected = [];
    const added = [];

    for (const file of files) {
        const err = validate(file);
        if (err) {
            rejected.push({ file, err });
            continue;
        }
        if (isDuplicate(file)) {
            continue;
        }
        added.push(file);
    }

    if (added.length) {
        selectedFiles = selectedFiles.concat(added);
        renderFilePreview();
    }

    if (rejected.length === 1) {
        showError(rejected[0].err.title, rejected[0].err.detail);
    } else if (rejected.length > 1) {
        const names = rejected.map((r) => r.file.name).join(', ');
        showError(
            'Some files were skipped',
            `${rejected.length} file(s) could not be added: ${names}.`
        );
    }
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    els.fileInput.value = '';
    renderFilePreview();
    clearStatus();
}

function clearFiles() {
    selectedFiles = [];
    els.fileInput.value = '';
    renderFilePreview();
    clearStatus();
}

// ── Event handlers ────────────────────────────────────────────────────────────

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
    if (e.dataTransfer.files.length) {
        selectFiles(e.dataTransfer.files);
    }
});

els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files.length) {
        selectFiles(els.fileInput.files);
    }
});

els.filePreviewList.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-preview__remove');
    if (!btn) return;
    e.stopPropagation();
    removeFile(Number(btn.dataset.index));
});

els.submitBtn.addEventListener('click', async () => {
    if (!selectedFiles.length) return;

    clearStatus();
    const uploaderId = els.uploaderInput.value.trim();
    const total = selectedFiles.length;
    const succeeded = [];
    const failed = [];

    for (let i = 0; i < selectedFiles.length; i++) {
        setLoadingState(i + 1, total);

        try {
            const { ok, data } = await postUpload(selectedFiles[i], uploaderId);
            if (ok) {
                succeeded.push(data.filename);
            } else {
                failed.push({
                    name: selectedFiles[i].name,
                    title: friendlyError(data.error),
                    detail: data.message || 'Please try again.',
                });
            }
        } catch {
            failed.push({
                name: selectedFiles[i].name,
                title: 'Connection error',
                detail: 'Could not reach the server.',
            });
        }
    }

    if (succeeded.length && !failed.length) {
        const message = succeeded.length === 1
            ? `"${succeeded[0]}" was sent successfully. We'll handle the rest.`
            : `${succeeded.length} files were sent successfully. We'll handle the rest.`;
        showSuccess(message);
    } else if (succeeded.length && failed.length) {
        const failedNames = failed.map((f) => f.name).join(', ');
        showError(
            'Some uploads failed',
            `${succeeded.length} of ${total} files uploaded. Failed: ${failedNames}.`
        );
        selectedFiles = selectedFiles.filter((f) =>
            failed.some((item) => item.name === f.name)
        );
        renderFilePreview();
    } else {
        const first = failed[0];
        showError(first.title, first.detail);
    }

    updateSubmitButton();
});

els.uploadAgainBtn.addEventListener('click', resetUploadPage);

updateSubmitButton();
