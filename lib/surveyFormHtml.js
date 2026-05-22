'use strict';

/**
 * Survey form HTML/CSS: sanitization, question binding, public iframe document.
 */

const MAX_HTML_BYTES = 2_000_000;
const MAX_CSS_BYTES = 512_000;

/**
 * @param {string} pgType
 * @param {string} questionId
 * @returns {string}
 */
function fieldNameForQuestion(pgType, questionId) {
	const t = String(pgType || 'text');
	if (t === 'single_choice' || t === 'multiple_choice') {
		return `q-${questionId}`;
	}
	return questionId;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeCss(raw) {
	let css = String(raw || '');
	if (css.length > MAX_CSS_BYTES) {
		css = css.slice(0, MAX_CSS_BYTES);
	}
	css = css.replace(/@import\b/gi, '/* @import blocked */');
	css = css.replace(/expression\s*\(/gi, '/* expression blocked */(');
	css = css.replace(/javascript\s*:/gi, '/* js blocked */');
	return css;
}

/**
 * Strip dangerous markup while keeping inline scripts for multi-step LLM forms.
 *
 * @param {string} html
 * @returns {string}
 */
function sanitizeHtmlBody(html) {
	let out = String(html || '');
	if (out.length > MAX_HTML_BYTES) {
		out = out.slice(0, MAX_HTML_BYTES);
	}
	out = out.replace(/<script\b[^>]*\ssrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi, '');
	out = out.replace(/\s+on\w+\s*=\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s>]+)/gi, '');
	out = out.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');
	out = out.replace(/href\s*=\s*["']\s*javascript:[^"']*["']/gi, 'href="#"');
	out = out.replace(/src\s*=\s*["']\s*javascript:[^"']*["']/gi, '');

	// Placeholder <option> elements that are both disabled and selected should
	// also be `hidden` so they don't appear in the open dropdown list. This is
	// applied to LLM HTML AND legacy stored forms.
	out = out.replace(/<option\b([^>]*)>/gi, (match, attrs) => {
		const hasDisabled = /\bdisabled\b/i.test(attrs);
		const hasSelected = /\bselected\b/i.test(attrs);
		const hasHidden = /\bhidden\b/i.test(attrs);
		if (hasDisabled && hasSelected && !hasHidden) {
			return `<option${attrs} hidden>`;
		}
		return match;
	});

	return out;
}

/**
 * @param {string} fullHtml
 * @returns {{ formCss: string, formHtml: string }}
 */
function splitHtmlDocument(fullHtml) {
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
		formCss: sanitizeCss(styleBlocks.join('\n\n')),
		formHtml: sanitizeHtmlBody(bodyHtml.trim()),
	};
}

/**
 * @param {string} html
 * @param {{ question_id: string, type: string, options_json?: object }[]} questions
 * @returns {string}
 */
function bindQuestionFieldsToHtml(html, questions) {
	let out = sanitizeHtmlBody(html);
	for (let i = 0; i < questions.length; i += 1) {
		const q = questions[i];
		const qid = String(q.question_id || '');
		if (!qid) {
			continue;
		}
		const fieldName = fieldNameForQuestion(q.type, qid);
		const opts =
			q.options_json && typeof q.options_json === 'object' ? q.options_json : {};
		const reqAttr = opts.required ? ' required' : '';
		const slotRe = new RegExp(`(<[^>]+\\bdata-survey-slot=["']${i}["'][^>]*)(>)`, 'gi');

		out = out.replace(slotRe, (_m, pre, close) => {
			let tag = pre;
			if (/\bname\s*=/i.test(tag)) {
				tag = tag.replace(/\bname\s*=\s*(".*?"|'[^']*')/i, `name="${fieldName}"`);
			} else {
				tag = `${tag} name="${fieldName}"`;
			}
			if (!/\bdata-question-id\s*=/i.test(tag)) {
				tag = `${tag} data-question-id="${qid}"`;
			}
			if (reqAttr && !/\brequired\b/i.test(tag)) {
				tag = `${tag}${reqAttr}`;
			}
			return `${tag}${close}`;
		});
	}
	return out;
}

/**
 * Bridge script injected into public iframe — posts answers to parent on submit.
 */
const PUBLIC_FORM_BRIDGE_SCRIPT = `
(function () {
  function collectAnswers() {
    var form = document.querySelector('form');
    var root = form || document.body;
    var answers = {};
    var els = root.querySelectorAll('input, select, textarea');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var qid = el.getAttribute('data-question-id');
      if (!qid) continue;
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'radio') {
        if (el.checked) answers[qid] = el.value;
        continue;
      }
      if (type === 'checkbox') {
        if (!el.checked) continue;
        if (!answers[qid]) answers[qid] = [];
        if (Array.isArray(answers[qid])) answers[qid].push(el.value);
        continue;
      }
      if (el.value !== undefined && el.value !== '') answers[qid] = String(el.value);
    }
    return answers;
  }

  function notifySubmit() {
    try {
      window.parent.postMessage({ type: 'public-survey-submit', answers: collectAnswers() }, '*');
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('submit', function (e) {
    var t = e.target;
    if (t && t.tagName === 'FORM') {
      e.preventDefault();
      notifySubmit();
    }
  }, true);

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('button, [type="submit"], input[type="submit"]') : null;
    if (!btn) return;
    var form = btn.closest && btn.closest('form');
    if (form && (btn.type === 'submit' || btn.getAttribute('type') === 'submit')) {
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

/**
 * @param {{ formCss?: string, formHtml?: string }} parts
 * @returns {string}
 */
function buildPublicSrcdoc(parts) {
	const css = sanitizeCss(parts.formCss || '');
	const body = sanitizeHtmlBody(parts.formHtml || '');
	const bridge = PUBLIC_FORM_BRIDGE_SCRIPT;

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
html, body { margin: 0; height: auto; min-height: 0; overflow: visible; box-sizing: border-box; }
*, *::before, *::after { box-sizing: inherit; }
${css}
</style>
</head>
<body>
${body}
<script>${bridge}<\/script>
</body>
</html>`;
}

module.exports = {
	MAX_HTML_BYTES,
	MAX_CSS_BYTES,
	fieldNameForQuestion,
	sanitizeCss,
	sanitizeHtmlBody,
	splitHtmlDocument,
	bindQuestionFieldsToHtml,
	buildPublicSrcdoc,
	PUBLIC_FORM_BRIDGE_SCRIPT,
};
