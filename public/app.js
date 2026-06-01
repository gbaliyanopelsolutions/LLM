import { getApiBase, getBrowserSupabase, insertSubmission } from './supabase.js';
import { prepareFormHtmlForSave } from './modules/surveyFormHtml.js?v=design-editor-20260526-2';
import { attachAutoHeightIframe, injectFrameHeightReporter } from './modules/resizePreviewIframe.js?v=design-editor-20260526-2';
import {
	extractTextFromFile,
	buildEffectivePrompt,
} from './modules/extractDocumentText.js?v=design-editor-20260526-2';
import { postProcessRatingFields } from './modules/postProcessHtml.js?v=design-editor-20260526-2';
import {
	normalizeSpec,
	renderQuestionCards,
	nextLocalId,
	specToPreviewDocument,
	toLlmSpec,
} from './modules/surveyEditor.js?v=design-editor-20260526-2';

/**
 * Extract explicit style hints (colors, logo URL) from the user's raw typed
 * prompt so we can GUARANTEE they are applied even if Claude omits the style
 * block in its JSON (which happens when the DOCX content dominates the prompt).
 *
 * @param {string} text - the user's typed prompt (NOT the merged DOCX+prompt)
 * @returns {{ backgroundColor?: string, textColor?: string, accentColor?: string, logoUrl?: string }}
 */
/**
 * Extract explicit style hints from the user's raw typed prompt.
 * Handles BOTH natural-language ("background color #000") AND
 * JSON-style camelCase ("backgroundColor: '#000'") formats so the
 * style is guaranteed to be applied regardless of how the user types it.
 *
 * @param {string} text
 * @returns {{ backgroundColor?: string, textColor?: string, accentColor?: string, logoUrl?: string }}
 */
