/**
 * Client-side survey form HTML preparation (builder save) and answer helpers (public form).
 */

import { FRAME_HEIGHT_REPORT_SCRIPT } from './resizePreviewIframe.js';

/**
 * @param {string} specType
 * @returns {'single_choice'|'multiple_choice'|'text'|'number'|'date'}
 */
export function mapSpecControlKind(specType) {
	const x = String(specType || 'text').toLowerCase();
	if (x === 'checkbox') {
		return 'multiple_choice';
	}
	if (x === 'radio' || x === 'select' || x === 'likert' || x === 'rating') {
		return 'single_choice';
	}
	if (x === 'number') {
		return 'number';
	}
	if (x === 'date') {
		return 'date';
	}
	return 'text';
}

/**
 * Ordered form controls for slot assignment (radios/checkbox groups = one slot).
 *
 * @param {Document} doc
 * @returns {HTMLElement[]}
 */
export function collectFieldSlots(doc) {
	/** @type {HTMLElement[]} */
	const slots = [];
	const seenRadio = new Set();
	const seenCheckbox = new Set();
	const nodes = doc.querySelectorAll('input, select, textarea');

	for (const el of nodes) {
		if (!(el instanceof HTMLElement)) {
			continue;
		}
		const type = (el.getAttribute('type') || '').toLowerCase();
		if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') {
			continue;
		}

		if (type === 'radio') {
			const name = el.getAttribute('name') || `__radio_${slots.length}`;
			if (seenRadio.has(name)) {
				continue;
			}
			seenRadio.add(name);
			slots.push(el);
			continue;
		}

		if (type === 'checkbox') {
			const name = el.getAttribute('name');
			if (name) {
				if (seenCheckbox.has(name)) {
					continue;
				}
				seenCheckbox.add(name);
			}
			slots.push(el);
			continue;
		}

		slots.push(el);
	}

	return slots;
}

/**
 * Split LLM document into CSS + body HTML for storage.
 *
 * @param {string} fullHtml
 * @returns {{ formCss: string, formHtml: string }}
 */
export function splitHtmlDocument(fullHtml) {
	const raw = String(fullHtml || '').trim();
	if (!raw) {
		return { formCss: '', formHtml: '' };
	}

	const styleBlocks = [];
	const withoutStyles = raw.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css) => {
		styleBlocks.push(String(css || ''));
		return '';
	});

	let bodyHtml = withoutStyles;
	const bodyMatch = withoutStyles.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
	if (bodyMatch) {
		bodyHtml = bodyMatch[1];
	} else if (/^\s*<!DOCTYPE/i.test(withoutStyles) || /^\s*<html\b/i.test(withoutStyles)) {
		bodyHtml = withoutStyles
			.replace(/<!DOCTYPE[^>]*>/gi, '')
			.replace(/<\/?html[^>]*>/gi, '')
			.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '')
			.replace(/<\/?body[^>]*>/gi, '');
	}

	return {
		formCss: styleBlocks.join('\n\n').trim(),
		formHtml: bodyHtml.trim(),
	};
}

/**
 * Tag controls with data-survey-slot for server-side question_id binding.
 *
 * @param {string} fullHtml
 * @param {{ type?: string }[]} questionSpecs
 * @returns {{ formCss: string, formHtml: string }}
 */
export function prepareFormHtmlForSave(fullHtml, questionSpecs) {
	const { formCss, formHtml: bodyRaw } = splitHtmlDocument(fullHtml);
	const doc = new DOMParser().parseFromString(
		`<!DOCTYPE html><html><body>${bodyRaw}</body></html>`,
		'text/html'
	);
	const slots = collectFieldSlots(doc);
	const specs = Array.isArray(questionSpecs) ? questionSpecs : [];
	const limit = Math.min(slots.length, specs.length);

	for (let i = 0; i < limit; i += 1) {
		const el = slots[i];
		const kind = mapSpecControlKind(specs[i]?.type);
		el.setAttribute('data-survey-slot', String(i));
		el.setAttribute('data-survey-kind', kind);

		if (kind === 'single_choice' && el.getAttribute('type') === 'radio') {
			const name = el.getAttribute('name');
			if (name) {
				doc.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`).forEach((r) => {
					r.setAttribute('data-survey-slot', String(i));
					r.setAttribute('data-survey-kind', kind);
				});
			}
		}
		if (kind === 'multiple_choice' && el.getAttribute('type') === 'checkbox') {
			const name = el.getAttribute('name');
			if (name) {
				doc.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`).forEach((c) => {
					c.setAttribute('data-survey-slot', String(i));
					c.setAttribute('data-survey-kind', kind);
				});
			}
		}
	}

	return {
		formCss,
		formHtml: doc.body.innerHTML.trim(),
	};
}

/**
 * @param {Record<string, unknown>} answers
 * @param {{ question_id: string, question_text: string, type: string, options_json?: object }[]} questions
 * @returns {string|null} Error message or null if valid
 */
