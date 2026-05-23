/**
 * postProcessHtml.js
 *
 * Post-process Claude-generated HTML to replace text/number inputs
 * for rating/satisfaction questions with beautiful horizontal radio-button
 * scale widgets.
 *
 * Strategy: zero external deps, pure string + DOM operations, multiple
 * label-finding fallbacks, simple string-includes detection.
 */

/* ─────────────────────────────────────────────────
   CSS injected into the document once
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
   Rating trigger — simple string-includes (case insensitive)
   More reliable than regex for this use-case.
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

/**
 * Returns true if the text contains any rating keyword.
 * @param {string} text
 */
function isRatingText(text) {
	const lower = (text || '').toLowerCase();
	return RATING_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Detect the numeric range from label text.
 * e.g. "(0 = Not at All Satisfied, 10 = Extremely Satisfied)" → {min:0, max:10}
 * @param {string} text
 * @returns {{ min: number, max: number }}
 */
function detectRange(text) {
	const t = text || '';
	// Pattern: "0 = ...  10 =" or "1 = ... 10 ="
	const m = t.match(/\b(\d)\s*=.{0,60}?\b(10|5)\s*=/i);
	if (m) {
		const lo = parseInt(m[1], 10);
		const hi = parseInt(m[2], 10);
		if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo && hi <= 20) {
			return { min: lo, max: hi };
		}
	}
	// Pattern: "0-10", "1-10", "0 to 10"
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
 * Build the rating widget HTML string.
 * @param {string} name  - radio group name
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
function buildRatingWidget(name, min, max) {
	const safeName = (name || 'rating').replace(/['"<>&]/g, '_');
	const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
	const btns = steps
		.map(
			(n) =>
				`<label><input type="radio" name="${safeName}" value="${n}"><span>${n}</span></label>`
		)
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
 * Find label text associated with an input element.
 * Tries 5 different strategies from most to least specific.
 *
 * @param {HTMLInputElement} input
 * @param {Document} doc
 * @returns {string}
 */
function getLabelText(input, doc) {
	// 1. <label for="inputId"> — iterate all labels (avoids CSS.escape issues)
	if (input.id) {
		const allLabels = doc.querySelectorAll('label');
		for (let i = 0; i < allLabels.length; i++) {
			if (allLabels[i].getAttribute('for') === input.id) {
				return allLabels[i].textContent || '';
			}
		}
	}

	// 2. Input is nested inside a <label>
	const wrappingLabel = input.closest('label');
	if (wrappingLabel) return wrappingLabel.textContent || '';

	const parent = input.parentElement;
	if (!parent) return '';

	// 3. Nearest preceding <label> sibling
	let prev = input.previousElementSibling;
	while (prev) {
		if (prev.tagName === 'LABEL' || prev.tagName === 'P' || prev.tagName === 'SPAN') {
			return prev.textContent || '';
		}
		prev = prev.previousElementSibling;
	}

	// 4. Any <label> within the parent container
	const labelInParent = parent.querySelector('label');
	if (labelInParent) return labelInParent.textContent || '';

	// 5. Full text of grandparent container (last resort)
	const grandparent = parent.parentElement;
	if (grandparent) return grandparent.textContent || '';

	return '';
}

/**
 * Main export — parse + patch the HTML string.
 *
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

	let patchCount = 0;

	// Target: text, number, and untyped inputs
	const selector = 'input[type="text"], input[type="number"], input:not([type])';
	const inputs = Array.from(doc.querySelectorAll(selector));

	inputs.forEach((input) => {
		const labelText = getLabelText(/** @type {HTMLInputElement} */ (input), doc);

		console.log('[postProcess] Checking input:', {
			id:        input.id,
			name:      input.name,
			labelText: labelText.slice(0, 80),
			isRating:  isRatingText(labelText),
		});

		if (!labelText || !isRatingText(labelText)) return;

		const { min, max } = detectRange(labelText);
		const name = input.name || input.id || `rating_${patchCount}`;

		// Create replacement node
		const wrapper = doc.createElement('div');
		wrapper.innerHTML = buildRatingWidget(name, min, max);

		try {
			input.replaceWith(wrapper);
			patchCount++;
			console.log(
				`[postProcess] ✔ Upgraded to rating scale ${min}–${max}:`,
				labelText.slice(0, 80)
			);
		} catch (e) {
			console.warn('[postProcess] replaceWith failed:', e);
		}
	});

	console.log(`[postProcess] Done. ${patchCount} input(s) upgraded to rating scale.`);

	if (patchCount === 0) return html;

	// Inject CSS once
	if (!html.includes('rating-scale')) {
		try {
			const styleEl = doc.createElement('style');
			styleEl.textContent = '\n' + RATING_CSS + '\n';
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
