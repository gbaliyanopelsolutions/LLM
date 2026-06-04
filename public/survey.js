import { getApiBase } from './supabase.js';

const PAGE_SIZE = 10;

const searchInput = document.getElementById('survey-search');
const surveyCountEl = document.getElementById('survey-count');
const loadingEl = document.getElementById('survey-loading');
const emptyEl = document.getElementById('survey-empty');
const errorEl = document.getElementById('survey-error');
const tableWrap = document.getElementById('survey-table-wrap');
const tbody = document.getElementById('survey-tbody');
const paginationEl = document.getElementById('survey-pagination');
const pagePrev = document.getElementById('page-prev');
const pageNext = document.getElementById('page-next');
const pageInfo = document.getElementById('page-info');
const toastEl = document.getElementById('toast');

const detailModal = document.getElementById('detail-modal');
const detailModalBody = document.getElementById('detail-modal-body');
const detailModalClose = document.getElementById('detail-modal-close');

const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const editSurveyId = document.getElementById('edit-survey-id');
const editName = document.getElementById('edit-name');
const editDescription = document.getElementById('edit-description');
const editStatus = document.getElementById('edit-status');
const editMaxSubmissions = document.getElementById('edit-max-submissions');
const editFormError = document.getElementById('edit-form-error');
const editModalCancel = document.getElementById('edit-modal-cancel');

let currentPage = 1;
let totalPages = 1;
let searchQuery = '';
let searchTimer = null;
let surveysCache = [];

function showToast(text, variant = 'default') {
	if (!toastEl) return;
	toastEl.textContent = text;
	toastEl.classList.remove('dsi-toast--error', 'dsi-toast--success');
	if (variant === 'error') toastEl.classList.add('dsi-toast--error');
	if (variant === 'success') toastEl.classList.add('dsi-toast--success');
	toastEl.hidden = false;
	clearTimeout(showToast._t);
	showToast._t = setTimeout(() => { toastEl.hidden = true; }, 3800);
}

function buildFormUrl(surveyId) {
	const url = new URL('/form', window.location.href);
	url.searchParams.set('survey', surveyId);
	return url.href;
}

function formatDate(iso) {
	if (!iso) return '—';
	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(new Date(iso));
	} catch {
		return String(iso);
	}
}

function statusLabel(uiStatus) {
	const key = String(uiStatus || '').toLowerCase();
	const map = { draft: 'Draft', published: 'Published', closed: 'Closed', archived: 'Closed' };
	return map[key] || uiStatus || '—';
}

/**
 * @param {string} uiStatus
 * @returns {string}
 */
function statusBadgeClass(uiStatus) {
	const key = String(uiStatus || '').toLowerCase();
	if (key === 'published' || key === 'active') return 'dsi-badge dsi-badge--published';
	if (key === 'closed' || key === 'archived') return 'dsi-badge dsi-badge--closed';
	return 'dsi-badge dsi-badge--draft';
}

/**
 * @param {number|null|undefined} max
 * @returns {string}
 */
function formatMaxSubmissions(max) {
	if (max === null || max === undefined || max === '') return 'Unlimited';
	const n = Number(max);
	return Number.isNaN(n) ? 'Unlimited' : String(n);
}

/**
 * @param {number|null|undefined} remaining
 * @returns {string}
 */
function formatRemaining(remaining) {
	if (remaining === null || remaining === undefined) return 'Unlimited';
	const n = Number(remaining);
	return Number.isNaN(n) ? '—' : String(Math.max(0, n));
}

