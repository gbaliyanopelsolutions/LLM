/**
 * Survey editor state + question card renderer (Edit Form tab).
 */

import { buildPreviewDocument, dbTypeToEditorType, fieldTypeLabel, escapeHtml } from './renderSurveyHtml.js';

/** @typedef {import('./renderSurveyHtml.js').EditorQuestion} EditorQuestion */
/** @typedef {import('./renderSurveyHtml.js').EditorSpec} EditorSpec */

/** @type {EditorSpec} */
const emptySpec = { title: '', description: '', questions: [] };

/**
 * @returns {string}
 */
export function nextLocalId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalise an LLM survey spec or DB row into editor questions.
 *
 * @param {unknown} raw
 * @returns {EditorSpec}
 */
export function normalizeSpec(raw) {
	if (!raw || typeof raw !== 'object') {
		return { ...emptySpec, questions: [] };
	}
	const obj = /** @type {Record<string, unknown>} */ (raw);
	const title = typeof obj.title === 'string' ? obj.title : '';
	const description = typeof obj.description === 'string' ? obj.description : '';
	const list = Array.isArray(obj.questions) ? obj.questions : [];
	const questions = list
		.map((q) => normalizeQuestion(q))
		.filter((q) => q !== null);
	return { title, description, questions: /** @type {EditorQuestion[]} */ (questions) };
}

/**
 * Rating question detection.
 * Uses simple string-includes checks — more reliable than regex
 * for user-supplied question text.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isRatingQuestion(text) {
	const t = String(text || '').toLowerCase();
	const keywords = [
		'satisfied',
		'satisfaction',
		'0 = not',
		'10 = extremely',
		'not at all',
		'extremely satisfied',
		'extremely likely',
		'not at all likely',
		'how likely',
		'how satisfied',
		'how happy',
		'how pleased',
		'nps',
		'net promoter',
		'rate from',
		'rate on',
		'rate your',
		'rating',
		'on a scale',
		'scale of',
		'1 to 10',
		'0 to 10',
		'1-10',
		'0-10',
		'0 = ',
		'10 = ',
		'score',
		'likelihood',
	];
	return keywords.some((kw) => t.includes(kw));
}

/**
 * Extract min/max from a question text (e.g. "0-10", "1 to 5").
 * Returns null if not found.
 *
 * @param {string} text
 * @returns {{ min: number, max: number } | null}
 */
function extractRatingRange(text) {
	const t = String(text || '');
	const m = t.match(/\b(\d)\s*[-–to]+\s*(10|5)\b/i);
	if (m) {
		const lo = parseInt(m[1], 10);
		const hi = parseInt(m[2], 10);
		if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
			return { min: lo, max: hi };
		}
	}
	return null;
}

/**
 * @param {unknown} raw
 * @returns {EditorQuestion|null}
 */
