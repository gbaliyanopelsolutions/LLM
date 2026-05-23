/**
 * postProcessHtml.js
 *
 * Post-process Claude-generated HTML to:
 *   1. Detect groups of similar rating inputs sharing the same parent question
 *      → replace entire group with a single matrix-rating table.
 *   2. Replace any remaining individual rating/satisfaction text inputs with
 *      a horizontal radio-button scale widget.
 *
 * Strategy: zero external deps, pure string + DOM operations, multiple
 * label-finding fallbacks, simple string-includes detection.
 */

/* ─────────────────────────────────────────────────
   Individual rating scale CSS
───────────────────────────────────────────────── */
const RATING_CSS = `
.rating-scale{display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 4px;align-items:center}
.rating-scale label{position:relative;cursor:pointer}
.rating-scale input[type=radio]{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.rating-scale span{
  display:flex;align-items:center;justify-content:center;
  width:44px;height:44px;border-radius:14px;
  border:1.5px solid #dbe1ea;background:#fff;
  font-size:.9rem;font-weight:700;color:#1e293b;
  cursor:pointer;user-select:none;white-space:nowrap;
  transition:transform .15s ease,border-color .15s ease,background .15s ease,
             color .15s ease,box-shadow .15s ease;
}
.rating-scale span:hover{
  transform:translateY(-3px);border-color:#4f46e5;color:#4f46e5;
  box-shadow:0 4px 12px rgba(79,70,229,.18);
}
.rating-scale input:checked+span{
  background:linear-gradient(135deg,#4f46e5,#7c3aed);
  border-color:transparent;color:#fff;
  box-shadow:0 8px 22px rgba(79,70,229,.38);transform:translateY(-2px) scale(1.06);
}
.rating-end-labels{display:flex;justify-content:space-between;font-size:.7rem;color:#64748b;padding:2px 3px 0;max-width:520px}
@media(max-width:540px){
  .rating-scale span{width:36px;height:36px;font-size:.78rem;border-radius:10px}
}`.trim();

/* ─────────────────────────────────────────────────
   Matrix rating table CSS
───────────────────────────────────────────────── */
const MATRIX_CSS = `
.matrix-question{margin:0.5rem 0 1.5rem}
.matrix-q-label{font-size:.85rem;font-weight:600;color:#334155;margin-bottom:.5rem;line-height:1.45}
.matrix-scale-bar{display:flex;justify-content:space-between;font-size:.7rem;color:#64748b;padding:4px 0 8px;max-width:100%}
.matrix-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #e2e8f0;border-radius:12px}
.matrix-table{width:100%;border-collapse:collapse;font-size:.82rem;min-width:480px}
.matrix-table thead th{
  padding:.45rem .35rem;text-align:center;font-weight:700;
  font-size:.75rem;color:#64748b;background:#f8fafc;
  border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:1;
}
.matrix-table th.row-label-h{text-align:left;padding-left:.85rem;min-width:160px;max-width:220px;background:#f8fafc}
.matrix-table td{padding:.55rem .35rem;text-align:center;border-bottom:1px solid #f1f5f9}
.matrix-table td.row-label{
  text-align:left;padding-left:.85rem;font-weight:500;
  color:#1e293b;min-width:160px;max-width:220px;white-space:normal;line-height:1.35
}
.matrix-table tbody tr:last-child td{border-bottom:none}
.matrix-table tbody tr:hover td{background:#f5f8ff}
.matrix-table input[type=radio]{
  width:17px;height:17px;cursor:pointer;
  accent-color:#4f46e5;margin:0;
}
@media(max-width:640px){
  .matrix-table{min-width:440px}
  .matrix-table th.row-label-h,.matrix-table td.row-label{min-width:120px;font-size:.78rem}
}`.trim();

/* ─────────────────────────────────────────────────
   Rating keyword list (lower-case, string-includes)
───────────────────────────────────────────────── */
const RATING_KEYWORDS = [
	'satisfied',
	'satisfaction',
	'0 = not',
	'10 = extremely',
	'0 = extremely',
	'10 = not',
	'not at all',
	'extremely satisfied',
	'extremely likely',
	'not at all likely',
	'how likely',
	'how satisfied',
	'how happy',
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
	'1 = ',
	'0 = ',
	'10 = ',
	'score',
	'likelihood',
];

