import { getApiBase } from './supabase.js';

const formContainer = document.getElementById('form-container');
const loadingContainer = document.getElementById('loading-container');
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
const deleteBtn = document.getElementById('delete-btn');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');
const deleteModal = document.getElementById('delete-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete');
const confirmDeleteBtn = document.getElementById('confirm-delete');

const ALLOWED_TIERS = new Set(['Tier 1', 'Tier 2', 'Tier 3']);
let companyId = null;
let currentCompany = null;
const uploadedFiles = { logo_url: null, banner_url: null };
const branding = {
	logo_url: null,
	banner_url: null,
	background_color: '#ffffff',
	text_color: '#000000',
	font_family: 'Roboto',
};

function getCompanyIdFromUrl() {
	const params = new URLSearchParams(window.location.search);
	return params.get('id');
}

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
	deleteBtn.disabled = on;
}

function updatePreview() {
	const nameForPreview = nameInput.value.trim() || 'Your Company';
	const descForPreview = descriptionInput.value.trim() || 'Company description will appear here';
	const bg = bgColorInput.value;
	const text = textColorInput.value;
	const font = fontFamilySelect.value;

	const previewCard = document.getElementById('branding-preview');
	previewCard.style.backgroundColor = bg;
	previewCard.style.color = text;
	previewCard.style.fontFamily = font;

	document.getElementById('preview-name').textContent = nameForPreview;
	document.getElementById('preview-description').textContent = descForPreview;

	const logoImg = document.getElementById('preview-logo');
	const logoArea = document.getElementById('preview-logo-area');
	if (uploadedFiles.logo_url || branding.logo_url) {
		logoImg.src = uploadedFiles.logo_url || branding.logo_url;
		logoImg.style.display = 'block';
		logoArea.style.minHeight = '60px';
	} else {
		logoImg.style.display = 'none';
		logoArea.style.minHeight = '0px';
	}
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

				updatePreview();
				showToast(`${fileType.charAt(0).toUpperCase() + fileType.slice(1)} uploaded`, 'success');
			}
		} finally {
			setBusy(false);
		}
	});
}

async function loadCompany() {
	if (!companyId) {
		showToast('Company ID not found', 'error');
		setTimeout(() => {
			window.location.href = '/companies';
		}, 1500);
		return;
	}

	try {
		const res = await fetch(`${getApiBase()}/api/builder/companies/${companyId}`);
		const data = await res.json();

		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Failed to load company');
		}

		currentCompany = data.company;
		populateForm();
		loadingContainer.style.display = 'none';
		formContainer.style.display = 'block';
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Failed to load company', 'error');
		setTimeout(() => {
			window.location.href = '/companies';
		}, 1500);
	}
}

function populateForm() {
	if (!currentCompany) return;

	nameInput.value = currentCompany.name || '';
	industryInput.value = currentCompany.industry || '';
	regionInput.value = currentCompany.region || '';
	tierSelect.value = currentCompany.tier || '';
	descriptionInput.value = currentCompany.description || '';

	const metadata = currentCompany.metadata || {};
	branding.logo_url = metadata.logo_url || null;
	branding.banner_url = metadata.banner_url || null;
	branding.background_color = metadata.background_color || '#ffffff';
	branding.text_color = metadata.text_color || '#000000';
	branding.font_family = metadata.font_family || 'Roboto';

	bgColorInput.value = branding.background_color;
	textColorInput.value = branding.text_color;
	fontFamilySelect.value = branding.font_family;
	document.getElementById('bg-color-text').textContent = branding.background_color;
	document.getElementById('text-color-text').textContent = branding.text_color;

	if (branding.logo_url) {
		document.getElementById('logo-preview').innerHTML = `<img src="${branding.logo_url}" alt="logo" style="max-width:100%;max-height:80px;border-radius:4px;"/>`;
	}
	if (branding.banner_url) {
		document.getElementById('banner-preview').innerHTML = `<img src="${branding.banner_url}" alt="banner" style="max-width:100%;max-height:80px;border-radius:4px;"/>`;
	}

	updatePreview();
}

setupFileUpload(logoInput, document.getElementById('logo-btn'), document.getElementById('logo-preview'), 'logo');
setupFileUpload(bannerInput, document.getElementById('banner-btn'), document.getElementById('banner-preview'), 'banner');

bgColorInput.addEventListener('change', (e) => {
	branding.background_color = e.target.value;
	document.getElementById('bg-color-text').textContent = e.target.value;
	updatePreview();
});

textColorInput.addEventListener('change', (e) => {
	branding.text_color = e.target.value;
	document.getElementById('text-color-text').textContent = e.target.value;
	updatePreview();
});

fontFamilySelect.addEventListener('change', (e) => {
	branding.font_family = e.target.value;
	updatePreview();
});

nameInput.addEventListener('input', updatePreview);
descriptionInput.addEventListener('input', updatePreview);

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

		const res = await fetch(`${getApiBase()}/api/builder/companies/${companyId}`, {
			method: 'PATCH',
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
			throw new Error(data.error || 'Update failed');
		}

		showToast('Company updated successfully', 'success');
		setTimeout(() => {
			window.location.href = '/companies';
		}, 1500);
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Update failed', 'error');
	} finally {
		setBusy(false);
	}
});

deleteBtn.addEventListener('click', (e) => {
	e.preventDefault();
	deleteModal.classList.add('show');
});

cancelDeleteBtn.addEventListener('click', () => {
	deleteModal.classList.remove('show');
});

confirmDeleteBtn.addEventListener('click', async () => {
	setBusy(true);
	try {
		const res = await fetch(`${getApiBase()}/api/builder/companies/${companyId}`, {
			method: 'DELETE',
		});
		const data = await res.json();

		if (!res.ok || !data.ok) {
			throw new Error(data.error || 'Delete failed');
		}

		showToast('Company deleted successfully', 'success');
		deleteModal.classList.remove('show');
		setTimeout(() => {
			window.location.href = '/companies';
		}, 1500);
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
		setBusy(false);
	}
});

deleteModal.addEventListener('click', (e) => {
	if (e.target === deleteModal) {
		deleteModal.classList.remove('show');
	}
});

companyId = getCompanyIdFromUrl();
loadCompany();
