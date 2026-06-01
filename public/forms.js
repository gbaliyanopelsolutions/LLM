import { getApiBase } from './supabase.js';

const PAGE_SIZE = 10;

const searchInput = document.getElementById('forms-search');
const formsCountEl = document.getElementById('forms-count');
const loadingEl = document.getElementById('forms-loading');
const emptyEl = document.getElementById('forms-empty');
const errorEl = document.getElementById('forms-error');
const tableWrap = document.getElementById('forms-table-wrap');
const tbody = document.getElementById('forms-tbody');
const paginationEl = document.getElementById('forms-pagination');
const pagePrev = document.getElementById('page-prev');
const pageNext = document.getElementById('page-next');
const pageInfo = document.getElementById('page-info');
const toastEl = document.getElementById('toast');

const detailModal = document.getElementById('detail-modal');
const detailModalBody = document.getElementById('detail-modal-body');
const detailModalClose = document.getElementById('detail-modal-close');

const confirmModal = document.getElementById('confirm-modal');
const confirmModalText = document.getElementById('confirm-modal-text');
const confirmModalTitle = document.getElementById('confirm-modal-title');
const confirmModalCancel = document.getElementById('confirm-modal-cancel');
const confirmModalConfirm = document.getElementById('confirm-modal-confirm');

let currentPage = 1;
let totalPages = 1;
let searchQuery = '';
let searchTimer = null;
let formsCache = [];
let pendingAction = null;

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

function buildFormUrl(formId) {
	const url = new URL('/form', window.location.href);
	url.searchParams.set('survey', formId);
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
	const map = { draft: 'Draft', published: 'Published', closed: 'Closed', archived: 'Archived' };
	return map[key] || uiStatus || '—';
}

function statusBadgeClass(uiStatus) {
	const key = String(uiStatus || '').toLowerCase();
	if (key === 'published' || key === 'active') return 'forms-status-badge forms-status-badge--published';
	if (key === 'closed') return 'forms-status-badge forms-status-badge--closed';
	if (key === 'archived') return 'forms-status-badge forms-status-badge--archived';
	return 'forms-status-badge forms-status-badge--draft';
}

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

async function loadForms() {
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
		formsCache = data.surveys || [];
		const pag = data.pagination || {};
		totalPages = pag.totalPages || 1;
		currentPage = pag.page || currentPage;

		if (formsCountEl) {
			const total = pag.total ?? formsCache.length;
			formsCountEl.textContent =
				total === 0 ? 'No forms' : `${total} form${total === 1 ? '' : 's'}`;
		}

		if (!formsCache.length) {
			setViewState('empty');
			return;
		}

		renderTable(formsCache);
		renderPagination(pag);
		setViewState('table');
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Failed to load forms';
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

function renderTable(forms) {
	tbody.innerHTML = '';
	for (const row of forms) {
		const tr = document.createElement('tr');
		const formId = row.survey_id;
		const formUrl = buildFormUrl(formId);
		const uiStatus = row.status_ui || row.status;

		tr.innerHTML = `
			<td data-label="Form Name">
				<strong style="font-weight:600;">${escapeHtml(row.name || '')}</strong>
			</td>
			<td data-label="Survey" style="color:var(--muted);">${escapeHtml(row.company_name || '—')}</td>
			<td data-label="Form ID" style="font-size:0.75rem;font-family:monospace;color:var(--muted);">${escapeHtml(formId.substring(0, 8))}…</td>
			<td data-label="Form Link" class="forms-url-cell">
				<input type="text" class="forms-url-input" readonly value="${escapeAttr(formUrl)}" aria-label="Form URL for ${escapeAttr(row.name || 'form')}" />
				<div class="forms-url-actions">
					<button type="button" class="dsi-btn dsi-btn--ghost dsi-btn--sm" data-action="copy" data-id="${escapeAttr(formId)}">Copy</button>
				</div>
			</td>
			<td data-label="Last Updated" style="font-size:0.82rem;color:var(--muted);">${escapeHtml(formatDate(row.updated_at))}</td>
			<td data-label="Status">
				<span class="${escapeAttr(statusBadgeClass(uiStatus))}">${escapeHtml(statusLabel(uiStatus))}</span>
			</td>
			<td data-label="Actions">
				<div class="forms-actions-dropdown">
					<button type="button" class="forms-actions-btn" data-dropdown-toggle="${escapeAttr(formId)}">⋯</button>
					<div class="forms-actions-menu" data-dropdown-menu="${escapeAttr(formId)}">
						<button type="button" class="forms-actions-menu-btn" data-action="edit-ai" data-id="${escapeAttr(formId)}">Edit with AI</button>
						<button type="button" class="forms-actions-menu-btn" data-action="duplicate" data-id="${escapeAttr(formId)}">Duplicate</button>
						<button type="button" class="forms-actions-menu-btn" data-action="view" data-id="${escapeAttr(formId)}">View</button>
						<button type="button" class="forms-actions-menu-btn danger" data-action="delete" data-id="${escapeAttr(formId)}">Delete</button>
					</div>
				</div>
			</td>
		`;
		tbody.appendChild(tr);
	}

	setupDropdowns();
}

function setupDropdowns() {
	document.querySelectorAll('[data-dropdown-toggle]').forEach(btn => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const id = btn.getAttribute('data-dropdown-toggle');
			const menu = document.querySelector(`[data-dropdown-menu="${id}"]`);
			if (menu) {
				menu.classList.toggle('is-open');
			}
		});
	});

	document.querySelectorAll('.forms-actions-menu-btn').forEach(btn => {
		btn.addEventListener('click', (e) => {
			const menu = btn.closest('.forms-actions-menu');
			if (menu) {
				menu.classList.remove('is-open');
			}
		});
	});

	document.addEventListener('click', () => {
		document.querySelectorAll('.forms-actions-menu').forEach(menu => {
			menu.classList.remove('is-open');
		});
	});
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

