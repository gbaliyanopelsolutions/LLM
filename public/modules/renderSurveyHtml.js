/**
 * Render a survey spec to a full standalone HTML document (CSS + body).
 *
 * Produces markup matching `form.html` / `.public-survey-body` styling so the
 * builder Preview tab and the public form look identical.
 */

import { FRAME_HEIGHT_REPORT_SCRIPT } from './resizePreviewIframe.js';

/**
 * UI-visible field type for the editor.
 *
 * @typedef {'text'|'email'|'number'|'textarea'|'select'|'radio'|'checkbox'|'date'|'file'|'rating'} EditorFieldType
 */

const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * @param {unknown} v
 * @returns {string}
 */
export function escapeHtml(v) {
	return String(v ?? '').replace(/[&<>"']/g, (ch) => HTML_ESC[ch] || ch);
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function escapeAttr(v) {
	return escapeHtml(v);
}

/**
 * @param {EditorFieldType} t
 * @returns {string}
 */
export function fieldTypeLabel(t) {
	const map = {
		text:     'Text',
		email:    'Email',
		number:   'Number',
		textarea: 'Long text',
		select:   'Dropdown',
		radio:    'Single choice',
		checkbox: 'Multiple choice',
		date:     'Date',
		file:     'File upload',
		rating:   'Rating scale',
	};
	return map[t] || 'Text';
}

/**
 * Map editor type → DB question_type enum used by saveSurvey.
 *
 * @param {EditorFieldType} t
 * @returns {'text'|'number'|'date'|'single_choice'|'multiple_choice'}
 */
export function editorTypeToDbType(t) {
	switch (t) {
		case 'radio':
		case 'select':
			return 'single_choice';
		case 'checkbox':
			return 'multiple_choice';
		case 'number':
		case 'rating':
			return 'number';
		case 'date':
			return 'date';
		case 'textarea':
		case 'email':
		case 'file':
		case 'text':
		default:
			return 'text';
	}
}

/**
 * @param {string} dbType
 * @returns {EditorFieldType}
 */
export function dbTypeToEditorType(dbType) {
	const t = String(dbType || '').toLowerCase();
	if (t === 'multiple_choice') return 'checkbox';
	if (t === 'single_choice') return 'radio';
	if (t === 'number') return 'number';
	if (t === 'date') return 'date';
	if (t === 'email') return 'email';
	if (t === 'textarea') return 'textarea';
	if (t === 'file') return 'file';
	return 'text';
}

/**
 * @returns {string}
 */
export function buildSurveyCss() {
	return `
:root {
  --primary: #5b8cff;
  --primary-strong: #4f7be0;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --danger: #dc2626;
  --bg: #f8fafc;
  --card: #ffffff;
  --radius: 14px;
  --radius-sm: 10px;
  --shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.survey-card {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 2rem;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.survey-header { margin-bottom: 1.25rem; }
.survey-title {
  margin: 0 0 0.4rem;
  font-size: clamp(1.2rem, 2.6vw, 1.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}
.survey-desc {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--muted);
}
.survey-field-block {
  margin-bottom: 1.25rem;
  padding-bottom: 1.1rem;
  border-bottom: 1px solid var(--border);
}
.survey-field-block:last-of-type { border-bottom: none; }
.survey-field-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
  margin-bottom: 0.5rem;
}
.survey-required { color: var(--danger); margin-left: 2px; }
.survey-control {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-family: inherit;
  background: #fff;
  color: var(--text);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.survey-control:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(91, 140, 255, 0.18);
}
textarea.survey-control { min-height: 110px; resize: vertical; }
.survey-opt-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0;
  font-size: 0.9rem;
  color: #1e293b;
  cursor: pointer;
}
.survey-opt-row input { accent-color: var(--primary); transform: scale(1.05); }
.survey-empty-options {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--muted);
  font-style: italic;
}
.survey-submit-row {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
}
.survey-submit {
  appearance: none;
  border: none;
  border-radius: var(--radius-sm);
  padding: 0.7rem 1.5rem;
  background: linear-gradient(135deg, var(--primary), #7c5cff);
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(91, 140, 255, 0.32);
  transition: transform 0.15s ease, box-shadow 0.18s ease;
}
.survey-submit:hover { box-shadow: 0 10px 26px rgba(91, 140, 255, 0.45); }
.survey-submit:active { transform: scale(0.98); }
/* ── Rating scale ── */
.rating-group { display: flex; flex-direction: column; gap: 0.6rem; }
.rating-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rating-btn { position: relative; flex-shrink: 0; }
.rating-btn input[type="radio"] {
  position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;
}
.rating-btn span {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--border);
  background: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s ease, background 0.15s ease,
              color 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease;
}
.rating-btn span:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: scale(1.08);
  box-shadow: 0 2px 8px rgba(91,140,255,0.18);
}
.rating-btn input:checked + span {
  background: linear-gradient(135deg, var(--primary), #7c5cff);
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 14px rgba(91,140,255,0.42);
  transform: scale(1.06);
}
.rating-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--muted);
  padding: 0 2px;
}
@media (max-width: 540px) {
  .survey-card { padding: 1.2rem 1rem 1.5rem; border-radius: 12px; }
  .survey-submit { width: 100%; }
  .rating-btn span { width: 36px; height: 36px; font-size: 0.8rem; border-radius: 9px; }
}
`.trim();
}

/**
 * Build a question's HTML markup with field name bound to question id slot.
 *
 * @param {EditorQuestion} q
 * @param {number} idx
 * @returns {string}
 */
function renderQuestionMarkup(q, idx) {
	const id = `q_${idx + 1}`;
	const name = q.id ? `q-${q.id}` : id;
	const reqMark = q.required ? '<span class="survey-required" aria-hidden="true">*</span>' : '';
	const reqAttr = q.required ? ' required' : '';
	const placeholder = q.placeholder ? ` placeholder="${escapeAttr(q.placeholder)}"` : '';
	const validation = q.validation || {};
	const min = validation.min !== undefined && validation.min !== '' ? ` min="${escapeAttr(validation.min)}"` : '';
	const max = validation.max !== undefined && validation.max !== '' ? ` max="${escapeAttr(validation.max)}"` : '';
	const minLen =
		validation.minLength !== undefined && validation.minLength !== ''
			? ` minlength="${escapeAttr(validation.minLength)}"`
			: '';
	const maxLen =
		validation.maxLength !== undefined && validation.maxLength !== ''
			? ` maxlength="${escapeAttr(validation.maxLength)}"`
			: '';
	const pattern = validation.pattern ? ` pattern="${escapeAttr(validation.pattern)}"` : '';
	const accept = validation.accept ? ` accept="${escapeAttr(validation.accept)}"` : '';
	const dataAttr = q.id ? ` data-question-id="${escapeAttr(q.id)}"` : '';

	const label = `
    <label class="survey-field-label" for="${id}">
      ${escapeHtml(q.question || 'Untitled question')}${reqMark}
    </label>`;

	let control = '';
	switch (q.type) {
		case 'textarea':
			control = `<textarea class="survey-control" id="${id}" name="${name}"${dataAttr}${placeholder}${reqAttr}${minLen}${maxLen}></textarea>`;
			break;
		case 'select': {
			const opts = (q.options || [])
				.map(
					(opt) =>
						`<option value="${escapeAttr(opt)}">${escapeHtml(opt)}</option>`
				)
				.join('');
			// Placeholder option uses `disabled selected hidden` so it shows by
			// default, cannot be re-picked, and is excluded from the open list.
			const placeholderText = q.placeholder || 'Choose an option';
			const placeholderOpt = `<option value="" disabled selected hidden>${escapeHtml(placeholderText)}</option>`;
			control = `<select class="survey-control" id="${id}" name="${name}"${dataAttr}${reqAttr}>
        ${placeholderOpt}
        ${opts}
      </select>`;
			break;
		}
		case 'radio': {
			const items = (q.options || []).length
				? (q.options || [])
						.map(
							(opt, i) => `
        <label class="survey-opt-row">
          <input type="radio" name="${name}" value="${escapeAttr(opt)}"${dataAttr}${
								i === 0 ? reqAttr : ''
							} />
          <span>${escapeHtml(opt)}</span>
        </label>`
						)
						.join('')
				: '<p class="survey-empty-options">No options configured.</p>';
			control = items;
			break;
		}
		case 'checkbox': {
			const items = (q.options || []).length
				? (q.options || [])
						.map(
							(opt) => `
        <label class="survey-opt-row">
          <input type="checkbox" name="${name}" value="${escapeAttr(opt)}"${dataAttr} />
          <span>${escapeHtml(opt)}</span>
        </label>`
						)
						.join('')
				: '<p class="survey-empty-options">No options configured.</p>';
			control = items;
			break;
		}
		case 'number':
			control = `<input class="survey-control" type="number" id="${id}" name="${name}"${dataAttr}${placeholder}${reqAttr}${min}${max} />`;
			break;
		case 'date':
			control = `<input class="survey-control" type="date" id="${id}" name="${name}"${dataAttr}${reqAttr}${min}${max} />`;
			break;
		case 'email':
			control = `<input class="survey-control" type="email" id="${id}" name="${name}"${dataAttr}${placeholder}${reqAttr}${pattern} />`;
			break;
		case 'file':
			control = `<input class="survey-control" type="file" id="${id}" name="${name}"${dataAttr}${reqAttr}${accept} />`;
			break;
	case 'rating': {
		/* Detect scale range from validation or fall back to 1-10 */
		const rMin = (validation.min !== undefined && validation.min !== '') ? Number(validation.min) : 1;
		const rMax = (validation.max !== undefined && validation.max !== '') ? Number(validation.max) : 10;
		const safeMin = Number.isFinite(rMin) ? rMin : 1;
		const safeMax = Number.isFinite(rMax) && rMax > safeMin ? rMax : 10;
		const steps = Array.from({ length: safeMax - safeMin + 1 }, (_, i) => safeMin + i);
		const minLabel = safeMin === 0 ? 'Not at all' : 'Low';
		const maxLabel = 'Extremely / High';
		const btns = steps.map((n) => `
        <label class="rating-btn">
          <input type="radio" name="${name}" value="${n}"${dataAttr}${reqAttr} />
          <span>${n}</span>
        </label>`).join('');
		control = `
      <div class="rating-group" role="group" aria-labelledby="${id}_lbl">
        <div class="rating-buttons">${btns}
        </div>
        <div class="rating-labels">
          <span>${escapeHtml(safeMin + ' = ' + minLabel)}</span>
          <span>${escapeHtml(safeMax + ' = ' + maxLabel)}</span>
        </div>
      </div>`;
		break;
	}
	case 'text':
	default:
		control = `<input class="survey-control" type="text" id="${id}" name="${name}"${dataAttr}${placeholder}${reqAttr}${minLen}${maxLen}${pattern} />`;
		break;
	}

	return `<div class="survey-field-block">${label}${control}</div>`;
}

/**
 * @typedef {object} EditorQuestion
 * @property {string} [id]
 * @property {string} question
 * @property {EditorFieldType} type
 * @property {boolean} required
 * @property {string} [placeholder]
 * @property {string[]} [options]
 * @property {{ minLength?: number, maxLength?: number, min?: number, max?: number, pattern?: string, accept?: string }} [validation]
 */

/**
 * @typedef {object} EditorSpec
 * @property {string} title
 * @property {string} [description]
 * @property {EditorQuestion[]} questions
 */

/**
 * @param {EditorSpec} spec
 * @returns {{ formCss: string, formHtml: string }}
 */
export function buildFormParts(spec) {
	const title = spec?.title || 'Survey';
	const desc = spec?.description || '';
	const questions = Array.isArray(spec?.questions) ? spec.questions : [];

	const header = `
    <header class="survey-header">
      <h1 class="survey-title">${escapeHtml(title)}</h1>
      ${desc ? `<p class="survey-desc">${escapeHtml(desc)}</p>` : ''}
    </header>`;

	const questionsHtml = questions.map((q, i) => renderQuestionMarkup(q, i)).join('\n');

	const body = `
<div class="survey-card">
  <form id="public-survey-form" novalidate>
    ${header}
    ${questionsHtml}
    <div class="survey-submit-row">
      <button type="submit" class="survey-submit">Submit responses</button>
    </div>
  </form>
</div>`.trim();

	return { formCss: buildSurveyCss(), formHtml: body };
}

/**
 * Standalone HTML document for the Preview tab iframe.
 *
 * @param {EditorSpec} spec
 * @returns {string}
 */
export function buildPreviewDocument(spec) {
	const { formCss, formHtml } = buildFormParts(spec);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${formCss}</style>
</head>
<body>
${formHtml}
<script>${FRAME_HEIGHT_REPORT_SCRIPT}<\/script>
</body>
</html>`;
}
