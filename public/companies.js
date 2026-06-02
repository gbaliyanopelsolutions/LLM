import { getApiBase } from './supabase.js';

const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const companiesTable = document.getElementById('companies-table');
const companiesList = document.getElementById('companies-list');
const emptyState = document.getElementById('empty-state');
const loading = document.getElementById('loading');
const paginationContainer = document.getElementById('pagination-container');
const pageInfo = document.getElementById('page-info');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const deleteModal = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');

let allCompanies = [];
let filteredCompanies = [];
let currentPage = 1;
const pageSize = 10;
let deleteTargetId = null;

function showToast(text, variant = 'default') {
	toast.textContent = text;
	toast.classList.remove('dsi-toast--error', 'dsi-toast--success');
	if (variant === 'error') toast.classList.add('dsi-toast--error');
	if (variant === 'success') toast.classList.add('dsi-toast--success');
	toast.hidden = false;
	clearTimeout(showToast._t);
	showToast._t = setTimeout(() => {
		toast.hidden = true;
	}, 4000);
}

function setBusy(on) {
	loader.hidden = !on;
}

function formatDate(dateStr) {
	if (!dateStr) return 'N/A';
	const date = new Date(dateStr);
	return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function filterAndSort() {
	const searchTerm = searchInput.value.toLowerCase().trim();
	const sortValue = sortSelect.value;

	filteredCompanies = allCompanies.filter(
		(c) => c.name.toLowerCase().includes(searchTerm)
	);

	switch (sortValue) {
		case 'name-desc':
			filteredCompanies.sort((a, b) => b.name.localeCompare(a.name));
			break;
		case 'created-asc':
			filteredCompanies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
			break;
		case 'created-desc':
			filteredCompanies.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
			break;
		case 'tier':
			filteredCompanies.sort((a, b) => {
				const tierOrder = { 'Tier 1': 1, 'Tier 2': 2, 'Tier 3': 3 };
				return (tierOrder[a.tier] || 999) - (tierOrder[b.tier] || 999);
			});
			break;
		case 'name-asc':
		default:
			filteredCompanies.sort((a, b) => a.name.localeCompare(b.name));
	}

	currentPage = 1;
	renderTable();
}

function renderTable() {
	const start = (currentPage - 1) * pageSize;
	const end = start + pageSize;
	const pageCompanies = filteredCompanies.slice(start, end);

	companiesList.innerHTML = '';

	if (pageCompanies.length === 0) {
		companiesTable.style.display = 'none';
		emptyState.style.display = filteredCompanies.length === 0 && allCompanies.length === 0 ? 'block' : 'none';
		paginationContainer.style.display = 'none';
		if (filteredCompanies.length === 0 && allCompanies.length > 0) {
			emptyState.innerHTML = '<p style="color: var(--muted);">No companies match your search</p>';
		}
		return;
	}

	companiesTable.style.display = 'table';
	emptyState.style.display = 'none';

	pageCompanies.forEach((company) => {
		const metadata = company.metadata || {};
		const logoUrl = metadata.logo_url;
		const logoHtml = logoUrl
			? `<img src="${logoUrl}" alt="${company.name}" class="company-logo" onerror="this.style.display='none'">`
			: `<div class="company-logo placeholder" style="background: var(--bg-soft);display:flex;align-items:center;justify-content:center;">–</div>`;

		const row = document.createElement('tr');
		row.innerHTML = `
      <td style="width: 60px;">${logoHtml}</td>
      <td>
        <strong>${company.name}</strong>
        ${company.industry ? `<br><small style="color: var(--muted);">${company.industry}</small>` : ''}
      </td>
      <td>${company.tier || 'N/A'}</td>
      <td style="color: var(--muted); font-size: 0.9rem;">${formatDate(company.created_at)}</td>
      <td>
        <div class="table-actions">
          <a href="/edit-company?id=${company.company_id}" class="dsi-btn dsi-btn--ghost" title="Edit">Edit</a>
          <button class="dsi-btn dsi-btn--danger delete-btn" data-id="${company.company_id}" title="Delete">Delete</button>
        </div>
      </td>
    `;
		companiesList.appendChild(row);
	});

	// Setup delete buttons
	document.querySelectorAll('.delete-btn').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			deleteTargetId = btn.dataset.id;
			deleteModal.classList.add('show');
		});
	});

	// Update pagination
	const totalPages = Math.ceil(filteredCompanies.length / pageSize);
	pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
	prevBtn.disabled = currentPage === 1;
	nextBtn.disabled = currentPage === totalPages;
	paginationContainer.style.display = filteredCompanies.length > pageSize ? 'flex' : 'none';
}

async function loadCompanies() {
	loading.style.display = 'flex';
	try {
		const res = await fetch(`${getApiBase()}/api/builder/companies`);
		const data = await res.json();

		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Failed to load companies');
		}

		allCompanies = data.companies || [];
		filterAndSort();
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Failed to load companies', 'error');
		emptyState.style.display = 'block';
		emptyState.innerHTML = `<p style="color: var(--danger);">${err instanceof Error ? err.message : 'Failed to load companies'}</p>`;
	} finally {
		loading.style.display = 'none';
	}
}

async function deleteCompany() {
	if (!deleteTargetId) return;

	setBusy(true);
	try {
		const res = await fetch(`${getApiBase()}/api/builder/companies/${deleteTargetId}`, {
			method: 'DELETE',
		});
		const data = await res.json();

		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Delete failed');
		}

		showToast('Company deleted successfully', 'success');
		deleteModal.classList.remove('show');
		deleteTargetId = null;
		loadCompanies();
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
	} finally {
		setBusy(false);
	}
}

searchInput.addEventListener('input', filterAndSort);
sortSelect.addEventListener('change', filterAndSort);

prevBtn.addEventListener('click', () => {
	if (currentPage > 1) {
		currentPage -= 1;
		renderTable();
		window.scrollTo(0, 0);
	}
});

nextBtn.addEventListener('click', () => {
	const totalPages = Math.ceil(filteredCompanies.length / pageSize);
	if (currentPage < totalPages) {
		currentPage += 1;
		renderTable();
		window.scrollTo(0, 0);
	}
});

cancelDeleteBtn.addEventListener('click', () => {
	deleteModal.classList.remove('show');
	deleteTargetId = null;
});

confirmDeleteBtn.addEventListener('click', deleteCompany);

deleteModal.addEventListener('click', (e) => {
	if (e.target === deleteModal) {
		deleteModal.classList.remove('show');
		deleteTargetId = null;
	}
});

loadCompanies();
