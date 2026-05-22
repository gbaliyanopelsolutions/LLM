import { getApiBase } from './supabase.js';

const form = document.getElementById('company-form');
const nameInput = document.getElementById('company-name');
const industryInput = document.getElementById('company-industry');
const regionInput = document.getElementById('company-region');
const tierSelect = document.getElementById('company-tier');
const saveBtn = document.getElementById('save-btn');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');

const ALLOWED_TIERS = new Set(['Tier 1', 'Tier 2', 'Tier 3']);

function showToast(text, variant = 'default') {
	toast.textContent = text;
	toast.classList.remove('error', 'success');
	if (variant === 'error') toast.classList.add('error');
	if (variant === 'success') toast.classList.add('success');
	toast.hidden = false;
	clearTimeout(showToast._t);
	showToast._t = setTimeout(() => {
		toast.hidden = true;
	}, 4000);
}

function setBusy(on) {
	loader.hidden = !on;
	saveBtn.disabled = on;
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const name = nameInput.value.trim();
	const tier = tierSelect.value.trim();
	if (!name) {
		showToast('Company name is required', 'error');
		nameInput.focus();
		return;
	}
	if (!tier || !ALLOWED_TIERS.has(tier)) {
		showToast('Please select Tier 1, Tier 2, or Tier 3', 'error');
		tierSelect.focus();
		return;
	}
	setBusy(true);
	try {
		const res = await fetch(`${getApiBase()}/api/builder/companies`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				industry: industryInput.value.trim() || null,
				region: regionInput.value.trim() || null,
				tier,
			}),
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Save failed');
		}
		showToast('Company saved successfully', 'success');
		form.reset();
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Save failed', 'error');
	} finally {
		setBusy(false);
	}
});