async function editWithAi(formId) {
	try {
		const data = await apiFetch(`/api/builder/surveys/${encodeURIComponent(formId)}`);
		const survey = data.survey;
		const questions = data.questions || [];

		// Store form data in sessionStorage so builder can load it
		sessionStorage.setItem('formToEdit', JSON.stringify({
			survey: survey,
			questions: questions
		}));

		// Redirect to builder with formId parameter
		window.location.href = `/index?formId=${encodeURIComponent(formId)}`;
	} catch (e) {
		showToast(e instanceof Error ? e.message : 'Failed to load form', 'error');
	}
}

async function duplicateForm(formId, name) {
	try {
		// Show loading spinner
		showToast('Duplicating form…', 'default');

		const data = await apiFetch(`/api/builder/surveys/duplicate/${encodeURIComponent(formId)}`, {
			method: 'POST'
		});

		showToast('Form duplicated successfully', 'success');
		await loadForms();
	} catch (e) {
		showToast(e instanceof Error ? e.message : 'Duplicate failed', 'error');
	}
}

async function viewForm(formId) {
	const url = buildFormUrl(formId);
	window.open(url, '_blank', 'noopener,noreferrer');
}

function showConfirmDialog(title, message, onConfirm) {
	confirmModalTitle.textContent = title;
	confirmModalText.textContent = message;
	pendingAction = onConfirm;
	confirmModal.hidden = false;
}

async function deleteForm(formId, name) {
	const label = name ? `"${name}"` : 'this form';
	showConfirmDialog('Delete form?', `Are you sure you want to delete ${label}? This cannot be undone.`, async () => {
		try {
			await apiFetch(`/api/builder/surveys/${encodeURIComponent(formId)}`, {
				method: 'DELETE'
			});
			showToast('Form deleted', 'success');
			if (formsCache.length === 1 && currentPage > 1) {
				currentPage -= 1;
			}
			await loadForms();
		} catch (e) {
			showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
		}
	});
}

tbody.addEventListener('click', async (ev) => {
	const btn = ev.target.closest('button[data-action]');
	if (!btn) return;

	ev.preventDefault();
	ev.stopPropagation();

	const id = btn.getAttribute('data-id');
	const action = btn.getAttribute('data-action');
	const row = formsCache.find((s) => s.survey_id === id);

	if (action === 'copy') {
		try {
			await navigator.clipboard.writeText(buildFormUrl(id));
			showToast('URL copied', 'success');
		} catch {
			showToast('Copy failed', 'error');
		}
		return;
	}
	if (action === 'edit-ai') {
		await editWithAi(id);
		return;
	}
	if (action === 'duplicate') {
		await duplicateForm(id, row?.name);
		return;
	}
	if (action === 'view') {
		await viewForm(id);
		return;
	}
	if (action === 'delete') {
		await deleteForm(id, row?.name);
		return;
	}
});

searchInput?.addEventListener('input', () => {
	clearTimeout(searchTimer);
	searchTimer = setTimeout(() => {
		searchQuery = searchInput.value.trim();
		currentPage = 1;
		loadForms();
	}, 320);
});

pagePrev?.addEventListener('click', () => {
	if (currentPage > 1) {
		currentPage -= 1;
		loadForms();
	}
});

pageNext?.addEventListener('click', () => {
	if (currentPage < totalPages) {
		currentPage += 1;
		loadForms();
	}
});

detailModalClose?.addEventListener('click', () => {
	detailModal.hidden = true;
});

detailModal?.addEventListener('click', (ev) => {
	if (ev.target === detailModal) detailModal.hidden = true;
});

confirmModalCancel?.addEventListener('click', () => {
	confirmModal.hidden = true;
	pendingAction = null;
});

confirmModalConfirm?.addEventListener('click', async () => {
	confirmModal.hidden = true;
	if (pendingAction) {
		await pendingAction();
		pendingAction = null;
	}
});

confirmModal?.addEventListener('click', (ev) => {
	if (ev.target === confirmModal) {
		confirmModal.hidden = true;
		pendingAction = null;
	}
});

loadForms();
