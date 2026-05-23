/**
 * Post-process Claude-generated HTML to upgrade rating/satisfaction text inputs
 * into beautiful horizontal 0-10 radio button scales.
 *
 * This runs client-side in the browser via DOMParser so it works regardless
 * of what Claude actually generated.
 */

const RATING_CSS = `
/* ── Injected rating scale styles ── */
.r-row{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}
.r-btn{position:relative;flex-shrink:0}
.r-btn input[type=radio]{position:absolute;opacity:0;width:0;height:0;pointer-events:none}
.r-btn span{
  display:flex;align-items:center;justify-content:center;
  width:44px;height:44px;border-radius:12px;
  border:1.5px solid #e2e8f0;background:#fff;
  font-size:.9rem;font-weight:700;color:#0f172a;cursor:pointer;
  user-select:none;
  transition:border-color .15s,background .15s,color .15s,transform .12s,box-shadow .15s;
}
.r-btn span:hover{
  border-color:#5b8cff;color:#5b8cff;
  transform:scale(1.1);box-shadow:0 2px 10px rgba(91,140,255,.2);
}
.r-btn input:checked + span{
  background:linear-gradient(135deg,#5b8cff,#7c5cff);
  border-color:transparent;color:#fff;
  box-shadow:0 4px 16px rgba(91,140,255,.45);transform:scale(1.07);
}
.r-end-labels{
  display:flex;justify-content:space-between;
  font-size:.7rem;color:#64748b;padding:0 3px;
}
@media(max-width:540px){
  .r-btn span{width:34px;height:34px;font-size:.78rem;border-radius:8px}
}
`.trim();

/** Patterns that identify a label as a rating/scale question */
const RATING_RE = [
	/\brate\b/i,
	/\brating\b/i,
	/\bsatisf/i,
	/\bnps\b/i,
	/\bnet\s+promoter\b/i,
	/\blikelihood\b/i,
	/\bhow\s+(?:satisfied|likely|happy|pleased)\b/i,
	/\bnot\s+at\s+all\b/i,
	/\bextremely\b/i,
	/\b0\s*=\s*not\b/i,
	/\b(?:0|1)\s*[-–to]+\s*10\b/i,
	/\b(?:0|1)\s*=.{0,40}10\s*=/i,
	/\bscore\b/i,
	/\bscale\b/i,
];

/**
 * Returns true if the label text indicates a rating/scale question.
 * @param {string} text
 */
function isRatingLabel(text) {
	return RATING_RE.some((re) => re.test(text));
}

/**
 * Extract numeric range from label text, e.g. "0 = Not at All ... 10 = Extremely".
 * @param {string} text
 * @returns {{ min: number, max: number }}
 */
function detectRange(text) {
	// e.g. "0 = Not at All Satisfied, 10 = Extremely Satisfied"
	const m = text.match(/\b(\d)\s*=.{0,40}?\b(10|5)\s*=/i);
	if (m) {
		const lo = parseInt(m[1], 10);
		const hi = parseInt(m[2], 10);
		if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) {
			return { min: lo, max: hi };
		}
	}
	// e.g. "1-10", "0 to 10"
	const m2 = text.match(/\b(\d)\s*[-–to]+\s*(10|5)\b/i);
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
 * Build the rating button HTML for a given name/range.
 * @param {string} name
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
function makeRatingWidget(name, min, max) {
	const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
	const btns = steps
		.map(
			(n) =>
				`<label class="r-btn"><input type="radio" name="${name}" value="${n}"><span>${n}</span></label>`
		)
		.join('');
	return `<div class="r-row">${btns}</div>`
		+ `<div class="r-end-labels"><span>${min} = Not at all</span><span>${max} = Extremely</span></div>`;
}

/**
 * Find the label text that is associated with a given input element.
 * Checks: `<label for="id">`, wrapping `<label>`, and nearest preceding label.
 *
 * @param {HTMLInputElement} input
 * @param {Document} doc
 * @returns {string}
 */
function findLabelText(input, doc) {
	// 1. <label for="inputId">
	if (input.id) {
		const lbl = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
		if (lbl) return lbl.textContent || '';
	}
	// 2. Input is inside a <label>
	const wrapping = input.closest('label');
	if (wrapping) return wrapping.textContent || '';

	// 3. Nearest preceding label sibling within the same parent
	const parent = input.parentElement;
	if (parent) {
		let el = input.previousElementSibling;
		while (el) {
			if (el.tagName === 'LABEL') return el.textContent || '';
			el = el.previousElementSibling;
		}
		// 4. Any label within parent container
		const lbl = parent.querySelector('label');
		if (lbl) return lbl.textContent || '';
	}
	return '';
}

/**
 * Post-process a full HTML string from Claude:
 * - Detect text/number inputs whose label signals a rating question
 * - Replace them with horizontal radio-button rating scale widgets
 * - Inject the required CSS if not already present
 *
 * Safe: returns the original HTML unchanged if DOMParser is unavailable or throws.
 *
 * @param {string} html
 * @returns {string}
 */
export function postProcessRatingFields(html) {
	if (typeof DOMParser === 'undefined' || !html) return html;

	let doc;
	try {
		doc = new DOMParser().parseFromString(html, 'text/html');
	} catch {
		return html;
	}

	let patched = false;

	/** @type {NodeListOf<HTMLInputElement>} */
	const inputs = doc.querySelectorAll(
		'input[type="text"], input[type="number"], input:not([type])'
	);

	inputs.forEach((input) => {
		const labelText = findLabelText(input, doc);
		if (!labelText || !isRatingLabel(labelText)) return;

		const { min, max } = detectRange(labelText);
		const name = input.name || input.id || `rating_${Date.now()}`;

		const wrapper = doc.createElement('div');
		wrapper.innerHTML = makeRatingWidget(name, min, max);

		// replaceWith() is standard in modern browsers
		input.replaceWith(wrapper);
		patched = true;

		console.log(
			`[postProcess] Upgraded input "${name}" → rating scale ${min}–${max}`,
			'\nLabel:', labelText.slice(0, 80)
		);
	});

	if (!patched) return html;

	// Inject CSS once
	if (!html.includes('.r-btn')) {
		const styleEl = doc.createElement('style');
		styleEl.textContent = RATING_CSS;
		(doc.head || doc.documentElement).appendChild(styleEl);
	}

	return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