export function validateRequiredAnswers(answers, questions) {
	for (const q of questions) {
		const opts =
			q.options_json && typeof q.options_json === 'object' ? q.options_json : {};
		if (!opts.required) {
			continue;
		}
		const key = q.question_id;
		const val = answers[key];
		const type = String(q.type || 'text');
		if (type === 'multiple_choice') {
			if (!Array.isArray(val) || val.length === 0) {
				return `"${q.question_text}" is required.`;
			}
		} else if (val === undefined || val === null || String(val).trim() === '') {
			return `"${q.question_text}" is required.`;
		}
	}
	return null;
}

/**
 * Normalize postMessage / FormData answers for API submit.
 *
 * @param {Record<string, unknown>} raw
 * @param {{ question_id: string, type: string }[]} questions
 * @returns {Record<string, string | string[]>}
 */
export function normalizeAnswersForSubmit(raw, questions) {
	/** @type {Record<string, string | string[]>} */
	const answers = {};
	for (let i = 0; i < questions.length; i++) {
		const q = questions[i];
		const id = q.question_id;
		const type = String(q.type || 'text');
		// Priority: DB question_id → q-prefixed → position fallback (__pos_N).
		// The __pos_N fallback handles surveys saved before the slot-binding fix
		// where data-question-id still holds editor UUIDs instead of DB UDs.
		const v = raw[id] ?? raw[`q-${id}`] ?? raw[`__pos_${i}`];
		if (v === undefined || v === null || v === '') {
			continue;
		}
		if (type === 'multiple_choice') {
			answers[id] = Array.isArray(v) ? v.map(String) : [String(v)];
		} else {
			answers[id] = Array.isArray(v) ? String(v[0]) : String(v);
		}
	}
	return answers;
}

/**
 * Build iframe srcdoc matching builder preview (full document + styles + bridge).
 *
 * @param {{ formCss?: string, formHtml?: string }} parts
 * @returns {string}
 */
export function buildPublicSrcdoc(parts) {
	const css = String(parts.formCss || '');
	const body = String(parts.formHtml || '');
	// The bridge collects answers in two complementary ways:
	//   1. data-question-id key  – works for all surveys after the server-side
	//      rebindDataQuestionIds() fix stamps actual DB question_ids into the HTML.
	//   2. __pos_N key (field DOM order) – extra safety fallback.
	//
	// For multi-step forms the bridge also ACCUMULATES answers on every `change`
	// event so that answers from earlier steps are not lost when those DOM nodes
	// are removed before the final submit.
	const bridge = `
(function () {
  var accumulated = {};

  function collectFromDom() {
    var answers = {};
    var seenRadio = {};
    var seenCheck = {};
    var slotIdx = 0;
    var form = document.querySelector('form');
    var root = form || document.body;
    var els = root.querySelectorAll('input, select, textarea');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
      var qid = el.getAttribute('data-question-id') || null;
      var posKey = '__pos_' + slotIdx;

      if (type === 'radio') {
        var rName = el.getAttribute('name') || ('__r' + slotIdx);
        if (seenRadio[rName]) continue;
        seenRadio[rName] = true;
        var safeRName = rName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        var checked = root.querySelector('input[type="radio"][name="' + safeRName + '"]:checked');
        if (checked) {
          if (qid) answers[qid] = checked.value;
          answers[posKey] = checked.value;
        }
        slotIdx++;
        continue;
      }

      if (type === 'checkbox') {
        var cName = el.getAttribute('name') || null;
        if (cName && seenCheck[cName]) continue;
        if (cName) seenCheck[cName] = true;
        var safeCName = cName ? cName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : null;
        var cEls = safeCName
          ? root.querySelectorAll('input[type="checkbox"][name="' + safeCName + '"]')
          : [el];
        var vals = [];
        for (var j = 0; j < cEls.length; j++) { if (cEls[j].checked) vals.push(cEls[j].value); }
        if (vals.length) {
          if (qid) answers[qid] = vals;
          answers[posKey] = vals;
        }
        slotIdx++;
        continue;
      }

      if (el.value !== undefined && el.value !== '') {
        if (qid) answers[qid] = String(el.value);
        answers[posKey] = String(el.value);
      }
      slotIdx++;
    }
    return answers;
  }

  function captureNow() {
    var current = collectFromDom();
    for (var k in current) {
      var v = current[k];
      if (v !== null && v !== undefined && v !== '') {
        accumulated[k] = v;
      }
    }
  }

  // Capture on every field change so multi-step forms retain earlier answers
  document.addEventListener('change', captureNow, true);

  function collectAnswers() {
    captureNow();
    return accumulated;
  }

  function notifySubmit() {
    window.parent.postMessage({ type: 'public-survey-submit', answers: collectAnswers() }, '*');
  }
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.tagName === 'FORM') {
      e.preventDefault();
      notifySubmit();
    }
  }, true);

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'public-survey-request-submit') {
      notifySubmit();
    }
  });
})();
`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
html, body { margin: 0; height: auto; min-height: 0; overflow: visible; box-sizing: border-box; }
*, *::before, *::after { box-sizing: inherit; }
/* Hide any submit button rendered inside the form — the outer page footer
   button is the single canonical trigger and posts via postMessage. */
button[type="submit"], input[type="submit"],
.survey-submit, .survey-submit-row { display: none !important; }
${css}
</style>
</head>
<body>
${body}
<script>${bridge}<\/script>
<script>${FRAME_HEIGHT_REPORT_SCRIPT}<\/script>
</body>
</html>`;
}