function parseStyleFromPrompt(text) {
	const t = String(text || '');
	/** @type {Record<string, string>} */
	const s = {};

	// ── Background color ─────────────────────────────────────────────────────
	// Natural: "background color #abc" / "background: #abc" / "bg #abc"
	// JSON:    backgroundColor: "#abc"
	const bg =
		t.match(/backgroundColor\s*[=:]\s*["']?(#[0-9a-fA-F]{3,8})["']?/) ||
		t.match(/(?:background(?:\s+color)?|bg)\s*[:#]?\s*(#[0-9a-fA-F]{3,8})/i);
	if (bg) s.backgroundColor = bg[1];

	// ── Text / font color ────────────────────────────────────────────────────
	// Natural: "font color #abc" / "text color #abc"
	// JSON:    textColor: "#abc" / fontColor: "#abc"
	const tc =
		t.match(/textColor\s*[=:]\s*["']?(#[0-9a-fA-F]{3,8})["']?/) ||
		t.match(/fontColor\s*[=:]\s*["']?(#[0-9a-fA-F]{3,8})["']?/) ||
		t.match(/(?:font|text)\s+color\s*[:#]?\s*(#[0-9a-fA-F]{3,8})/i) ||
		t.match(/(?<![a-z])color\s*[:#]\s*(#[0-9a-fA-F]{3,8})/i) ||
		t.match(/^color\s+(#[0-9a-fA-F]{3,8})/im);
	if (tc) s.textColor = tc[1];

	// ── Accent / primary color ───────────────────────────────────────────────
	const ac =
		t.match(/accentColor\s*[=:]\s*["']?(#[0-9a-fA-F]{3,8})["']?/) ||
		t.match(/(?:accent|button|primary)\s+color\s*[:#]?\s*(#[0-9a-fA-F]{3,8})/i);
	if (ac) s.accentColor = ac[1];

	// ── Logo URL ─────────────────────────────────────────────────────────────
	// JSON:    logoUrl: "https://..." or logoUrl = "https://..."
	// Natural: "logo ... https://..."
	// URLs may be line-wrapped in the textarea; we capture what's between the
	// quotes (which handles embedded newlines/spaces) and then strip all
	// whitespace from the captured URL to reconstruct it.
	const luQuoted =
		t.match(/logoUrl\s*[=:]\s*"([^"]+)"/) ||
		t.match(/logoUrl\s*[=:]\s*'([^']+)'/);
	const luBare = t.replace(/\s+/g, ' ').match(
		/(?:logoUrl\s*[=:]\s*|logo[^]]*?)(https?:\/\/[^\s"',]+)/i
	);
	const lu = luQuoted || luBare;
	if (lu) s.logoUrl = lu[1].replace(/\s+/g, '').replace(/[,]+$/, '');

	console.log('[parseStyleFromPrompt] extracted →', s);
	return s;
}

const STORAGE_CONVERSATION = 'formGen_conversation_v1';
const STORAGE_PROMPTS = 'formGen_promptHistory_v1';
/** Set when user expands source; absent = default hidden. */
const STORAGE_SOURCE_EXPANDED = 'formGen_sourceExpanded_v1';
const MAX_PROMPT_HISTORY = 25;

const promptInput = document.getElementById('prompt-input');
const generateBtn = document.getElementById('generate-btn');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-history-btn');
const codeBlock = document.getElementById('code-block');
const previewEl = document.getElementById('preview');

/**
 * @param {string} html
 */
function setPreviewSrcdoc(html) {
	if (!previewEl) {
		return;
	}
	previewEl.srcdoc = injectFrameHeightReporter(html);
}

if (previewEl) {
	attachAutoHeightIframe(previewEl);
}
const errEl = document.getElementById('err');
const loaderEl = document.getElementById('loader');
const loaderTextEl = document.getElementById('loader-text');
const toastEl = document.getElementById('toast');
const promptHistoryEl = document.getElementById('prompt-history');
const sourceSubpanel = document.getElementById('source-subpanel');
const sourceToggle = document.getElementById('source-toggle');
const companySelect = document.getElementById('company-select');
const saveFormBtn = document.getElementById('save-form-btn');
const saveModal = document.getElementById('save-result-modal');
const publicUrlInput = document.getElementById('survey-public-url');
const copyPublicUrlBtn = document.getElementById('copy-public-url-btn');
const openPublicFormBtn = document.getElementById('open-public-form-btn');
const closeSaveModalBtn = document.getElementById('close-save-modal-btn');
/** Survey metadata saved to `surveys.name` / `surveys.description` (required before Save Form). */
const surveyTitleInput = document.getElementById('survey-title-input');
const surveyDescriptionInput = document.getElementById('survey-description-input');
const surveyStatusSelect = document.getElementById('survey-status-select');
const maxSubmissionsInput = document.getElementById('max-submissions-input');
const surveyDetailsSection = document.getElementById('survey-details-section');
const docUploadZone = document.getElementById('doc-upload-zone');
const docUploadInput = document.getElementById('doc-upload-input');
const docUploadStatus = document.getElementById('doc-upload-status');
const docUploadChip = document.getElementById('doc-upload-chip');
const docUploadChipName = document.getElementById('doc-upload-chip-name');
const docUploadChipMeta = document.getElementById('doc-upload-chip-meta');
const docUploadRemove = document.getElementById('doc-upload-remove');

/** @type {string} */
let uploadedDocumentText = '';
/** @type {string} */
let uploadedFileName = '';
/** @type {Array<{question:string, rows:string[], min:number, max:number}>} */
let uploadedDocxMatrices = [];

/** @type {{ role: string, content: string }[]} */
let conversation = [];
let lastHtml = '';
/** @type {{ title: string, description?: string, questions: unknown[] } | null} */
let lastSurveySpec = null;
/** @type {import('@supabase/supabase-js').SupabaseClient | null | undefined} */
let supabaseSingleton;

async function resolveSupabase() {
	if (supabaseSingleton !== undefined) {
		return supabaseSingleton;
	}
	try {
		supabaseSingleton = await getBrowserSupabase();
	} catch {
		supabaseSingleton = null;
	}
	return supabaseSingleton;
}

function showToast(text, variant = 'default') {
	toastEl.textContent = text;
	toastEl.classList.remove('toast--error', 'toast--success');
	if (variant === 'error') {
		toastEl.classList.add('toast--error');
	} else if (variant === 'success') {
		toastEl.classList.add('toast--success');
	}
	toastEl.hidden = false;
	toastEl.setAttribute('aria-live', 'polite');
	clearTimeout(showToast._t);
	showToast._t = setTimeout(() => {
		toastEl.hidden = true;
	}, 3800);
}

function setError(msg) {
	if (msg) {
		errEl.textContent = msg;
		errEl.hidden = false;
		errEl.classList.remove('alert--success');
		errEl.classList.add('alert--error');
	} else {
		errEl.hidden = true;
		errEl.textContent = '';
		errEl.classList.remove('alert--error', 'alert--success');
	}
}

function setSuccessBanner(msg) {
	if (!msg) {
		errEl.hidden = true;
		errEl.textContent = '';
		errEl.classList.remove('alert--error', 'alert--success');
		return;
	}
	errEl.textContent = msg;
	errEl.hidden = false;
	errEl.classList.remove('alert--error');
	errEl.classList.add('alert--success');
}

function setLoading(on, label) {
	loaderEl.hidden = !on;
	if (loaderTextEl && typeof label === 'string') {
		loaderTextEl.textContent = label;
	}
	generateBtn.disabled = on;
	promptInput.disabled = on;
	document.body.classList.toggle('is-loading', on);
}

function updateSurveyDetailsVisibility() {
	if (!surveyDetailsSection) return;
	const show = Boolean(
		lastSurveySpec && Array.isArray(lastSurveySpec.questions) && lastSurveySpec.questions.length
	);
	surveyDetailsSection.hidden = !show;
}

/* =============================================================================
 * Form editor (Edit Form / Preview Form tabs)
 * ===========================================================================*/

const builderTabs = Array.from(document.querySelectorAll('[data-builder-tab]'));
const editorPane = document.getElementById('builder-pane-edit');
const previewPane = document.getElementById('builder-pane-preview');
const editorCardsEl = document.getElementById('editor-cards');
const addQuestionBtn = document.getElementById('editor-add-question-btn');
const aiInput = document.getElementById('editor-ai-input');
const aiBtn = document.getElementById('editor-ai-btn');
const editWithAiBtn = document.getElementById('edit-with-ai-btn');
const aiEditModal = document.getElementById('ai-edit-modal');
const aiEditModalCloseBtn = document.getElementById('ai-edit-modal-close');

const editModal = document.getElementById('editor-edit-modal');
const editForm = document.getElementById('editor-edit-form');
const editIdInput = document.getElementById('editor-edit-id');
const editText = document.getElementById('editor-edit-text');
const editType = document.getElementById('editor-edit-type');
const editPlaceholder = document.getElementById('editor-edit-placeholder');
const editRequired = document.getElementById('editor-edit-required');
const editOptionsWrap = document.getElementById('editor-edit-options-wrap');
const editOptionsList = document.getElementById('editor-edit-options');
const editAddOptionBtn = document.getElementById('editor-edit-add-option');
const editCancelBtn = document.getElementById('editor-edit-cancel');
const editMinLength = document.getElementById('editor-edit-min-length');
const editMaxLength = document.getElementById('editor-edit-max-length');
const editMin = document.getElementById('editor-edit-min');
const editMax = document.getElementById('editor-edit-max');
const editPattern = document.getElementById('editor-edit-pattern');
const editAccept = document.getElementById('editor-edit-accept');
const validationRows = Array.from(document.querySelectorAll('[data-validation-row]'));

const deleteModal = document.getElementById('editor-delete-modal');
const deleteCancelBtn = document.getElementById('editor-delete-cancel');
const deleteConfirmBtn = document.getElementById('editor-delete-confirm');

/** @type {string | null} */
let pendingDeleteId = null;
/** @type {string | null} */
let currentEditId = null;

/* ─────────────────────────────────────────────
   DESIGN SETTINGS PANEL — element refs
───────────────────────────────────────────── */
const designControls   = Array.from(document.querySelectorAll('[data-style]'));
const designLinkedInputs = Array.from(document.querySelectorAll('[data-style-linked]'));
const designTabs       = Array.from(document.querySelectorAll('[data-ds-tab]'));
const designPanes      = Array.from(document.querySelectorAll('[data-ds-pane]'));
const themeJsonBox     = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('theme-json-box'));
const exportThemeBtn   = document.getElementById('export-theme-btn');
const importThemeBtn   = document.getElementById('import-theme-btn');
const saveThemeBtn     = document.getElementById('save-theme-btn');
const darkToggle       = /** @type {HTMLInputElement|null} */ (document.getElementById('ds-dark-toggle'));
const dsLogoZone       = document.getElementById('ds-logo-zone');
const dsLogoInput      = /** @type {HTMLInputElement|null} */ (document.getElementById('ds-logo-input'));
const dsLogoEmptyState = document.getElementById('ds-logo-empty-state');
const dsLogoFilledState= document.getElementById('ds-logo-filled-state');
const dsLogoImg        = /** @type {HTMLImageElement|null} */ (document.getElementById('ds-logo-img'));
const dsLogoName       = document.getElementById('ds-logo-name');
const dsLogoRemoveBtn  = document.getElementById('ds-logo-remove-btn');
const dsPosBtns        = Array.from(document.querySelectorAll('.ds-pos-btn'));
const resetDesignBtn   = document.getElementById('reset-design-btn');

const STORAGE_THEME = 'surveyBuilder_savedTheme_v1';

const DS_DEFAULTS = {
	backgroundColor: '#ffffff',
	textColor: '#000000',
	formBorderColor: '#e2e8f0',
	formBorderRadius: '14',
	formWidth: '720',
	formPadding: '24',
	formShadow: true,
	headingColor: '#0f172a',
	headingFontSize: '24',
	headingFontWeight: '700',
	headingAlignment: 'left',
	labelColor: '#334155',
	labelFontSize: '14',
	labelFontWeight: '600',
	nextButtonBg: '#ffffff',
	nextButtonText: '#0f172a',
	nextButtonRadius: '10',
	nextButtonHover: '#f1f5ff',
	prevButtonBg: '#ffffff',
	prevButtonText: '#0f172a',
	submitButtonBg: '#5b8cff',
	submitButtonText: '#ffffff',
	submitButtonRadius: '10',
	submitHoverAnimation: 'lift',
	inputBg: '#ffffff',
	inputText: '#0f172a',
	inputBorder: '#e2e8f0',
	inputRadius: '10',
	placeholderColor: '#94a3b8',
	inputFocusBorder: '#5b8cff',
	checkboxBg: '#ffffff',
	checkboxBorder: '#c9d0db',
	checkboxActive: '#5b8cff',
	radioColor: '#c9d0db',
	radioSelectedColor: '#5b8cff',
	tableBg: '#ffffff',
	tableBorder: '#e2e8f0',
	tableHeaderBg: '#eef2f8',
	tableHeaderText: '#4f5f7a',
	matrixCircleColor: '#c9d0db',
	matrixSelectedColor: '#5b8cff',
	rowDividerColor: '#e2e8f0',
	alternateRowBg: '#f8fafc',
	progressBarColor: '#5b8cff',
	progressBgColor: '#e2e8f0',
	progressHeight: '4',
	logoUrl: '',
	logoWidth: '260',
	logoHeight: '64',
	logoPosition: 'center',
};

const THEME_PRESETS = {
	minimal: {
		backgroundColor: '#ffffff',
		textColor: '#111827',
		formBorderColor: '#e5e7eb',
		formShadow: false,
		headingColor: '#111827',
		labelColor: '#374151',
		submitButtonBg: '#111827',
		progressBarColor: '#111827',
		radioSelectedColor: '#111827',
		matrixSelectedColor: '#111827',
	},
	dark: {
		backgroundColor: '#000000',
		textColor: '#ffffff',
		formBorderColor: '#334155',
		headingColor: '#ffffff',
		labelColor: '#e5e7eb',
		inputBg: '#050505',
		inputText: '#ffffff',
		inputBorder: '#334155',
		tableBg: '#050505',
		tableBorder: '#334155',
		tableHeaderBg: '#111827',
		tableHeaderText: '#ffffff',
		submitButtonBg: '#ffffff',
		submitButtonText: '#000000',
		nextButtonBg: '#ffffff',
		nextButtonText: '#000000',
		prevButtonBg: '#ffffff',
		prevButtonText: '#000000',
		progressBgColor: '#334155',
		progressBarColor: '#8b5cf6',
		radioSelectedColor: '#8b5cf6',
		matrixSelectedColor: '#8b5cf6',
	},
	soft: {
		backgroundColor: '#f5f3ff',
		textColor: '#312e81',
		formBorderColor: '#ddd6fe',
		headingColor: '#4c1d95',
		labelColor: '#5b21b6',
		submitButtonBg: '#7c3aed',
		progressBarColor: '#7c3aed',
		radioSelectedColor: '#7c3aed',
		matrixSelectedColor: '#7c3aed',
		tableHeaderBg: '#ede9fe',
		tableHeaderText: '#5b21b6',
	},
};

function showDesignPane(tab) {
	designTabs.forEach((btn) => btn.classList.toggle('is-active', btn.getAttribute('data-ds-tab') === tab));
	designPanes.forEach((pane) => {
		pane.hidden = pane.getAttribute('data-ds-pane') !== tab;
	});
}

function updateColorValueLabel(input) {
	const row = input.closest('.ds-color-row');
	const val = row ? row.querySelector('.ds-color-val') : null;
	if (val) val.textContent = input.value;
}

function setControlValue(key, value) {
	const ctrl = /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement|undefined} */ (
		designControls.find((el) => el.getAttribute('data-style') === key)
	);
	if (!ctrl) return;
	if (ctrl instanceof HTMLInputElement && ctrl.type === 'checkbox') {
		ctrl.checked = Boolean(value);
	} else {
		ctrl.value = String(value ?? '');
		if (ctrl instanceof HTMLInputElement && ctrl.type === 'color') updateColorValueLabel(ctrl);
	}
	const linked = /** @type {HTMLInputElement|undefined} */ (
		designLinkedInputs.find((el) => el.getAttribute('data-style-linked') === key)
	);
	if (linked) linked.value = String(value ?? '');
}

function getControlValue(ctrl) {
	if (ctrl instanceof HTMLInputElement && ctrl.type === 'checkbox') return ctrl.checked;
	return ctrl.value;
}

function readDesignControls() {
	/** @type {Record<string, string|boolean>} */
	const style = {};
	designControls.forEach((ctrl) => {
		const key = ctrl.getAttribute('data-style');
		if (!key) return;
		style[key] = getControlValue(/** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (ctrl));
	});
	return style;
}

function setDesignControls(style) {
	const merged = { ...DS_DEFAULTS, ...(style || {}) };
	Object.keys(DS_DEFAULTS).forEach((key) => setControlValue(key, merged[key]));
}

function syncLogoControlsFromStyle(style) {
	const logoUrl = String(style?.logoUrl || '');
	if (logoUrl && dsLogoImg && dsLogoEmptyState && dsLogoFilledState) {
		dsLogoImg.src = logoUrl;
		if (dsLogoName) dsLogoName.textContent = 'logo';
		dsLogoEmptyState.hidden = true;
		dsLogoFilledState.hidden = false;
		return;
	}
	if (dsLogoImg) dsLogoImg.src = '';
	if (dsLogoName) dsLogoName.textContent = '';
	if (dsLogoEmptyState) dsLogoEmptyState.hidden = false;
	if (dsLogoFilledState) dsLogoFilledState.hidden = true;
	if (dsLogoInput) dsLogoInput.value = '';
}

/**
 * Read the current design panel values and merge them into lastSurveySpec.style,
 * then immediately re-render the preview. Called by every design control's change
 * handler so the preview stays in sync with no page reload.
 */
function applyDesignSettings() {
	if (!lastSurveySpec) return;

	const logoUrl = (dsLogoImg && dsLogoFilledState && !dsLogoFilledState.hidden)
		? (dsLogoImg.src || '')
		: '';
	const activePosBtn = dsPosBtns.find((b) => b.classList.contains('is-active'));
	const pos = activePosBtn ? (activePosBtn.getAttribute('data-pos') || 'center') : 'center';

	const newStyle = {
		...(lastSurveySpec.style || {}),
		...readDesignControls(),
		logoPosition: pos,
	};
	if (logoUrl) newStyle.logoUrl = logoUrl;
	else delete newStyle.logoUrl;

	lastSurveySpec = { ...lastSurveySpec, style: newStyle };

	const html = specToPreviewDocument(lastSurveySpec);
	lastHtml = html;
	setPreviewSrcdoc(html);
}

/**
 * Read spec.style and push the values back into the Design Settings panel controls.
 * Called after every form generation so the panel reflects the generated form's style.
 */
function syncDesignPanelFromSpec() {
	const s = (lastSurveySpec && lastSurveySpec.style) ? lastSurveySpec.style : {};

	setDesignControls(s);
	syncLogoControlsFromStyle(s);
	const pos = String(s.logoPosition || 'center');
	dsPosBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-pos') === pos));
}

designTabs.forEach((btn) => {
	btn.addEventListener('click', () => showDesignPane(btn.getAttribute('data-ds-tab') || 'content'));
});

designControls.forEach((ctrl) => {
	ctrl.addEventListener('input', () => {
		if (ctrl instanceof HTMLInputElement && ctrl.type === 'color') updateColorValueLabel(ctrl);
		const key = ctrl.getAttribute('data-style');
		const linked = /** @type {HTMLInputElement|undefined} */ (
			designLinkedInputs.find((el) => el.getAttribute('data-style-linked') === key)
		);
		if (linked && ctrl instanceof HTMLInputElement) linked.value = ctrl.value;
		applyDesignSettings();
	});
	ctrl.addEventListener('change', applyDesignSettings);
});

designLinkedInputs.forEach((linked) => {
	linked.addEventListener('input', () => {
		const key = linked.getAttribute('data-style-linked');
		const ctrl = /** @type {HTMLInputElement|undefined} */ (
			designControls.find((el) => el.getAttribute('data-style') === key)
		);
		if (ctrl) ctrl.value = linked.value;
		applyDesignSettings();
	});
});

/* ── Logo upload: click on zone opens file picker ── */
if (dsLogoZone) {
	dsLogoZone.addEventListener('click', (e) => {
		// Don't trigger upload when clicking the remove button
		if (e.target === dsLogoRemoveBtn || (dsLogoRemoveBtn && dsLogoRemoveBtn.contains(/** @type {Node} */ (e.target)))) return;
		if (dsLogoFilledState && !dsLogoFilledState.hidden) return; // logo already set, only remove btn works
		dsLogoInput?.click();
	});
}

if (dsLogoInput) {
	dsLogoInput.addEventListener('change', () => {
		const file = dsLogoInput.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const url = typeof ev.target?.result === 'string' ? ev.target.result : '';
			if (!url) return;
			if (dsLogoImg) dsLogoImg.src = url;
			if (dsLogoName) dsLogoName.textContent = file.name;
			if (dsLogoEmptyState) dsLogoEmptyState.hidden = true;
			if (dsLogoFilledState) dsLogoFilledState.hidden = false;
			applyDesignSettings();
		};
		reader.readAsDataURL(file);
	});
}

/* ── Remove logo ── */
if (dsLogoRemoveBtn) {
	dsLogoRemoveBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		if (dsLogoImg) dsLogoImg.src = '';
		if (dsLogoName) dsLogoName.textContent = '';
		if (dsLogoEmptyState) dsLogoEmptyState.hidden = false;
		if (dsLogoFilledState) dsLogoFilledState.hidden = true;
		if (dsLogoInput) dsLogoInput.value = '';
		applyDesignSettings();
	});
}

/* ── Logo position ── */
dsPosBtns.forEach((btn) => {
	btn.addEventListener('click', () => {
		dsPosBtns.forEach((b) => b.classList.remove('is-active'));
		btn.classList.add('is-active');
		applyDesignSettings();
	});
});

document.querySelectorAll('[data-theme-preset]').forEach((btn) => {
	btn.addEventListener('click', () => {
		const key = btn.getAttribute('data-theme-preset') || '';
		const preset = THEME_PRESETS[key] || {};
		setDesignControls({ ...readDesignControls(), ...preset });
		if (darkToggle) darkToggle.checked = key === 'dark';
		applyDesignSettings();
	});
});

if (darkToggle) {
	darkToggle.addEventListener('change', () => {
		setDesignControls({
			...readDesignControls(),
			...(darkToggle.checked ? THEME_PRESETS.dark : THEME_PRESETS.minimal),
		});
		applyDesignSettings();
	});
}

if (exportThemeBtn) {
	exportThemeBtn.addEventListener('click', () => {
		const style = lastSurveySpec?.style || readDesignControls();
		if (themeJsonBox) themeJsonBox.value = JSON.stringify(style, null, 2);
		showToast('Theme JSON exported', 'success');
	});
}

if (importThemeBtn) {
	importThemeBtn.addEventListener('click', () => {
		try {
			const parsed = JSON.parse(themeJsonBox?.value || '{}');
			if (!parsed || typeof parsed !== 'object') throw new Error('Invalid theme JSON');
			setDesignControls(parsed);
			syncLogoControlsFromStyle(parsed);
			if (parsed.logoPosition) {
				dsPosBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-pos') === parsed.logoPosition));
			}
			applyDesignSettings();
			showToast('Theme imported', 'success');
		} catch (err) {
			showToast(err instanceof Error ? err.message : 'Invalid theme JSON', 'error');
		}
	});
}

if (saveThemeBtn) {
	saveThemeBtn.addEventListener('click', () => {
		const style = lastSurveySpec?.style || readDesignControls();
		localStorage.setItem(STORAGE_THEME, JSON.stringify(style));
		showToast('Theme saved in this browser', 'success');
	});
}

/* ── Reset Design ── */
if (resetDesignBtn) {
	resetDesignBtn.addEventListener('click', () => {
		setDesignControls(DS_DEFAULTS);
		if (dsLogoImg) dsLogoImg.src = '';
		if (dsLogoName) dsLogoName.textContent = '';
		if (dsLogoEmptyState) dsLogoEmptyState.hidden = false;
		if (dsLogoFilledState) dsLogoFilledState.hidden = true;
		if (dsLogoInput) dsLogoInput.value = '';
		dsPosBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-pos') === DS_DEFAULTS.logoPosition));
		if (lastSurveySpec) {
			lastSurveySpec = {
				...lastSurveySpec,
				style: { ...DS_DEFAULTS },
			};
			delete lastSurveySpec.style.logoUrl;
			const html = specToPreviewDocument(lastSurveySpec);
			lastHtml = html;
			setPreviewSrcdoc(html);
		}
		showToast('Design reset to defaults', 'default');
	});
}

try {
	const savedTheme = JSON.parse(localStorage.getItem(STORAGE_THEME) || 'null');
	if (savedTheme && typeof savedTheme === 'object') {
		setDesignControls(savedTheme);
		syncLogoControlsFromStyle(savedTheme);
		if (savedTheme.logoPosition) {
			dsPosBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-pos') === savedTheme.logoPosition));
		}
	}
} catch {
	setDesignControls(DS_DEFAULTS);
}

/**
 * Update local spec + sync iframe preview to current spec.
 */
function syncEditorAndPreview() {
	if (!editorCardsEl) return;
	const spec = lastSurveySpec ? normalizeSpec(lastSurveySpec) : { title: '', description: '', questions: [] };
	renderQuestionCards(editorCardsEl, spec);
	if (previewEl && spec.questions.length) {
		setPreviewSrcdoc(specToPreviewDocument(spec));
	}
	updateSurveyDetailsVisibility();
	updateSaveFormButtonState();
}

function switchBuilderTab(name) {
	builderTabs.forEach((btn) => {
		const active = btn.getAttribute('data-builder-tab') === name;
		btn.classList.toggle('is-active', active);
		btn.setAttribute('aria-selected', active ? 'true' : 'false');
	});
	if (editorPane) editorPane.hidden = name !== 'edit';
	if (previewPane) previewPane.hidden = name !== 'preview';
}

builderTabs.forEach((btn) => {
	btn.addEventListener('click', () => {
		switchBuilderTab(btn.getAttribute('data-builder-tab') || 'edit');
	});
});
switchBuilderTab('preview');

/* ─────────────────────────────────────────────
   "EDIT WITH AI" BUTTON AND MODAL
───────────────────────────────────────────── */
if (editWithAiBtn) {
	editWithAiBtn.addEventListener('click', () => {
		if (aiEditModal) {
			aiEditModal.hidden = false;
			if (aiInput) aiInput.focus();
		}
	});
}

if (aiEditModalCloseBtn) {
	aiEditModalCloseBtn.addEventListener('click', () => {
		if (aiEditModal) aiEditModal.hidden = true;
	});
}

/* Close modal on Escape key */
if (aiEditModal) {
	aiEditModal.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') aiEditModal.hidden = true;
	});
}

/**
 * Open the edit modal seeded from a question (or blank for new).
 *
 * @param {string|null} qid  null = new question
 */
function openEditModal(qid) {
	if (!editModal || !lastSurveySpec) return;
	currentEditId = qid;
	const question =
		qid && Array.isArray(lastSurveySpec.questions)
			? lastSurveySpec.questions.find((q) => q.id === qid)
			: null;

	editIdInput.value = qid || '';
	editText.value = question?.question || '';
	editType.value = question?.type || 'text';
	editPlaceholder.value = question?.placeholder || '';
	editRequired.checked = Boolean(question?.required);

	renderEditOptions(question?.options || []);
	const v = question?.validation || {};
	editMinLength.value = v.minLength ?? '';
	editMaxLength.value = v.maxLength ?? '';
	editMin.value = v.min ?? '';
	editMax.value = v.max ?? '';
	editPattern.value = v.pattern ?? '';
	editAccept.value = v.accept ?? '';

	updateEditModalVisibility();
	editModal.hidden = false;
	setTimeout(() => editText.focus(), 50);
}

function closeEditModal() {
	if (editModal) editModal.hidden = true;
	currentEditId = null;
}

function renderEditOptions(options) {
	if (!editOptionsList) return;
	editOptionsList.innerHTML = '';
	const items = Array.isArray(options) && options.length ? options : [''];
	items.forEach((opt) => editOptionsList.appendChild(createOptionRow(opt)));
}

function createOptionRow(value) {
	const row = document.createElement('div');
	row.className = 'editor-modal-options__row';
	row.innerHTML = `
		<input type="text" class="input-control" value="${String(value).replace(/"/g, '&quot;')}" placeholder="Option text" />
		<button type="button" class="btn btn--ghost btn--small" aria-label="Remove option">✕</button>
	`;
	row.querySelector('button')?.addEventListener('click', () => row.remove());
	return row;
}

function collectEditOptions() {
	if (!editOptionsList) return [];
	return Array.from(editOptionsList.querySelectorAll('input'))
		.map((inp) => inp.value.trim())
		.filter((v) => v.length > 0);
}

function updateEditModalVisibility() {
	const t = editType?.value || 'text';
	const showOptions = t === 'select' || t === 'radio' || t === 'checkbox';
	if (editOptionsWrap) editOptionsWrap.hidden = !showOptions;

	const visibility = {
		minLength: ['text', 'textarea', 'email'].includes(t),
		maxLength: ['text', 'textarea', 'email'].includes(t),
		min: ['number', 'date'].includes(t),
		max: ['number', 'date'].includes(t),
		pattern: ['text', 'email'].includes(t),
		accept: t === 'file',
	};
	validationRows.forEach((row) => {
		const key = row.getAttribute('data-validation-row');
		row.hidden = !visibility[key];
	});
}

if (editType) {
	editType.addEventListener('change', updateEditModalVisibility);
}

if (editAddOptionBtn && editOptionsList) {
	editAddOptionBtn.addEventListener('click', () => {
		editOptionsList.appendChild(createOptionRow(''));
		const inputs = editOptionsList.querySelectorAll('input');
		inputs[inputs.length - 1]?.focus();
	});
}

if (editCancelBtn) {
	editCancelBtn.addEventListener('click', closeEditModal);
}

if (editModal) {
	editModal.addEventListener('click', (ev) => {
		if (ev.target === editModal) closeEditModal();
	});
}

if (editForm) {
	editForm.addEventListener('submit', (ev) => {
		ev.preventDefault();
		if (!lastSurveySpec) {
			closeEditModal();
			return;
		}
		const text = editText.value.trim();
		if (!text) {
			showToast('Question text is required', 'error');
			editText.focus();
			return;
		}
		const type = editType.value;
		const required = editRequired.checked;
		const placeholder = editPlaceholder.value.trim();
		const options = collectEditOptions();
		const validation = {
			minLength: editMinLength.value !== '' ? Number(editMinLength.value) : undefined,
			maxLength: editMaxLength.value !== '' ? Number(editMaxLength.value) : undefined,
			min: editMin.value !== '' ? Number(editMin.value) : undefined,
			max: editMax.value !== '' ? Number(editMax.value) : undefined,
			pattern: editPattern.value.trim() || undefined,
			accept: editAccept.value.trim() || undefined,
		};
		Object.keys(validation).forEach((k) => {
			if (validation[k] === undefined || Number.isNaN(validation[k])) {
				delete validation[k];
			}
		});

		const updated = {
			question: text,
			type,
			required,
			placeholder: placeholder || undefined,
			options: ['select', 'radio', 'checkbox'].includes(type) ? options : [],
			validation,
		};

		if (currentEditId) {
			const idx = lastSurveySpec.questions.findIndex((q) => q.id === currentEditId);
			if (idx >= 0) {
				lastSurveySpec.questions[idx] = { ...lastSurveySpec.questions[idx], ...updated };
			}
		} else {
			const newQ = { id: nextLocalId(), ...updated };
			lastSurveySpec.questions = [...(lastSurveySpec.questions || []), newQ];
		}

		closeEditModal();
		syncEditorAndPreview();
		showToast(currentEditId ? 'Question updated' : 'Question added', 'success');
	});
}

/* ----- Card actions: edit / delete / move / drag-drop ----- */

function moveQuestion(idx, delta) {
	if (!lastSurveySpec || !Array.isArray(lastSurveySpec.questions)) return;
	const list = lastSurveySpec.questions;
	const target = idx + delta;
	if (target < 0 || target >= list.length) return;
	const [moved] = list.splice(idx, 1);
	list.splice(target, 0, moved);
	syncEditorAndPreview();
}

function requestDelete(qid) {
	if (!deleteModal) return;
	pendingDeleteId = qid;
	deleteModal.hidden = false;
}

function performDelete() {
	if (!lastSurveySpec || !pendingDeleteId) {
		if (deleteModal) deleteModal.hidden = true;
		return;
	}
	lastSurveySpec.questions = (lastSurveySpec.questions || []).filter((q) => q.id !== pendingDeleteId);
	pendingDeleteId = null;
	if (deleteModal) deleteModal.hidden = true;
	syncEditorAndPreview();
	showToast('Question deleted', 'success');
}

if (deleteCancelBtn) {
	deleteCancelBtn.addEventListener('click', () => {
		pendingDeleteId = null;
		if (deleteModal) deleteModal.hidden = true;
	});
}

if (deleteConfirmBtn) {
	deleteConfirmBtn.addEventListener('click', performDelete);
}

if (deleteModal) {
	deleteModal.addEventListener('click', (ev) => {
		if (ev.target === deleteModal) {
			pendingDeleteId = null;
			deleteModal.hidden = true;
		}
	});
}

if (editorCardsEl) {
	editorCardsEl.addEventListener('click', (ev) => {
		const btn = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target.closest('[data-action]') : null);
		if (!btn) return;
		const card = btn.closest('.editor-card');
		if (!card) return;
		const idx = Number(card.getAttribute('data-index'));
		if (!lastSurveySpec || Number.isNaN(idx)) return;
		const q = lastSurveySpec.questions?.[idx];
		if (!q) return;
		const action = btn.getAttribute('data-action');
		if (action === 'up') moveQuestion(idx, -1);
		else if (action === 'down') moveQuestion(idx, +1);
		else if (action === 'edit') openEditModal(q.id);
		else if (action === 'delete') requestDelete(q.id);
	});

	/** @type {string | null} */
	let dragFromId = null;
	editorCardsEl.addEventListener('dragstart', (ev) => {
		const card = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target.closest('.editor-card') : null);
		if (!card || !lastSurveySpec) return;
		const idx = Number(card.getAttribute('data-index'));
		dragFromId = lastSurveySpec.questions?.[idx]?.id || null;
		card.classList.add('is-dragging');
		ev.dataTransfer?.setData('text/plain', dragFromId || '');
		if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
	});
	editorCardsEl.addEventListener('dragend', () => {
		editorCardsEl.querySelectorAll('.editor-card').forEach((c) => {
			c.classList.remove('is-dragging', 'is-drop-target');
		});
		dragFromId = null;
	});
	editorCardsEl.addEventListener('dragover', (ev) => {
		ev.preventDefault();
		const card = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target.closest('.editor-card') : null);
		editorCardsEl.querySelectorAll('.editor-card').forEach((c) => c.classList.remove('is-drop-target'));
		if (card) card.classList.add('is-drop-target');
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
	});
	editorCardsEl.addEventListener('drop', (ev) => {
		ev.preventDefault();
		if (!lastSurveySpec || !dragFromId) return;
		const card = /** @type {HTMLElement|null} */ (ev.target instanceof Element ? ev.target.closest('.editor-card') : null);
		if (!card) return;
		const toIdx = Number(card.getAttribute('data-index'));
		const fromIdx = lastSurveySpec.questions.findIndex((q) => q.id === dragFromId);
		if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
		const list = lastSurveySpec.questions;
		const [moved] = list.splice(fromIdx, 1);
		list.splice(toIdx, 0, moved);
		dragFromId = null;
		syncEditorAndPreview();
	});
}

if (addQuestionBtn) {
	addQuestionBtn.addEventListener('click', () => {
		if (!lastSurveySpec) {
			lastSurveySpec = { title: '', description: '', questions: [] };
		}
		openEditModal(null);
	});
}

if (aiBtn) {
	aiBtn.addEventListener('click', async () => {
		if (!aiInput) return;
		const instruction = aiInput.value.trim();
		if (!instruction) {
			showToast('Describe what to change', 'error');
			aiInput.focus();
			return;
		}
		if (!lastSurveySpec) {
			showToast('Generate a form first', 'error');
			return;
		}
		aiBtn.disabled = true;
		setLoading(true, 'Updating form with AI…');
		try {
			const currentSpec = toLlmSpec(normalizeSpec(lastSurveySpec));
			const llmPrompt = [
				`Update the survey based on this instruction:`,
				instruction,
				'',
				'Return the full updated survey JSON (title, description, questions[]) only.',
				'',
				'Current survey JSON:',
				JSON.stringify(currentSpec, null, 2),
			].join('\n');

			const res = await fetch(`${getApiBase()}/api/builder/generate-survey-json`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: llmPrompt, messages: [], htmlSample: '', }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok || !data.survey) {
				throw new Error(data.error || 'AI update failed');
			}
			lastSurveySpec = normalizeSpec(data.survey);
			aiInput.value = '';
			syncEditorAndPreview();
			showToast('Form updated with AI', 'success');
			if (aiEditModal) aiEditModal.hidden = true;
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'AI update failed';
			showToast(msg, 'error');
		} finally {
			aiBtn.disabled = false;
			setLoading(false, 'Generating your form…');
		}
	});
}

/**
 * Save Form is enabled only when HTML + survey JSON exist and required survey details are filled.
 */
function updateSaveFormButtonState() {
	if (!saveFormBtn) return;
	const hasForm = Boolean(lastHtml && lastHtml.trim());
	const hasSpec = Boolean(lastSurveySpec && Array.isArray(lastSurveySpec.questions) && lastSurveySpec.questions.length);
	const titleOk = surveyTitleInput ? surveyTitleInput.value.trim().length > 0 : false;
	const descOk = surveyDescriptionInput ? surveyDescriptionInput.value.trim().length > 0 : false;
	saveFormBtn.disabled = !(hasForm && hasSpec && titleOk && descOk);
}

[surveyTitleInput, surveyDescriptionInput].forEach((el) => {
	if (el) {
		el.addEventListener('input', () => updateSaveFormButtonState());
	}
});

function applySourceCollapsed(collapsed) {
	if (!sourceSubpanel || !sourceToggle) return;
	sourceSubpanel.classList.toggle('is-collapsed', collapsed);
	sourceToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
	sourceToggle.textContent = collapsed ? 'Show source' : 'Hide source';
	try {
		if (collapsed) {
			sessionStorage.removeItem(STORAGE_SOURCE_EXPANDED);
		} else {
			sessionStorage.setItem(STORAGE_SOURCE_EXPANDED, '1');
		}
	} catch {
		/* ignore */
	}
}

function restoreSourceCollapsed() {
	let expanded = false;
	try {
		expanded = sessionStorage.getItem(STORAGE_SOURCE_EXPANDED) === '1';
	} catch {
		/* default hidden */
	}
	applySourceCollapsed(!expanded);
}

if (sourceToggle && sourceSubpanel) {
	sourceToggle.addEventListener('click', () => {
		const collapsed = !sourceSubpanel.classList.contains('is-collapsed');
		applySourceCollapsed(collapsed);
	});
}

restoreSourceCollapsed();

function saveConversation() {
	try {
		localStorage.setItem(STORAGE_CONVERSATION, JSON.stringify(conversation));
	} catch {
		showToast('Could not save conversation', 'error');
	}
}

function loadConversation() {
	try {
		const raw = localStorage.getItem(STORAGE_CONVERSATION);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			conversation = parsed.filter(
				(m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
			);
		}
	} catch {
		conversation = [];
	}
}

function savePromptToHistory(text) {
	if (!text) return;
	try {
		let list = [];
		const raw = localStorage.getItem(STORAGE_PROMPTS);
		if (raw) list = JSON.parse(raw);
		if (!Array.isArray(list)) list = [];
		list = list.filter((p) => p !== text);
		list.unshift(text);
		list = list.slice(0, MAX_PROMPT_HISTORY);
		localStorage.setItem(STORAGE_PROMPTS, JSON.stringify(list));
		renderPromptHistory();
	} catch {
		/* ignore */
	}
}

function renderPromptHistory() {
	promptHistoryEl.innerHTML = '';
	try {
		const raw = localStorage.getItem(STORAGE_PROMPTS);
		const list = raw ? JSON.parse(raw) : [];
		if (!Array.isArray(list) || list.length === 0) {
			const empty = document.createElement('p');
			empty.className = 'muted small';
			empty.textContent = 'No saved prompts yet.';
			promptHistoryEl.appendChild(empty);
			return;
		}
		list.forEach((p) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'chip';
			btn.textContent = p.length > 48 ? `${p.slice(0, 45)}…` : p;
			btn.title = p;
			btn.addEventListener('click', () => {
				promptInput.value = p;
				promptInput.focus();
			});
			promptHistoryEl.appendChild(btn);
		});
	} catch {
		promptHistoryEl.innerHTML = '';
	}
}

function highlightCode(htmlSource) {
	codeBlock.textContent = htmlSource;
	codeBlock.className = 'language-html';
	if (typeof Prism !== 'undefined') {
		Prism.highlightElement(codeBlock);
	}
}

function parseErrorResponse(res, textBody) {
	try {
		const j = JSON.parse(textBody);
		if (j && j.error) return j.error;
	} catch {
		/* ignore */
	}
	if (res.status === 413) return 'Request too large. Try clearing history or shorter prompts.';
	if (res.status === 429) return 'Rate limited. Please wait and try again.';
	if (res.status >= 500) return 'Server error. Check API key and try again.';
	return textBody || `Request failed (${res.status})`;
}

async function loadCompanies() {
	if (!companySelect) return;
	companySelect.innerHTML = '<option value="">Loading companies…</option>';
	const apiBase = getApiBase();
	const url = `${apiBase}/api/builder/companies`.replace(/([^:])\/{2,}/g, '$1/');
	try {
		const res = await fetch(url);
		const text = await res.text();
		let data = {};
		try {
			data = text ? JSON.parse(text) : {};
		} catch {
			throw new Error(
				`Companies response was not JSON (${res.status}). ` +
					(apiBase
						? `Open ${url} in the browser or check the API server.`
						: 'If you use Apache/XAMPP, start Node (npm run server or npm run dev) or set <meta name="app-api-base" content="http://127.0.0.1:YOUR_PORT">.')
			);
		}
		if (!res.ok || !data.ok) {
			throw new Error(data.error || `Failed to load companies (${res.status})`);
		}
		companySelect.innerHTML = '<option value="">Select company</option>';
		for (const c of data.companies || []) {
			const opt = document.createElement('option');
			opt.value = c.company_id;
			let label = c.name || 'Company';
			if (c.tier) {
				label += ` (${c.tier})`;
			}
			const meta = [c.industry, c.region].filter(Boolean).join(', ');
			if (meta) {
				label += ` — ${meta}`;
			}
			opt.textContent = label;
			companySelect.appendChild(opt);
		}
	} catch (e) {
		companySelect.innerHTML = '<option value="">No companies (add one)</option>';
		const msg = e instanceof Error ? e.message : 'Companies unavailable';
		showToast(msg, 'error');
	}
}

/**
 * Save user prompt + LLM HTML to public.submissions via API (message, result columns).
 *
 * @param {string} prompt
 * @param {string} html
 */
async function saveGenerationToSubmissions(prompt, html) {
	const res = await fetch(`${getApiBase()}/api/builder/submissions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			message: prompt,
			result: html,
		}),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok) {
		throw new Error(data.error || `Could not save submission (${res.status})`);
	}
	return data.submission;
}

/**
 * Kept for backwards-compatibility (called from AI-edit tab and older code paths).
 * Now sends no htmlSample to avoid sending large HTML back to Claude.
 * @param {string} prompt
 */
async function fetchSurveyJsonAfterGenerate(prompt) {
	const res = await fetch(`${getApiBase()}/api/builder/generate-survey-json`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			prompt,
			// Truncate history and send no htmlSample to stay under rate limits
			messages: conversation.slice(-4).map((m) => ({
				role: m.role,
				content:
					typeof m.content === 'string' && m.content.length > 1500
						? `${m.content.slice(0, 1500)}\n…(truncated)`
						: m.content,
			})),
			htmlSample: '',
		}),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok || !data.ok || !data.survey) {
		lastSurveySpec = null;
		updateSurveyDetailsVisibility();
		const err = data.error || 'Could not build survey JSON';
		showToast(`${err} — you can still copy HTML; fix prompt and regenerate.`, 'error');
		return;
	}
	lastSurveySpec = normalizeSpec(data.survey);
	updateSurveyDetailsVisibility();
	if (surveyTitleInput && !surveyTitleInput.value.trim() && typeof data.survey.title === 'string') {
		surveyTitleInput.value = data.survey.title.trim();
	}
	if (surveyDescriptionInput && !surveyDescriptionInput.value.trim()) {
		const d = typeof data.survey.description === 'string' ? data.survey.description.trim() : '';
		surveyDescriptionInput.value = d;
	}
	updateSaveFormButtonState();
	syncEditorAndPreview();
	showToast('Survey data ready — edit questions, then Save Form', 'success');
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} message
 * @param {'default'|'error'|'success'} [variant]
 */
function setDocUploadStatus(message, variant = 'default') {
	if (!docUploadStatus) {
		return;
	}
	docUploadStatus.textContent = message;
	docUploadStatus.classList.remove('doc-upload-status--error', 'doc-upload-status--success');
	if (variant === 'error') {
		docUploadStatus.classList.add('doc-upload-status--error');
	}
	if (variant === 'success') {
		docUploadStatus.classList.add('doc-upload-status--success');
	}
}

function clearUploadedDocument() {
	uploadedDocumentText = '';
	uploadedFileName = '';
	uploadedDocxMatrices = [];
	if (docUploadInput) {
		docUploadInput.value = '';
	}
	if (docUploadChip) {
		docUploadChip.hidden = true;
	}
	setDocUploadStatus('');
}

/**
 * @param {File} file
 */
async function handleUploadedFile(file) {
	setDocUploadStatus('Reading file…');
	try {
		const result = await extractTextFromFile(file);
		// extractTextFromFile now always returns { text, matrices }
		const text = typeof result === 'string' ? result : (result.text || '');
		const matrices = typeof result === 'object' && result.matrices ? result.matrices : [];
		if (!text) {
			throw new Error('No readable text found in this file.');
		}
		uploadedDocumentText = text;
		uploadedFileName = file.name;
		uploadedDocxMatrices = matrices;
		if (matrices.length) {
			console.log('[app] Pre-detected DOCX matrices:', matrices.length, matrices);
		}
		if (docUploadChip && docUploadChipName && docUploadChipMeta) {
			docUploadChipName.textContent = file.name;
			docUploadChipMeta.textContent = formatFileSize(file.size);
			docUploadChip.hidden = false;
		}
		const matrixNote = matrices.length ? ` (${matrices.length} matrix question${matrices.length > 1 ? 's' : ''} detected)` : '';
		setDocUploadStatus(
			`Loaded ${text.length.toLocaleString()} characters from document.${matrixNote}`,
			'success'
		);
		showToast('Document ready — click Generate', 'success');
	} catch (err) {
		clearUploadedDocument();
		const msg = err instanceof Error ? err.message : 'Could not read file';
		setDocUploadStatus(msg, 'error');
		showToast(msg, 'error');
	}
}

function initDocumentUpload() {
	if (!docUploadZone || !docUploadInput) {
		return;
	}

	const openPicker = () => docUploadInput.click();

	docUploadZone.addEventListener('click', () => openPicker());
	docUploadZone.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openPicker();
		}
	});

	docUploadInput.addEventListener('change', () => {
		const file = docUploadInput.files?.[0];
		if (file) {
			handleUploadedFile(file);
		}
	});

	docUploadZone.addEventListener('dragover', (e) => {
		e.preventDefault();
		docUploadZone.classList.add('is-dragover');
	});
	docUploadZone.addEventListener('dragleave', () => {
		docUploadZone.classList.remove('is-dragover');
	});
	docUploadZone.addEventListener('drop', (e) => {
		e.preventDefault();
		docUploadZone.classList.remove('is-dragover');
		const file = e.dataTransfer?.files?.[0];
		if (file) {
			handleUploadedFile(file);
		}
	});

	if (docUploadRemove) {
		docUploadRemove.addEventListener('click', (e) => {
			e.stopPropagation();
			clearUploadedDocument();
			showToast('Document removed', 'default');
		});
	}
}

initDocumentUpload();

generateBtn.addEventListener('click', async () => {
	const manualPrompt = promptInput.value.trim();
	const prompt = buildEffectivePrompt(manualPrompt, uploadedDocumentText, uploadedFileName, uploadedDocxMatrices);

	/* ── Debug: confirm both inputs are merged ── */
	console.log('──── Form Generation Debug ────');
	console.log('DOCX content (first 300):', uploadedDocumentText
		? uploadedDocumentText.slice(0, 300) + (uploadedDocumentText.length > 300 ? '…' : '')
		: '(none)');
	console.log('User Prompt:', manualPrompt || '(none)');
	console.log('Final prompt length (chars):', prompt.length);
	console.log('───────────────────────────────');

	if (!prompt) {
		setError('Enter a prompt or upload a .txt, .docx, or .pdf file.');
		showToast('Add a prompt or upload a document', 'error');
		return;
	}

	setError('');
	setSuccessBanner('');
	lastSurveySpec = null;
	updateSurveyDetailsVisibility();
	updateSaveFormButtonState();
	setLoading(true, 'Generating survey schema…');
	copyBtn.disabled = true;
	downloadBtn.disabled = true;

	try {
		/*
		 * JSON-first generation: ask for a compact survey JSON schema instead of
		 * generating a full HTML page. This avoids the huge system prompt + HTML
		 * output that was triggering the 30k tokens/min rate limit (429 errors).
		 * The frontend renders the preview from the JSON spec via renderSurveyHtml.
		 */
		const res = await fetch(`${getApiBase()}/api/builder/generate-survey-json`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt,
				// No conversation history for initial generation — keeps tokens low.
				// History is only useful for follow-up edits via the AI Edit tab.
				messages: [],
				htmlSample: '',
			}),
		});

		const data = await res.json().catch(() => ({}));

		if (!res.ok || !data.ok || !data.survey) {
			const errMsg = data.error || (res.status === 429
				? 'Rate limited — please wait a moment and try again.'
				: `Generation failed (${res.status})`);
			throw new Error(errMsg);
		}

		/* ── Build spec + render preview from it ── */
		lastSurveySpec = normalizeSpec(data.survey);

		// Client-side style guarantee: parse colours/logo from the raw typed prompt
		// and merge them into the spec.
		// PRIORITY: user's typed prompt ALWAYS wins — it is the explicit instruction.
		// AI-returned style only fills in fields the user did NOT mention.
		const clientStyle = parseStyleFromPrompt(manualPrompt);
		{
			// Start with whatever Claude returned (may be partial or empty)
			const aiStyle = (lastSurveySpec.style && typeof lastSurveySpec.style === 'object')
				? lastSurveySpec.style : {};
			// User's client-extracted style overrides the AI on any field it specifies
			const merged = { ...aiStyle, ...clientStyle };
			if (Object.keys(merged).length > 0) {
				lastSurveySpec = { ...lastSurveySpec, style: merged };
				console.log('[Style] client extracted →', clientStyle, '| AI →', aiStyle, '| merged →', merged);
			}
		}

		// Render HTML from the spec (handles rating, matrix_rating, etc. natively)
		const previewHtml = specToPreviewDocument(lastSurveySpec);
		lastHtml = previewHtml;

		/* ── Save to conversation (compact — JSON not HTML) ── */
		conversation.push({ role: 'user', content: prompt.slice(0, 2000) });
		conversation.push({ role: 'assistant', content: JSON.stringify(data.survey).slice(0, 3000) });
		saveConversation();
		savePromptToHistory(prompt);

		/* ── Update UI ── */
		highlightCode(lastHtml);
		setPreviewSrcdoc(lastHtml);
		copyBtn.disabled = false;
		downloadBtn.disabled = false;

		if (surveyTitleInput && !surveyTitleInput.value.trim() && typeof data.survey.title === 'string') {
			surveyTitleInput.value = data.survey.title.trim();
		}
		if (surveyDescriptionInput && !surveyDescriptionInput.value.trim()) {
			const d = typeof data.survey.description === 'string' ? data.survey.description.trim() : '';
			surveyDescriptionInput.value = d;
		}

		updateSurveyDetailsVisibility();
		updateSaveFormButtonState();
		syncEditorAndPreview();
		syncDesignPanelFromSpec();     // reflect generated style in Design Settings panel
		switchBuilderTab('preview');   // show the rendered form immediately
		showToast('Survey generated — edit questions or save', 'success');

		/* ── Save to submissions (non-blocking) ── */
		setLoading(true, 'Saving…');
		try {
			await saveGenerationToSubmissions(prompt, lastHtml);
			setSuccessBanner('Survey generated and saved.');
		} catch (saveErr) {
			const saveMsg = saveErr instanceof Error ? saveErr.message : 'Save failed';
			showToast(`Submissions save failed: ${saveMsg}`, 'error');
			const client = await resolveSupabase();
			if (client) {
				try {
					const { data: sessionData } = await client.auth.getSession();
					if (sessionData.session) {
						await insertSubmission(client, { message: prompt, result: lastHtml });
						setSuccessBanner('Saved via Supabase (submissions).');
					}
				} catch {
					/* already surfaced API error */
				}
			}
		}

		promptInput.value = '';
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Something went wrong';
		setError(msg);
		showToast(msg, 'error');
	} finally {
		setLoading(false, 'Generating your form…');
	}
});

if (saveFormBtn) {
	saveFormBtn.addEventListener('click', async () => {
		const companyId = companySelect ? companySelect.value : '';
		if (!companyId) {
			showToast('Select a company first', 'error');
			return;
		}
		if (!lastSurveySpec) {
			showToast('Generate a form first (survey JSON missing)', 'error');
			return;
		}
		if (!lastHtml || !String(lastHtml).trim()) {
			showToast('Generate a form preview first', 'error');
			return;
		}
		const surveyTitle = surveyTitleInput ? surveyTitleInput.value.trim() : '';
		const surveyDescription = surveyDescriptionInput ? surveyDescriptionInput.value.trim() : '';
		if (!surveyTitle) {
			showToast('Survey title is required', 'error');
			surveyTitleInput?.focus();
			return;
		}
		if (!surveyDescription) {
			showToast('Survey description is required', 'error');
			surveyDescriptionInput?.focus();
			return;
		}
		const status = surveyStatusSelect ? surveyStatusSelect.value : 'draft';
		const maxSubmissions =
			maxSubmissionsInput && maxSubmissionsInput.value.trim()
				? parseInt(maxSubmissionsInput.value.trim(), 10)
				: null;
		// Always render fresh HTML + CSS from the editable spec so the saved form
		// reflects any edits (manual or AI) made after the original LLM HTML.
		const editorSpec = normalizeSpec(lastSurveySpec);
		const { buildFormParts } = await import('./modules/renderSurveyHtml.js');
		const { formHtml: rawFormHtml, formCss } = buildFormParts(editorSpec);

		// Add data-survey-slot="0/1/2…" to each field so the server's
		// bindQuestionFieldsToHtml() can rebind them to the real DB question_ids.
		// Without this, the iframe bridge collects answers keyed by editor UUIDs
		// which never match the DB question_ids → validation always fails.
		const { formHtml } = prepareFormHtmlForSave(rawFormHtml, editorSpec.questions);
		// Send editor types directly; backend mapQuestionType() handles
		// text/email/number/textarea/select/radio/checkbox/date → DB enum.
		const surveyPayload = {
			...editorSpec,
			title: surveyTitle,
			description: surveyDescription,
			maxSubmissions: maxSubmissions && maxSubmissions > 0 ? maxSubmissions : null,
		};
		saveFormBtn.disabled = true;
		setLoading(true, 'Saving survey…');
		try {
			const res = await fetch(`${getApiBase()}/api/builder/surveys/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					companyId,
					status,
					maxSubmissions: surveyPayload.maxSubmissions,
					formHtml,
					formCss,
					survey: surveyPayload,
				}),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				throw new Error(data.error || 'Save failed');
			}
			const surveyId = data.surveyId;
			const url = new URL('/form', window.location.href);
			url.searchParams.set('survey', surveyId);
			const publicUrl = url.href;
			if (publicUrlInput) publicUrlInput.value = publicUrl;
			if (saveModal) saveModal.hidden = false;
			showToast('Survey saved', 'success');
			setSuccessBanner('Survey saved. Share the public link below.');
			await loadCompanies();
			if (companySelect) companySelect.value = companyId;
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Save failed';
			showToast(msg, 'error');
			setError(msg);
		} finally {
			updateSaveFormButtonState();
			setLoading(false, 'Generating your form…');
		}
	});
}

if (copyPublicUrlBtn && publicUrlInput) {
	copyPublicUrlBtn.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(publicUrlInput.value);
			showToast('URL copied', 'success');
		} catch {
			showToast('Copy failed', 'error');
		}
	});
}

if (openPublicFormBtn && publicUrlInput) {
	openPublicFormBtn.addEventListener('click', () => {
		window.open(publicUrlInput.value, '_blank', 'noopener,noreferrer');
	});
}

if (closeSaveModalBtn && saveModal) {
	closeSaveModalBtn.addEventListener('click', () => {
		saveModal.hidden = true;
	});
	saveModal.addEventListener('click', (ev) => {
		if (ev.target === saveModal) {
			saveModal.hidden = true;
		}
	});
}

copyBtn.addEventListener('click', async () => {
	if (!lastHtml) return;
	try {
		await navigator.clipboard.writeText(lastHtml);
		showToast('Code copied', 'success');
	} catch {
		showToast('Copy failed', 'error');
	}
});

downloadBtn.addEventListener('click', () => {
	if (!lastHtml) return;
	const blob = new Blob([lastHtml], { type: 'text/html;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'generated-form.html';
	a.click();
	URL.revokeObjectURL(url);
	showToast('Download started', 'success');
});

clearBtn.addEventListener('click', () => {
	conversation = [];
	lastHtml = '';
	lastSurveySpec = null;
	clearUploadedDocument();
	if (surveyTitleInput) surveyTitleInput.value = '';
	if (surveyDescriptionInput) surveyDescriptionInput.value = '';
	if (surveyStatusSelect) surveyStatusSelect.value = 'draft';
	updateSurveyDetailsVisibility();
	saveConversation();
	codeBlock.textContent = '';
	codeBlock.className = 'language-html';
	previewEl.removeAttribute('srcdoc');
	if (editorCardsEl) renderQuestionCards(editorCardsEl, { title: '', description: '', questions: [] });
	copyBtn.disabled = true;
	downloadBtn.disabled = true;
	setError('');
	setSuccessBanner('');
	updateSaveFormButtonState();
	showToast('Conversation cleared', 'default');
});

loadConversation();
renderPromptHistory();
loadCompanies();
updateSurveyDetailsVisibility();
updateSaveFormButtonState();
syncEditorAndPreview();

if (conversation.length > 0) {
	let lastAssistant = null;
	for (let i = conversation.length - 1; i >= 0; i -= 1) {
		if (conversation[i].role === 'assistant') {
			lastAssistant = conversation[i].content;
			break;
		}
	}
	if (lastAssistant) {
		/*
		 * The assistant message is either:
		 *  • New format: compact JSON survey spec (saved since JSON-first refactor)
		 *  • Old format: full HTML string (saved before the refactor)
		 *
		 * Try JSON first; fall back to HTML for backward compatibility.
		 */
		let restoredFromSpec = false;
		if (lastAssistant.trim().startsWith('{')) {
			try {
				const surveyData = JSON.parse(lastAssistant);
				if (surveyData && typeof surveyData.title === 'string' && Array.isArray(surveyData.questions)) {
					lastSurveySpec = normalizeSpec(surveyData);
					lastHtml = specToPreviewDocument(lastSurveySpec);
					highlightCode(lastHtml);
					setPreviewSrcdoc(lastHtml);
					copyBtn.disabled = false;
					downloadBtn.disabled = false;
					syncEditorAndPreview();
					restoredFromSpec = true;
				}
			} catch {
				/* Not valid JSON — fall through to HTML path */
			}
		}
		if (!restoredFromSpec) {
			/* Old format: treat the stored content as raw HTML */
			lastHtml = lastAssistant;
			highlightCode(lastHtml);
			setPreviewSrcdoc(lastHtml);
			copyBtn.disabled = false;
			downloadBtn.disabled = false;
			lastSurveySpec = null;
			updateSaveFormButtonState();
		}
	}
}

// Load form by ID if formId parameter is present in URL
async function loadFormById() {
	const params = new URLSearchParams(window.location.search);
	const formId = params.get('formId');
	if (!formId) return;

	try {
		setLoading(true, 'Loading form…');
		const apiBase = getApiBase();
		const res = await fetch(`${apiBase}/api/builder/surveys/${encodeURIComponent(formId)}`, {
			headers: { 'Content-Type': 'application/json' },
		});
		const data = await res.json();
		if (!res.ok || !data.ok || !data.survey) {
			throw new Error(data.error || 'Failed to load form');
		}

		const survey = data.survey;
		const questions = data.questions || [];

		// Build the survey spec from loaded data
		const spec = {
			title: survey.name || '',
			description: survey.description || '',
			questions: questions.map((q) => {
				const opts = q.options_json && typeof q.options_json === 'object' ? q.options_json : {};
				return {
					id: q.question_id,
					text: q.question_text,
					type: q.type,
					required: Boolean(opts.required),
					options: Array.isArray(opts.options) ? opts.options : [],
					options_json: opts,
					placeholder: q.placeholder || '',
					validation_rules: q.validation_rules || {},
					...q
				};
			}),
			style: (survey.style_json && typeof survey.style_json === 'object')
				? survey.style_json
				: (survey.style || {}),
		};

		lastSurveySpec = normalizeSpec(spec);
		lastHtml = specToPreviewDocument(lastSurveySpec);
		highlightCode(lastHtml);
		setPreviewSrcdoc(lastHtml);
		copyBtn.disabled = false;
		downloadBtn.disabled = false;
		syncEditorAndPreview();

		if (surveyTitleInput) surveyTitleInput.value = survey.name || '';
		if (surveyDescriptionInput) surveyDescriptionInput.value = survey.description || '';
		if (surveyStatusSelect) surveyStatusSelect.value = survey.status || 'draft';
		if (maxSubmissionsInput && survey.max_submissions) {
			maxSubmissionsInput.value = String(survey.max_submissions);
		}

		updateSurveyDetailsVisibility();
		updateSaveFormButtonState();

		showToast('Form loaded', 'success');
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Failed to load form';
		showToast(msg, 'error');
		setError(msg);
	} finally {
		setLoading(false, 'Generating your form…');
	}
}

loadFormById();
