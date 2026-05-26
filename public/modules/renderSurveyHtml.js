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
 * @typedef {'text'|'email'|'number'|'textarea'|'select'|'radio'|'checkbox'|'date'|'file'|'rating'|'matrix_rating'} EditorFieldType
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
		text:          'Text',
		email:         'Email',
		number:        'Number',
		textarea:      'Long text',
		select:        'Dropdown',
		radio:         'Single choice',
		checkbox:      'Multiple choice',
		date:          'Date',
		file:          'File upload',
		rating:        'Rating scale',
		matrix_rating: 'Matrix rating',
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
		case 'matrix_rating':
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
 * Build the survey CSS. Accepts an optional style override object so prompt-driven
 * colours (background, text, accent, card, logo) are applied automatically.
 *
 * @param {{ backgroundColor?: string, textColor?: string, accentColor?: string,
 *           cardColor?: string, logoUrl?: string } | null | undefined} [style]
 * @returns {string}
 */
export function buildSurveyCss(style) {
	const s = style && typeof style === 'object' ? style : {};

	// ── Derive card colour ────────────────────────────────────────────────────
	// When only a page background is given we make the card slightly lighter so
	// it reads as a distinct surface. The caller can always pass an explicit
	// cardColor to override this.
	const cardColor = s.cardColor
		? s.cardColor
		: s.backgroundColor
			? s.backgroundColor
			: null;

	// ── Build bulletproof override block ─────────────────────────────────────
	// Use `!important` so nothing in the default :root can win. Also apply
	// directly to html,body for background-color so the whole iframe is painted.
	const directRules = [];
	if (s.backgroundColor) {
		directRules.push(`html,body { background-color: ${s.backgroundColor} !important; }`);
	}
	if (s.textColor) {
		directRules.push(`html,body,* { color: ${s.textColor} !important; }`);
	}
	if (s.accentColor) {
		directRules.push(`button,.survey-submit { background: ${s.accentColor} !important; border-color: ${s.accentColor} !important; }`);
	}
	if (cardColor) {
		directRules.push(`.survey-card,.survey-control,input,textarea,select { background-color: ${cardColor} !important; }`);
	}
	if (s.textColor) {
		directRules.push(`.survey-field-block,.survey-opt-row,.survey-control { border-color: rgba(128,128,128,0.35) !important; }`);
	}
	// Logo position — left | center | right (default: center)
	if (s.logoPosition) {
		const posMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
		const justify = posMap[s.logoPosition] || 'center';
		directRules.push(`.survey-logo { justify-content: ${justify} !important; transition: justify-content 0.2s ease; }`);
	}
	const overrideBlock = directRules.join('\n');

	return `
:root {
  --primary: #5b8cff;
  --primary-strong: #4f7be0;
  --text: #0f172a;
  --label: #334155;
  --opt-text: #1e293b;
  --muted: #64748b;
  --border: #e2e8f0;
  --danger: #dc2626;
  --bg: #f8fafc;
  --card: #ffffff;
  --input-bg: #ffffff;
  --radius: 14px;
  --radius-sm: 10px;
  --shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
}
${overrideBlock}
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
.survey-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}
.survey-logo img {
  max-height: 64px;
  max-width: 260px;
  object-fit: contain;
  display: block;
}
.survey-title {
  margin: 0 0 0.4rem;
  font-size: clamp(1.2rem, 2.6vw, 1.5rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
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
  color: var(--label);
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
  background: var(--input-bg);
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
  color: var(--opt-text);
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
  background: var(--input-bg);
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
/* ── Matrix rating ── */
.matrix-question { margin-bottom: 0.5rem; }
.matrix-scale-info { display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--muted); padding: 0 2px 6px; }
.matrix-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.matrix-tbl { width: 100%; border-collapse: collapse; font-size: 0.82rem; min-width: 520px; }
.matrix-tbl thead th {
  padding: 0.5rem 0.3rem; text-align: center; font-weight: 700;
  font-size: 0.72rem; color: var(--muted); background: var(--bg);
  border-bottom: 2px solid var(--border); white-space: nowrap;
}
.matrix-tbl thead th.mtx-lh { text-align: left; padding-left: 0.85rem; min-width: 160px; white-space: normal; }
.matrix-tbl thead th.mtx-scale-first, .matrix-tbl thead th.mtx-scale-last {
  white-space: normal; font-size: 0.68rem; line-height: 1.25; min-width: 56px; max-width: 72px; text-align: center;
}
.matrix-tbl td { padding: 0.5rem 0.3rem; text-align: center; border-bottom: 1px solid var(--border); min-width: 44px; }
.matrix-tbl td.mtx-rl { text-align: left; padding-left: 0.85rem; font-weight: 500; color: var(--opt-text); min-width: 160px; line-height: 1.35; }
.matrix-tbl tbody tr:last-child td { border-bottom: none; }
.matrix-tbl tbody tr:hover td { background: rgba(91,140,255,0.05); }
/* CSS-only radio circles — renders perfectly in every column width */
.mtx-radio-lbl { display: flex; align-items: center; justify-content: center; cursor: pointer; }
.mtx-radio-lbl input[type="radio"] { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.mtx-radio-dot {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid #c9d0db; background: #fff;
  display: block; flex-shrink: 0;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.mtx-radio-lbl:hover .mtx-radio-dot { border-color: var(--primary); }
.mtx-radio-lbl input:checked + .mtx-radio-dot {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: inset 0 0 0 5px #fff;
}
@media (max-width: 600px) {
  .matrix-tbl { min-width: 480px; }
  .matrix-tbl thead th.mtx-lh, .matrix-tbl td.mtx-rl { min-width: 120px; font-size: 0.76rem; }
  .mtx-radio-dot { width: 17px; height: 17px; }
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
	case 'matrix_rating': {
		const mMin = (validation.min !== undefined && validation.min !== '') ? Number(validation.min) : 0;
		const mMax = (validation.max !== undefined && validation.max !== '') ? Number(validation.max) : 10;
		const safeMMn = Number.isFinite(mMin) ? mMin : 0;
		const safeMMax = Number.isFinite(mMax) && mMax > safeMMn ? mMax : 10;
		const mSteps = Array.from({ length: safeMMax - safeMMn + 1 }, (_, i) => safeMMn + i);

		// Scale labels: first and last columns show "0\nNot at all" / "10\nExtremely" style
		const scaleLabels = q.scaleLabels && typeof q.scaleLabels === 'object'
			? q.scaleLabels
			: {};
		const minLabel = scaleLabels.min || (safeMMn === 0 ? 'Not at all' : String(safeMMn));
		const maxLabel = scaleLabels.max || (safeMMax === 10 ? 'Extremely' : String(safeMMax));

		const headerCols = mSteps.map((n, idx) => {
			if (idx === 0) {
				return `<th class="mtx-scale-first">${escapeHtml(String(n))}<br/><span style="font-weight:400;font-size:0.64rem;color:inherit;">${escapeHtml(minLabel)}</span></th>`;
			}
			if (idx === mSteps.length - 1) {
				return `<th class="mtx-scale-last">${escapeHtml(String(n))}<br/><span style="font-weight:400;font-size:0.64rem;color:inherit;">${escapeHtml(maxLabel)}</span></th>`;
			}
			return `<th>${escapeHtml(String(n))}</th>`;
		}).join('');

		/** @type {string[]} */
		const matrixRows = Array.isArray(q.rows) ? /** @type {string[]} */(q.rows) : [];
		const bodyRows = matrixRows.map((row, ri) => {
			const rName = `${name}_r${ri}`;
			// Use CSS-only custom radio so circles render perfectly in any column width
			const cols = mSteps
				.map((n) => `<td><label class="mtx-radio-lbl"><input type="radio" name="${escapeAttr(rName)}" value="${n}"${dataAttr} /><span class="mtx-radio-dot"></span></label></td>`)
				.join('');
			return `<tr><td class="mtx-rl">${escapeHtml(String(row))}</td>${cols}</tr>`;
		}).join('');
		control = `
      <div class="matrix-question">
        <div class="matrix-wrap">
          <table class="matrix-tbl" role="group" aria-labelledby="${id}_lbl">
            <thead><tr><th class="mtx-lh"></th>${headerCols}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
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
 * @property {string[]} [rows]  - row labels for matrix_rating type
 * @property {{ minLength?: number, maxLength?: number, min?: number, max?: number, pattern?: string, accept?: string }} [validation]
 */

/**
 * @typedef {{ backgroundColor?: string, textColor?: string, accentColor?: string,
 *             cardColor?: string, logoUrl?: string }} SurveyStyle
 */

/**
 * @typedef {object} EditorSpec
 * @property {string} title
 * @property {string} [description]
 * @property {SurveyStyle} [style]
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
	const style = spec?.style && typeof spec.style === 'object' ? spec.style : {};

	const logoUrl = String(style.logoUrl || '').trim();
	const logoHtml = logoUrl
		? `<div class="survey-logo"><img src="${escapeAttr(logoUrl)}" alt="Logo" /></div>`
		: '';

	const header = `
    <header class="survey-header">
      ${logoHtml}
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

	return { formCss: buildSurveyCss(style), formHtml: body };
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
