import { getApiBase } from './supabase.js';

const form = document.getElementById('company-form');
const nameInput = document.getElementById('company-name');
const industryInput = document.getElementById('company-industry');
const regionInput = document.getElementById('company-region');
const tierSelect = document.getElementById('company-tier');
const descriptionInput = document.getElementById('company-description');
const logoInput = document.getElementById('company-logo');
const bannerInput = document.getElementById('company-banner');
const bgColorInput = document.getElementById('bg-color');
const textColorInput = document.getElementById('text-color');
const fontFamilySelect = document.getElementById('font-family');
const saveBtn = document.getElementById('save-btn');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');

const ALLOWED_TIERS = new Set(['Tier 1', 'Tier 2', 'Tier 3']);
const uploadedFiles = { logo_url: null, banner_url: null };
const branding = {
	logo_url: null,
	banner_url: null,
	background_color: '#ffffff',
	text_color: '#000000',
	font_family: 'Roboto',
};

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
	saveBtn.disabled = on;
}

async function uploadFile(file, fileType) {
	if (!file) return null;

	const formData = new FormData();
	formData.append('file', file);

	try {
		const uploadUrl = `${getApiBase()}/api/builder/companies/temp/upload?uploadType=${encodeURIComponent(fileType)}`;
		const res = await fetch(uploadUrl, {
			method: 'POST',
			body: formData,
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Upload failed');
		}
		return data.url;
	} catch (err) {
		showToast(
			`Failed to upload ${fileType}: ${err instanceof Error ? err.message : 'Unknown error'}`,
			'error'
		);
		return null;
	}
}

function setupFileUpload(inputElement, buttonElement, previewElement, fileType) {
	buttonElement.addEventListener('click', (e) => {
		e.preventDefault();
		inputElement.click();
	});

	inputElement.addEventListener('change', async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith('image/')) {
			showToast('Please select an image file', 'error');
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			showToast('File size must be less than 5MB', 'error');
			return;
		}

		setBusy(true);
		try {
			const url = await uploadFile(file, fileType);
			if (url) {
				uploadedFiles[`${fileType}_url`] = url;
				branding[`${fileType}_url`] = url;

				const reader = new FileReader();
				reader.onload = (event) => {
					previewElement.innerHTML = `<img src="${event.target.result}" alt="${fileType}" style="max-width:100%;max-height:80px;border-radius:4px;"/>`;
				};
				reader.readAsDataURL(file);

				showToast(`${fileType.charAt(0).toUpperCase() + fileType.slice(1)} uploaded`, 'success');
			}
		} finally {
			setBusy(false);
		}
	});
}

setupFileUpload(logoInput, document.getElementById('logo-btn'), document.getElementById('logo-preview'), 'logo');
setupFileUpload(bannerInput, document.getElementById('banner-btn'), document.getElementById('banner-preview'), 'banner');

bgColorInput.addEventListener('change', (e) => {
	branding.background_color = e.target.value;
	document.getElementById('bg-color-text').textContent = e.target.value;
});

textColorInput.addEventListener('change', (e) => {
	branding.text_color = e.target.value;
	document.getElementById('text-color-text').textContent = e.target.value;
});

fontFamilySelect.addEventListener('change', (e) => {
	branding.font_family = e.target.value;
});

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
		const metadata = {
			logo_url: branding.logo_url,
			banner_url: branding.banner_url,
			background_color: branding.background_color,
			text_color: branding.text_color,
			font_family: branding.font_family,
		};

		const res = await fetch(`${getApiBase()}/api/builder/companies`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				industry: industryInput.value.trim() || null,
				region: regionInput.value.trim() || null,
				tier,
				description: descriptionInput.value.trim() || null,
				metadata,
			}),
		});

		const data = await res.json();
		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Save failed');
		}

		showToast('Company saved successfully', 'success');
		setTimeout(() => {
			window.location.href = '/companies';
		}, 1500);
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Save failed', 'error');
	} finally {
		setBusy(false);
	}
});
