/* global fetch */
'use strict';

/**
 * public/js/admin.js
 *
 * Admin panel logic — split into three focused layers:
 *   1. Formatters — pure functions to format bytes, dates, MIME types
 *   2. API        — fetches upload data from /api/admin/uploads
 *   3. Renderer   — updates DOM from fetched data
 */

// ── DOM references ────────────────────────────────────────────────────────────

const els = {
    refreshBtn:   document.getElementById('refreshBtn'),
    sinceLine:    document.getElementById('sinceLine'),
    statCount:    document.getElementById('statCount'),
    statSize:     document.getElementById('statSize'),
    statLatest:   document.getElementById('statLatest'),
    statLatestSub: document.getElementById('statLatestSub'),
    tableBody:    document.getElementById('tableBody'),
    tableWrap:    document.getElementById('tableWrap'),
    emptyState:   document.getElementById('emptyState'),
};

// ── Formatter layer ───────────────────────────────────────────────────────────

/**
 * Format a byte count into a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exp = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, exp)).toFixed(1)} ${units[exp]}`;
}

/**
 * Format an ISO date string into a locale-aware display string.
 * @param {string|null} isoString
 * @returns {string}
 */
function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleString();
}

/**
 * Map a MIME type to a CSS badge modifier class.
 * @param {string|null} mimeType
 * @returns {string}
 */
function getBadgeClass(mimeType) {
    if (!mimeType) return 'badge--other';
    const sub = mimeType.split('/')[1] || '';
    if (['pdf', 'jpeg', 'jpg', 'png', 'tiff'].includes(sub)) {
        return `badge--${sub}`;
    }
    if (sub.includes('wordprocessingml') || sub === 'msword') {
        return 'badge--docx';
    }
    if (sub.includes('spreadsheetml') || sub === 'vnd.ms-excel') {
        return 'badge--xlsx';
    }
    if (sub.includes('presentationml') || sub === 'vnd.ms-powerpoint') {
        return 'badge--pptx';
    }
    return 'badge--other';
}

/**
 * Map a MIME type to a short display label.
 * @param {string|null} mimeType
 * @returns {string}
 */
function getFriendlyType(mimeType) {
    if (!mimeType) return 'OTHER';
    const sub = mimeType.split('/')[1] || '';
    if (['pdf', 'jpeg', 'jpg', 'png', 'tiff'].includes(sub)) {
        return sub.toUpperCase();
    }
    if (sub.includes('wordprocessingml') || sub === 'msword') {
        return 'DOCX';
    }
    if (sub.includes('spreadsheetml') || sub === 'vnd.ms-excel') {
        return 'XLSX';
    }
    if (sub.includes('presentationml') || sub === 'vnd.ms-powerpoint') {
        return 'PPTX';
    }
    return (sub || 'OTHER').toUpperCase().slice(0, 8);
}

// ── API layer ─────────────────────────────────────────────────────────────────

/**
 * Fetch the upload log from the server.
 * @returns {Promise<{ server_started_at: string, count: number, uploads: Array }>}
 */
async function fetchUploads() {
    const res = await fetch('/api/admin/uploads');
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return res.json();
}

// ── Renderer layer ────────────────────────────────────────────────────────────

/**
 * Update the "active since" header line.
 * @param {string} isoString
 */
function renderSinceLine(isoString) {
    if (!isoString) return;
    const d = new Date(isoString);
    els.sinceLine.textContent = `Active since ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Update the stats row from the uploads array.
 * @param {Array} uploads
 */
function renderStats(uploads) {
    els.statCount.textContent = uploads.length;

    const totalBytes = uploads.reduce((acc, u) => acc + (u.file_size_bytes || 0), 0);
    els.statSize.textContent = formatBytes(totalBytes);

    if (uploads.length > 0) {
        const latest = uploads[0]; // newest first
        els.statLatest.textContent    = latest.filename;
        els.statLatestSub.textContent = formatDate(latest.uploaded_at);
    } else {
        els.statLatest.textContent    = '—';
        els.statLatestSub.innerHTML   = '&nbsp;';
    }
}

/**
 * Build an HTML string for one table row.
 * @param {object} item
 * @returns {string}
 */
function buildTableRow(item) {
    const badgeClass  = getBadgeClass(item.file_type);
    const typeName    = getFriendlyType(item.file_type);
    const size        = formatBytes(item.file_size_bytes);
    const time        = formatDate(item.uploaded_at);
    const uploader    = item.uploader_id || '—';
    const folderCell  = item.box_folder_id
        ? `<a href="https://app.box.com/folder/${item.box_folder_id}" target="_blank" rel="noopener noreferrer">${item.box_folder_id}</a>`
        : '—';

    return `
        <tr>
            <td class="td--filename" title="${item.filename}">${item.filename}</td>
            <td><span class="badge ${badgeClass}">${typeName}</span></td>
            <td>${size}</td>
            <td class="td--uploader">${uploader}</td>
            <td>${time}</td>
            <td>${folderCell}</td>
        </tr>
    `;
}

/**
 * Show the table (or empty state) based on the uploads array.
 * @param {Array} uploads
 */
function renderTable(uploads) {
    if (uploads.length === 0) {
        els.tableWrap.style.display  = 'none';
        els.emptyState.style.display = 'block';
        return;
    }

    els.emptyState.style.display = 'none';
    els.tableWrap.style.display  = 'block';
    els.tableBody.innerHTML      = uploads.map(buildTableRow).join('');
}

// ── Main load function ────────────────────────────────────────────────────────

async function loadData() {
    els.refreshBtn.classList.add('spinning');

    try {
        const data = await fetchUploads();
        const uploads = data.uploads || [];

        renderSinceLine(data.server_started_at);
        renderStats(uploads);
        renderTable(uploads);
    } catch (err) {
        console.error('Error fetching admin uploads:', err);
        els.sinceLine.textContent = 'Failed to load upload history';
    } finally {
        // Brief delay gives visual feedback on the refresh spinner
        setTimeout(() => els.refreshBtn.classList.remove('spinning'), 500);
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

els.refreshBtn.addEventListener('click', loadData);
document.addEventListener('DOMContentLoaded', loadData);