/**
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
function formatSubmitCount(n) {
	const num = parseInt(String(n ?? 0), 10);
	if (Number.isNaN(num) || num < 0) {
		return '0';
	}
	return String(num);
}

function setViewState(state) {
	loadingEl.hidden = state !== 'loading';
	emptyEl.hidden = state !== 'empty';
	tableWrap.hidden = state !== 'table';
	paginationEl.hidden = state !== 'table';
	if (errorEl) {
		errorEl.hidden = state !== 'error';
	}
}

async function apiFetch(path, options = {}) {
	const url = `${getApiBase()}${path}`.replace(/([^:])\/{2,}/g, '$1/');
	const res = await fetch(url, {
		headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
		...options,
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || data.ok === false) {
		throw new Error(data.error || `Request failed (${res.status})`);
	}
	return data;
}

async function loadSurveys() {
	setViewState('loading');
	if (errorEl) {
		errorEl.textContent = '';
		errorEl.hidden = true;
	}
	try {
		const params = new URLSearchParams({
			page: String(currentPage),
			pageSize: String(PAGE_SIZE),
		});
		if (searchQuery) {
			params.set('q', searchQuery);
		}
		const data = await apiFetch(`/api/builder/surveys?${params.toString()}`);
		surveysCache = data.surveys || [];
		const pag = data.pagination || {};
		totalPages = pag.totalPages || 1;
		currentPage = pag.page || currentPage;

		if (surveyCountEl) {
			const total = pag.total ?? surveysCache.length;
			surveyCountEl.textContent =
				total === 0 ? 'No surveys' : `${total} survey${total === 1 ? '' : 's'}`;
		}

		if (!surveysCache.length) {
			setViewState('empty');
			return;
		}

		renderTable(surveysCache);
		renderPagination(pag);
		setViewState('table');
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Failed to load surveys';
		if (errorEl) {
			errorEl.textContent = msg;
			errorEl.hidden = false;
		}
		setViewState('empty');
		tableWrap.hidden = true;
		paginationEl.hidden = true;
		showToast(msg, 'error');
	}
}

function renderPagination(pag) {
	const page = pag.page || 1;
	const tp = pag.totalPages || 1;
	pageInfo.textContent = `Page ${page} of ${tp}`;
	pagePrev.disabled = page <= 1;
	pageNext.disabled = page >= tp;
}

function renderTable(surveys) {
	tbody.innerHTML = '';
	for (const row of surveys) {
		const tr = document.createElement('tr');
		const surveyId = row.survey_id;
		const formUrl = buildFormUrl(surveyId);
		const uiStatus = row.status_ui || row.status;

		tr.innerHTML = `
			<td data-label="Survey name">
				<strong style="font-weight:600;">${escapeHtml(row.name || '')}</strong>
			</td>
			<td data-label="Company" style="color:var(--muted);">${escapeHtml(row.company_name || '—')}</td>
			<td data-label="Created" style="font-size:0.82rem;color:var(--muted);">${escapeHtml(formatDate(row.created_at))}</td>
			<td data-label="Form URL" class="survey-url-cell">
				<input type="text" class="survey-url-input" readonly value="${escapeAttr(formUrl)}" aria-label="Form URL for ${escapeAttr(row.name || 'survey')}" />
				<div class="survey-url-actions">
					<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" data-action="copy" data-id="${escapeAttr(surveyId)}">Copy</button>
					<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" data-action="open" data-id="${escapeAttr(surveyId)}">Open</button>
				</div>
			</td>
			<td data-label="Responses" style="font-variant-numeric:tabular-nums;">
				${escapeHtml(formatSubmitCount(row.total_submissions ?? row.submit_count))}
			</td>
			<td data-label="Status">
				<select class="survey-status-select" data-id="${escapeAttr(surveyId)}" aria-label="Survey status for ${escapeAttr(row.name || 'survey')}">
					<option value="draft"${uiStatus === 'draft' ? ' selected' : ''}>Draft</option>
					<option value="published"${uiStatus === 'published' ? ' selected' : ''}>Published</option>
					<option value="closed"${uiStatus === 'closed' || uiStatus === 'archived' ? ' selected' : ''}>Closed</option>
				</select>
			</td>
			<td data-label="Analytics">
				<a href="/surveys/${escapeAttr(surveyId)}/analytics" class="dsi-btn dsi-btn--ghost dsi-btn--sm">Analytics</a>
			</td>
			<td data-label="Edit">
				<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" data-action="edit" data-id="${escapeAttr(surveyId)}">Edit</button>
			</td>
			<td data-label="Delete">
				<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" style="color:var(--danger);border-color:rgba(239,68,68,0.35);" data-action="delete" data-id="${escapeAttr(surveyId)}">Delete</button>
			</td>
			<td data-label="View detail">
				<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" data-action="detail" data-id="${escapeAttr(surveyId)}">View</button>
			</td>
		`;
		tbody.appendChild(tr);
	}
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeAttr(str) {
	return escapeHtml(str);
}

async function updateStatus(surveyId, status) {
	try {
		await apiFetch(`/api/builder/surveys/${encodeURIComponent(surveyId)}`, {
			method: 'PATCH',
			body: JSON.stringify({ status }),
		});
		showToast('Status updated', 'success');
		await loadSurveys();
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Update failed';
		showToast(msg, 'error');
		await loadSurveys();
	}
}

async function openDetail(surveyId) {
	try {
		const data = await apiFetch(`/api/builder/surveys/${encodeURIComponent(surveyId)}`);
		const s = data.survey;
		const questions = data.questions || [];
		const formUrl = buildFormUrl(s.survey_id);
		const uiStatus = s.status_ui || s.status;
		const total = s.total_submissions ?? s.submit_count ?? 0;
		const max = s.max_submissions;
		const remaining = s.remaining_submissions;

		detailModalBody.innerHTML = `
			<div style="margin-bottom:1rem;">
				<span class="${escapeAttr(statusBadgeClass(uiStatus))}">${escapeHtml(statusLabel(uiStatus))}</span>
			</div>
			<dl style="display:grid;grid-template-columns:140px 1fr;gap:0.5rem 1rem;font-size:0.82rem;margin:0 0 1rem;">
				<dt style="color:var(--muted);font-weight:600;">Survey name</dt><dd style="margin:0;">${escapeHtml(s.name)}</dd>
				<dt style="color:var(--muted);font-weight:600;">Company</dt><dd style="margin:0;">${escapeHtml(s.company_name || '—')}${s.company_tier ? ` (${escapeHtml(s.company_tier)})` : ''}</dd>
				<dt style="color:var(--muted);font-weight:600;">Description</dt><dd style="margin:0;">${escapeHtml(s.description || '—')}</dd>
				<dt style="color:var(--muted);font-weight:600;">Submissions</dt><dd style="margin:0;">${escapeHtml(formatSubmitCount(total))} / ${escapeHtml(formatMaxSubmissions(max))}</dd>
				<dt style="color:var(--muted);font-weight:600;">Remaining</dt><dd style="margin:0;">${escapeHtml(formatRemaining(remaining))}</dd>
				<dt style="color:var(--muted);font-weight:600;">Created</dt><dd style="margin:0;">${escapeHtml(formatDate(s.created_at))}</dd>
				<dt style="color:var(--muted);font-weight:600;">Updated</dt><dd style="margin:0;">${escapeHtml(formatDate(s.updated_at))}</dd>
				<dt style="color:var(--muted);font-weight:600;">Survey ID</dt><dd style="margin:0;font-family:monospace;font-size:0.75rem;">${escapeHtml(s.survey_id)}</dd>
				<dt style="color:var(--muted);font-weight:600;">Form URL</dt>
				<dd style="margin:0;">
					<input type="text" class="dsi-input" readonly value="${escapeAttr(formUrl)}" style="font-size:0.73rem;font-family:monospace;margin-bottom:0.4rem;" />
					<div style="display:flex;gap:0.35rem;">
						<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" id="detail-copy-url">Copy URL</button>
						<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" id="detail-open-form">Open form</button>
					</div>
				</dd>
				<dt style="color:var(--muted);font-weight:600;">Questions</dt><dd style="margin:0;">${questions.length}</dd>
			</dl>
			${questions.length
				? `<ol style="margin:0;padding-left:1.25rem;font-size:0.82rem;display:flex;flex-direction:column;gap:0.35rem;">${questions.map((q, i) => `<li><strong>Q${i + 1}.</strong> ${escapeHtml(q.question_text)} <span style="color:var(--muted);">(${escapeHtml(q.type)})</span></li>`).join('')}</ol>`
				: '<p style="color:var(--muted);font-size:0.82rem;margin:0;">No questions.</p>'}
		`;

		document.getElementById('detail-copy-url')?.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(formUrl);
				showToast('URL copied', 'success');
			} catch {
				showToast('Copy failed', 'error');
			}
		});
		document.getElementById('detail-open-form')?.addEventListener('click', () => {
			window.open(formUrl, '_blank', 'noopener,noreferrer');
		});

		detailModal.hidden = false;
	} catch (e) {
		showToast(e instanceof Error ? e.message : 'Could not load detail', 'error');
	}
}

function openEdit(surveyId) {
	const row = surveysCache.find((s) => s.survey_id === surveyId);
	if (!row) return;
	editSurveyId.value = surveyId;
	editName.value = row.name || '';
	editDescription.value = row.description || '';
	const ui = row.status_ui || row.status || 'draft';
	editStatus.value = ui === 'archived' ? 'closed' : ui;
	if (editMaxSubmissions) {
		editMaxSubmissions.value =
			row.max_submissions != null && row.max_submissions !== ''
				? String(row.max_submissions)
				: '';
	}
	editFormError.hidden = true;
	editFormError.textContent = '';
	editModal.hidden = false;
	editName.focus();
}

async function saveEdit(ev) {
	ev.preventDefault();
	editFormError.hidden = true;
	const id = editSurveyId.value;
	try {
		const maxRaw = editMaxSubmissions?.value.trim() ?? '';
		const maxSubmissions = maxRaw ? parseInt(maxRaw, 10) : null;
		await apiFetch(`/api/builder/surveys/${encodeURIComponent(id)}`, {
			method: 'PATCH',
			body: JSON.stringify({
				name: editName.value.trim(),
				description: editDescription.value.trim(),
				status: editStatus.value,
				maxSubmissions: maxSubmissions && maxSubmissions > 0 ? maxSubmissions : null,
			}),
		});
		editModal.hidden = true;
		showToast('Survey updated', 'success');
		await loadSurveys();
	} catch (e) {
		editFormError.textContent = e instanceof Error ? e.message : 'Save failed';
		editFormError.hidden = false;
	}
}

async function deleteSurvey(surveyId, name) {
	const label = name ? `"${name}"` : 'this survey';
	if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
		return;
	}
	try {
		await apiFetch(`/api/builder/surveys/${encodeURIComponent(surveyId)}`, { method: 'DELETE' });
		showToast('Survey deleted', 'success');
		if (surveysCache.length === 1 && currentPage > 1) {
			currentPage -= 1;
		}
		await loadSurveys();
	} catch (e) {
		showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
	}
}

tbody.addEventListener('click', async (ev) => {
	const btn = ev.target.closest('button[data-action]');
	if (!btn) return;
	const id = btn.getAttribute('data-id');
	const action = btn.getAttribute('data-action');
	const row = surveysCache.find((s) => s.survey_id === id);

	if (action === 'copy') {
		try {
			await navigator.clipboard.writeText(buildFormUrl(id));
			showToast('URL copied', 'success');
		} catch {
			showToast('Copy failed', 'error');
		}
		return;
	}
	if (action === 'open') {
		window.open(buildFormUrl(id), '_blank', 'noopener,noreferrer');
		return;
	}
	if (action === 'edit') {
		openEdit(id);
		return;
	}
	if (action === 'delete') {
		await deleteSurvey(id, row?.name);
		return;
	}
	if (action === 'detail') {
		await openDetail(id);
	}
});

tbody.addEventListener('change', async (ev) => {
	const sel = ev.target.closest('.survey-status-select');
	if (!sel) return;
	const id = sel.getAttribute('data-id');
	const status = sel.value;
	sel.disabled = true;
	await updateStatus(id, status);
	sel.disabled = false;
});

searchInput?.addEventListener('input', () => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => {
		searchQuery = searchInput.value.trim();
		currentPage = 1;
		loadSurveys();
	}, 320);
});

pagePrev?.addEventListener('click', () => {
	if (currentPage > 1) {
		currentPage -= 1;
		loadSurveys();
	}
});

pageNext?.addEventListener('click', () => {
	if (currentPage < totalPages) {
		currentPage += 1;
		loadSurveys();
	}
});

detailModalClose?.addEventListener('click', () => {
	detailModal.hidden = true;
});

detailModal?.addEventListener('click', (ev) => {
	if (ev.target === detailModal) detailModal.hidden = true;
});

editModalCancel?.addEventListener('click', () => {
	editModal.hidden = true;
});

editModal?.addEventListener('click', (ev) => {
	if (ev.target === editModal) editModal.hidden = true;
});

editForm?.addEventListener('submit', saveEdit);

loadSurveys();