/** @param {string} text */
function isRatingText(text) {
	const lower = (text || '').toLowerCase();
	return RATING_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Detect numeric range from label, e.g. "(0 = Not at All, 10 = Extremely)" → {min:0,max:10}
 * @param {string} text
 * @returns {{ min: number, max: number }}
 */
function detectRange(text) {
	const t = text || '';
	const m = t.match(/\b(\d)\s*=.{0,60}?\b(10|5)\s*=/i);
	if (m) {
		const lo = parseInt(m[1], 10);
		const hi = parseInt(m[2], 10);
		if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo && hi <= 20) {
			return { min: lo, max: hi };
		}
	}
	const m2 = t.match(/\b(\d)\s*(?:[-–]|to)\s*(10|5)\b/i);
	if (m2) {
		const lo = parseInt(m2[1], 10);
		const hi = parseInt(m2[2], 10);
		if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
			return { min: lo, max: hi };
		}
	}
	return { min: 0, max: 10 };
}

/**
 * Build individual horizontal rating widget HTML.
 * @param {string} name
 * @param {number} min
 * @param {number} max
 */
function buildRatingWidget(name, min, max) {
	const safeName = (name || 'rating').replace(/['"<>&]/g, '_');
	const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
	const btns = steps
		.map((n) => `<label><input type="radio" name="${safeName}" value="${n}"><span>${n}</span></label>`)
		.join('');
	return (
		`<div class="rating-scale">${btns}</div>` +
		`<div class="rating-end-labels">` +
		`<span>${min} = Not at all</span>` +
		`<span>${max} = Extremely</span>` +
		`</div>`
	);
}

/**
 * Build a matrix-rating table HTML.
 * @param {string} questionBase  – cleaned parent question text
 * @param {string[]} rows
 * @param {number} min
 * @param {number} max
 * @param {string} groupId       – unique id prefix
 */
function buildMatrixTable(questionBase, rows, min, max, groupId) {
	const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
	const headerCols = steps.map((n) => `<th class="mc">${n}</th>`).join('');

	const bodyRows = rows
		.map((row, ri) => {
			const radioName = `${groupId}_row${ri}`;
			const cols = steps
				.map((n) => `<td class="mc"><input type="radio" name="${radioName}" value="${n}"></td>`)
				.join('');
			return `<tr><td class="row-label">${escapeVal(row)}</td>${cols}</tr>`;
		})
		.join('');

	const qText = questionBase.replace(/\s*[—–\-:,]\s*$/, '').trim();

	return `<div class="matrix-question">
  <div class="matrix-q-label">${escapeVal(qText)}</div>
  <div class="matrix-scale-bar">
    <span>${min} = Not at all satisfied</span>
    <span>${max} = Extremely satisfied</span>
  </div>
  <div class="matrix-wrap">
    <table class="matrix-table">
      <thead><tr><th class="row-label-h"></th>${headerCols}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
</div>`;
}

/** Minimal HTML escape for text inside generated table cells */
function escapeVal(v) {
	return String(v || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Find label text associated with an input element.
 * 5 fallback strategies.
 * @param {HTMLInputElement} input
 * @param {Document} doc
 * @returns {string}
 */
function getLabelText(input, doc) {
	// 1. <label for="id"> — iterate all labels (avoids CSS.escape issues)
	if (input.id) {
		const allLabels = doc.querySelectorAll('label');
		for (let i = 0; i < allLabels.length; i++) {
			if (allLabels[i].getAttribute('for') === input.id) {
				return allLabels[i].textContent || '';
			}
		}
	}

	// 2. Nested inside a <label>
	const wrappingLabel = input.closest('label');
	if (wrappingLabel) return wrappingLabel.textContent || '';

	const parent = input.parentElement;
	if (!parent) return '';

	// 3. Nearest preceding label/p/span sibling
	let prev = input.previousElementSibling;
	while (prev) {
		if (prev.tagName === 'LABEL' || prev.tagName === 'P' || prev.tagName === 'SPAN') {
			return prev.textContent || '';
		}
		prev = prev.previousElementSibling;
	}

	// 4. Any <label> within parent container
	const labelInParent = parent.querySelector('label');
	if (labelInParent) return labelInParent.textContent || '';

	// 5. Grandparent text (last resort)
	const grandparent = parent.parentElement;
	if (grandparent) return grandparent.textContent || '';

	return '';
}

/**
 * Walk up the DOM to find the "question block" container — the element
 * that wraps both the label and input for one question.
 * @param {Element} input
 * @returns {Element}
 */
function findQuestionContainer(input) {
	let el = input.parentElement;
	while (el) {
		if (!el.parentElement || el.tagName === 'BODY' || el.tagName === 'FORM') break;
		// Stop at an element that contains a label somewhere inside it
		if (el.querySelector('label') && el.children.length <= 10) return el;
		el = el.parentElement;
	}
	return input.parentElement || input;
}

/**
 * Given a full question label and a groupKey prefix, extract the row label.
 * e.g.  "How satisfied... — Purchase Process? (0 = Not at All...)"
 *       groupKey = "How satisfied..."
 *       → "Purchase Process"
 * @param {string} labelText
 * @param {string} groupKey
 * @returns {string}
 */
function extractRowLabel(labelText, groupKey) {
	let row = labelText.slice(groupKey.length);
	// Strip leading separator characters: " — ", " – ", " - ", ": "
	row = row.replace(/^\s*[—–\-:]\s*/, '');
	// Strip trailing rating scale parenthetical: "(0 = ..." or "(1 = ..."
	row = row.replace(/\s*\(\s*\d+\s*=.*$/i, '');
	// Strip trailing punctuation
	row = row.replace(/[?!.]+$/, '').trim();
	return row || labelText.slice(0, 40);
}

/**
 * Group an array of {input, labelText, index} items into matrix groups and singles.
 * Matrix group = 2+ items sharing the same "base question" before a " — " or " – " separator.
 *
 * @param {Array<{input: Element, labelText: string, index: number}>} ratingItems
 * @returns {{ matrixGroups: Array<{groupKey: string, items: typeof ratingItems, min: number, max: number}>, singles: typeof ratingItems }}
 */
function groupRatingInputs(ratingItems) {
	/** @type {Record<string, typeof ratingItems>} */
	const byKey = {};

	for (const item of ratingItems) {
		const label = item.labelText;
		let groupKey = null;

		// Try em-dash " — "
		const emIdx = label.indexOf(' \u2014 ');
		if (emIdx > 10) {
			groupKey = label.slice(0, emIdx).trim();
		}
		// Try en-dash " – "
		if (!groupKey) {
			const enIdx = label.indexOf(' \u2013 ');
			if (enIdx > 10) groupKey = label.slice(0, enIdx).trim();
		}
		// Try " - " (hyphen-space)
		if (!groupKey) {
			const hypIdx = label.indexOf(' - ');
			if (hypIdx > 10) groupKey = label.slice(0, hypIdx).trim();
		}

		if (groupKey) {
			if (!byKey[groupKey]) byKey[groupKey] = [];
			byKey[groupKey].push(item);
		}
	}

	// Fallback: if no separator groups found but 3+ items share a long common prefix, group them
	if (Object.keys(byKey).length === 0 && ratingItems.length >= 3) {
		const texts = ratingItems.map((it) => it.labelText.slice(0, 120));
		let prefix = texts[0];
		for (const t of texts.slice(1)) {
			while (prefix && !t.startsWith(prefix)) prefix = prefix.slice(0, -1);
			if (!prefix) break;
		}
		if (prefix && prefix.length > 25) {
			const key = prefix.trim();
			byKey[key] = ratingItems.map((item) => item);
		}
	}

	const matrixItemIndices = new Set();
	const matrixGroups = Object.entries(byKey)
		.filter(([, items]) => items.length >= 2)
		.map(([groupKey, items]) => {
			items.forEach((it) => matrixItemIndices.add(it.index));
			const { min, max } = detectRange(items[0].labelText);
			return { groupKey, items, min, max };
		});

	const singles = ratingItems.filter((it) => !matrixItemIndices.has(it.index));

	return { matrixGroups, singles };
}

/* ─────────────────────────────────────────────────
   Main export
───────────────────────────────────────────────── */

/**
 * Parse + patch the HTML string.
 * @param {string} html
 * @returns {string}
 */
export function postProcessRatingFields(html) {
	if (!html || typeof DOMParser === 'undefined') return html;

	let doc;
	try {
		doc = new DOMParser().parseFromString(html, 'text/html');
	} catch (e) {
		console.warn('[postProcess] DOMParser failed:', e);
		return html;
	}

	// ── Step 1: collect all candidate rating inputs ──────────────────────
	const selector = 'input[type="text"], input[type="number"], input:not([type])';
	const allInputs = Array.from(doc.querySelectorAll(selector));

	/** @type {Array<{input: Element, labelText: string, index: number}>} */
	const ratingItems = [];
	allInputs.forEach((input, index) => {
		const labelText = getLabelText(/** @type {HTMLInputElement} */(input), doc);
		if (labelText && isRatingText(labelText)) {
			ratingItems.push({ input, labelText, index });
			console.log('[postProcess] Rating candidate:', labelText.slice(0, 80));
		}
	});

	if (ratingItems.length === 0) return html;

	// ── Step 2: group into matrix vs individual ───────────────────────────
	const { matrixGroups, singles } = groupRatingInputs(ratingItems);
	console.log('[postProcess] Matrix groups:', matrixGroups.length, '| Singles:', singles.length);

	let patchCount = 0;
	let usedMatrix = false;
	let usedRating = false;

	// ── Step 3: render matrix groups ─────────────────────────────────────
	matrixGroups.forEach((group, gi) => {
		const { groupKey, items, min, max } = group;
		const rows = items.map((it) => extractRowLabel(it.labelText, groupKey));
		const groupId = `mg${gi}_${Date.now().toString(36)}`;
		const matrixHtml = buildMatrixTable(groupKey, rows, min, max, groupId);

		const containers = items.map((it) => findQuestionContainer(it.input));

		// Replace first container with the matrix table
		if (containers[0] && containers[0].parentNode) {
			const wrapper = doc.createElement('div');
			wrapper.innerHTML = matrixHtml;
			containers[0].replaceWith(wrapper);
			usedMatrix = true;
			patchCount++;
			console.log('[postProcess] ✔ Matrix table created:', groupKey.slice(0, 60), '→', rows.length, 'rows');
		}

		// Remove remaining containers
		containers.slice(1).forEach((c) => {
			if (c && c.parentNode) c.remove();
		});
	});

	// ── Step 4: render remaining individual rating inputs ─────────────────
	singles.forEach((item) => {
		const { input, labelText } = item;
		if (!input.parentNode) return; // already removed as part of a matrix

		const { min, max } = detectRange(labelText);
		const name =
			/** @type {HTMLInputElement} */(input).name ||
			/** @type {HTMLInputElement} */(input).id ||
			`rating_${patchCount}`;

		const wrapper = doc.createElement('div');
		wrapper.innerHTML = buildRatingWidget(name, min, max);

		try {
			input.replaceWith(wrapper);
			usedRating = true;
			patchCount++;
			console.log('[postProcess] ✔ Individual rating scale:', labelText.slice(0, 60));
		} catch (e) {
			console.warn('[postProcess] replaceWith failed:', e);
		}
	});

	console.log(`[postProcess] Done. ${patchCount} field(s) upgraded (${matrixGroups.length} matrix, ${singles.length} individual).`);

	if (patchCount === 0) return html;

	// ── Step 5: inject CSS (only what was actually used) ─────────────────
	const cssToAdd = [
		usedRating && !html.includes('rating-scale') ? RATING_CSS : '',
		usedMatrix && !html.includes('matrix-table') ? MATRIX_CSS : '',
	]
		.filter(Boolean)
		.join('\n');

	if (cssToAdd) {
		try {
			const styleEl = doc.createElement('style');
			styleEl.textContent = '\n' + cssToAdd + '\n';
			(doc.head || doc.documentElement).appendChild(styleEl);
		} catch (e) {
			console.warn('[postProcess] CSS inject failed:', e);
		}
	}

	try {
		return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
	} catch (e) {
		console.warn('[postProcess] outerHTML failed:', e);
		return html;
	}
}