export function normalizeQuestion(raw) {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const obj = /** @type {Record<string, unknown>} */ (raw);
	const text =
		typeof obj.question === 'string'
			? obj.question
			: typeof obj.question_text === 'string'
				? /** @type {string} */ (obj.question_text)
				: '';
	const incomingType =
		typeof obj.type === 'string' ? obj.type : 'text';
	const isDbType = ['single_choice', 'multiple_choice'].includes(String(incomingType));
	const resolvedType = isDbType ? dbTypeToEditorType(incomingType) : /** @type {import('./renderSurveyHtml.js').EditorFieldType} */ (
		['text', 'email', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file', 'rating'].includes(String(incomingType))
			? incomingType
			: 'text'
	);
	// Auto-upgrade text/number → rating when the question text signals a scale
	const type = (resolvedType === 'text' || resolvedType === 'number') && isRatingQuestion(text)
		? /** @type {import('./renderSurveyHtml.js').EditorFieldType} */ ('rating')
		: resolvedType;
	const optsRaw = obj.options;
	const optsJson = obj.options_json;
	let options = [];
	if (Array.isArray(optsRaw)) {
		options = optsRaw.map((o) => String(o));
	} else if (optsJson && typeof optsJson === 'object' && Array.isArray(/** @type {{ options?: unknown }} */ (optsJson).options)) {
		options = /** @type {unknown[]} */ (/** @type {{ options?: unknown[] }} */ (optsJson).options).map((o) => String(o));
	}
	const requiredFromOpts =
		optsJson && typeof optsJson === 'object' && typeof /** @type {{ required?: unknown }} */ (optsJson).required === 'boolean'
			? Boolean(/** @type {{ required?: boolean }} */ (optsJson).required)
			: undefined;
	const required = typeof obj.required === 'boolean' ? obj.required : Boolean(requiredFromOpts);

	const placeholder = typeof obj.placeholder === 'string' ? obj.placeholder : '';
	const validation =
		obj.validation && typeof obj.validation === 'object'
			? /** @type {Record<string, unknown>} */ (obj.validation)
			: obj.validation_rules && typeof obj.validation_rules === 'object'
				? /** @type {Record<string, unknown>} */ (obj.validation_rules)
				: {};

	// For rating questions, inject range into validation if not already set
	const finalValidation = /** @type {EditorQuestion['validation']} */ ({ ...validation });
	if (type === 'rating') {
		const range = extractRatingRange(text);
		if (range) {
			if (finalValidation.min === undefined || finalValidation.min === '') finalValidation.min = range.min;
			if (finalValidation.max === undefined || finalValidation.max === '') finalValidation.max = range.max;
		} else {
			if (finalValidation.min === undefined || finalValidation.min === '') finalValidation.min = 1;
			if (finalValidation.max === undefined || finalValidation.max === '') finalValidation.max = 10;
		}
	}

	return {
		id: typeof obj.id === 'string' && obj.id ? obj.id : typeof obj.question_id === 'string' ? obj.question_id : nextLocalId(),
		question: text || 'Untitled question',
		type,
		required,
		placeholder,
		options,
		validation: finalValidation,
	};
}

/**
 * @param {EditorSpec} spec
 * @returns {EditorSpec}
 */
export function cloneSpec(spec) {
	return {
		title: spec.title || '',
		description: spec.description || '',
		questions: (spec.questions || []).map((q) => ({
			...q,
			options: Array.isArray(q.options) ? [...q.options] : [],
			validation: q.validation ? { ...q.validation } : {},
		})),
	};
}

/**
 * Render the Edit tab question cards into a container element.
 *
 * @param {HTMLElement} container
 * @param {EditorSpec} spec
 */
export function renderQuestionCards(container, spec) {
	if (!container) return;
	container.innerHTML = '';

	if (!spec || !Array.isArray(spec.questions) || spec.questions.length === 0) {
		const empty = document.createElement('div');
		empty.className = 'editor-empty';
		empty.innerHTML = `
			<p class="editor-empty__title">No questions yet</p>
			<p class="editor-empty__hint">Generate a form above, or click <strong>+ Add Question</strong> to start.</p>
		`;
		container.appendChild(empty);
		return;
	}

	spec.questions.forEach((q, idx) => {
		container.appendChild(renderCard(q, idx, spec.questions.length));
	});
}

/**
 * @param {EditorQuestion} q
 * @param {number} idx
 * @param {number} total
 * @returns {HTMLElement}
 */
function renderCard(q, idx, total) {
	const card = document.createElement('div');
	card.className = 'editor-card';
	card.draggable = true;
	card.dataset.index = String(idx);

	card.innerHTML = `
		<div class="editor-card__handle" title="Drag to reorder" aria-hidden="true">⋮⋮</div>
		<div class="editor-card__body">
			<div class="editor-card__head">
				<div class="editor-card__title">
					<span class="editor-card__num">Q${idx + 1}.</span>
					<span class="editor-card__text">${escapeHtml(q.question || 'Untitled question')}</span>
				</div>
				<div class="editor-card__badges">
					<span class="editor-badge editor-badge--type">${escapeHtml(fieldTypeLabel(q.type))}</span>
					${q.required ? '<span class="editor-badge editor-badge--required">Required</span>' : ''}
				</div>
			</div>
			${
				(q.type === 'radio' || q.type === 'checkbox' || q.type === 'select') && q.options && q.options.length
					? `<ul class="editor-card__options">${q.options
							.slice(0, 6)
							.map((o) => `<li>${escapeHtml(o)}</li>`)
							.join('')}${q.options.length > 6 ? `<li class="editor-card__options-more">+${q.options.length - 6} more</li>` : ''}</ul>`
					: ''
			}
		</div>
		<div class="editor-card__actions">
			<button type="button" class="editor-icon-btn" data-action="up" title="Move up" ${idx === 0 ? 'disabled' : ''} aria-label="Move question up">▲</button>
			<button type="button" class="editor-icon-btn" data-action="down" title="Move down" ${idx === total - 1 ? 'disabled' : ''} aria-label="Move question down">▼</button>
			<button type="button" class="editor-icon-btn" data-action="edit" title="Edit" aria-label="Edit question">✎</button>
			<button type="button" class="editor-icon-btn editor-icon-btn--danger" data-action="delete" title="Delete" aria-label="Delete question">✕</button>
		</div>
	`;

	return card;
}

/**
 * Convert editor spec → payload for /generate-survey-json compatibility.
 *
 * @param {EditorSpec} spec
 * @returns {EditorSpec}
 */
export function toLlmSpec(spec) {
	const clean = cloneSpec(spec);
	clean.questions = clean.questions.map((q) => ({
		...q,
		options: q.options || [],
	}));
	return clean;
}

/**
 * @param {EditorSpec} spec
 * @returns {string}
 */
export function specToPreviewDocument(spec) {
	return buildPreviewDocument(spec);
}
