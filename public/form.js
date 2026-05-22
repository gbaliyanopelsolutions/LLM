/**
 * Public survey: renders stored LLM HTML/CSS in an iframe (same as builder preview)
 * or falls back to module-rendered fields for legacy surveys.
 */

import { getApiBase } from './supabase.js';
import { renderQuestion } from './modules/renderSurveyFields.js';
import {
	buildPublicSrcdoc,
	normalizeAnswersForSubmit,
	validateRequiredAnswers,
} from './modules/surveyFormHtml.js';
import { attachAutoHeightIframe } from './modules/resizePreviewIframe.js';

const params = new URLSearchParams(window.location.search);
const surveyId = params.get('survey');

const stateLoading = document.getElementById('state-loading');
const stateError = document.getElementById('state-error');
const stateIframe = document.getElementById('state-iframe');
const stateFallback = document.getElementById('state-fallback');
const surveyFrame = document.getElementById('public-survey-frame');
const surveyTitle = document.getElementById('survey-title');
const surveyDesc = document.getElementById('survey-desc');
const formEl = document.getElementById('public-survey-form');
const submitBtn = document.getElementById('submit-btn');
const surveyFooter = document.getElementById('survey-footer');
const toast = document.getElementById('toast');
const loader = document.getElementById('loader');

/** @type {{ question_id: string, type: string, question_text: string, options_json?: object }[]} */
let questions = [];

/** @type {'iframe' | 'fallback'} */
let renderMode = 'fallback';

if (surveyFrame) {
	attachAutoHeightIframe(surveyFrame);
}

/**
 * @param {string} text
 * @param {'default'|'error'|'success'} variant
 */
function showToast(text, variant = 'default') {
	toast.textContent = text;
	toast.classList.remove('toast--error', 'toast--success');
	if (variant === 'error') toast.classList.add('toast--error');
	if (variant === 'success') toast.classList.add('toast--success');
	toast.hidden = false;
	clearTimeout(showToast._t);
	showToast._t = setTimeout(() => {
		toast.hidden = true;
	}, 4000);
}

/**
 * @param {boolean} on
 */
function setBusy(on) {
	loader.hidden = !on;
	if (submitBtn) submitBtn.disabled = on;
}

/**
 * @param {{ name?: string, description?: string | null }} survey
 */
function applyHeader(survey) {
	if (!surveyTitle || !surveyDesc) return;
	const title = survey.name || 'Survey';
	const desc = survey.description || '';
	surveyTitle.textContent = title;
	surveyDesc.textContent = desc;
	surveyDesc.hidden = !desc;
}

/**
 * Toggle a survey view block (loading, error, iframe, fallback).
 *
 * @param {HTMLElement|null|undefined} el
 * @param {boolean} visible
 */
function setBlockVisible(el, visible) {
	if (!el) {
		return;
	}
	el.hidden = !visible;
	el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/**
 * Show iframe (LLM design) or fallback form layout.
 *
 * @param {'iframe'|'fallback'} mode
 */
function showRenderMode(mode) {
	renderMode = mode;
	setBlockVisible(stateLoading, false);
	setBlockVisible(stateError, false);
	if (mode === 'iframe') {
		setBlockVisible(stateIframe, true);
		setBlockVisible(stateFallback, false);
	} else {
		setBlockVisible(stateIframe, false);
		setBlockVisible(stateFallback, true);
	}
	setBlockVisible(surveyFooter, true);
}

/**
 * Load stored LLM design into iframe (matches index.html preview srcdoc).
 *
 * @param {string|null|undefined} formHtml
 * @param {string|null|undefined} formCss
 */
function mountCustomDesign(formHtml, formCss) {
	if (!surveyFrame) return;
	const srcdoc = buildPublicSrcdoc({
		formHtml: formHtml || '',
		formCss: formCss || '',
	});
	surveyFrame.srcdoc = srcdoc;
	showRenderMode('iframe');
}

/**
 * Legacy module-rendered fields when no stored HTML.
 *
 * @param {{ name?: string, description?: string | null }} survey
 */
function mountFallbackForm(survey) {
	applyHeader(survey);
	if (!formEl) return;
	formEl.innerHTML = '';
	for (const q of questions) {
		formEl.appendChild(renderQuestion(q));
	}
	showRenderMode('fallback');
}

/**
 * @param {Record<string, unknown>} rawAnswers
 * @returns {Promise<void>}
 */
async function submitAnswers(rawAnswers) {
	const answers = normalizeAnswersForSubmit(rawAnswers, questions);
	const validationError = validateRequiredAnswers(answers, questions);
	if (validationError) {
		showToast(validationError, 'error');
		return;
	}

	setBusy(true);
	try {
		const res = await fetch(`${getApiBase()}/api/builder/surveys/${encodeURIComponent(surveyId)}/submit`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ answers }),
		});
		const data = await res.json();
		if (!res.ok || !data.ok) {
			const code = data.code || '';
			if (code === 'SURVEY_DRAFT') {
				throw new Error(data.error || 'This survey is not available yet.');
			}
			if (code === 'SURVEY_CLOSED') {
				throw new Error(data.error || 'This survey is no longer accepting responses.');
			}
			throw new Error(data.error || 'Submit failed');
		}
		showToast('Thank you — your responses were saved.', 'success');
		if (renderMode === 'fallback' && formEl) {
			formEl.reset();
		}
		if (renderMode === 'iframe' && surveyFrame) {
			surveyFrame.srcdoc = surveyFrame.srcdoc;
		}
	} catch (err) {
		showToast(err instanceof Error ? err.message : 'Submit failed', 'error');
	} finally {
		setBusy(false);
	}
}

async function loadSurvey() {
	if (!surveyId) {
		setBlockVisible(stateLoading, false);
		setBlockVisible(stateError, true);
		setBlockVisible(stateIframe, false);
		setBlockVisible(stateFallback, false);
		setBlockVisible(surveyFooter, false);
		if (stateError) {
			stateError.textContent = 'Missing survey id. Open a link like /form.html?survey=YOUR_UUID';
		}
		return;
	}
	setBusy(true);
	setBlockVisible(stateLoading, true);
	setBlockVisible(stateError, false);
	setBlockVisible(stateIframe, false);
	setBlockVisible(stateFallback, false);
	setBlockVisible(surveyFooter, false);
	try {
		const res = await fetch(`${getApiBase()}/api/builder/surveys/${encodeURIComponent(surveyId)}/public`);
		const data = await res.json();
		if (!res.ok || !data.ok) {
			const code = data.code || '';
			if (code === 'SURVEY_DRAFT') {
				throw new Error(data.error || 'This survey is not available yet.');
			}
			if (code === 'SURVEY_CLOSED') {
				throw new Error(data.error || 'This survey is no longer accepting responses.');
			}
			throw new Error(data.error || 'Could not load survey');
		}

		questions = data.questions || [];
		const survey = data.survey || {};
		const formHtml = data.form_html || survey.form_html;
		const formCss = data.form_css || survey.form_css;
		const hasDesign =
			data.has_custom_design ||
			survey.has_custom_design ||
			(Boolean(formHtml && String(formHtml).trim()));

		if (hasDesign && formHtml) {
			mountCustomDesign(formHtml, formCss);
		} else {
			mountFallbackForm(survey);
		}
	} catch (e) {
		setBlockVisible(stateLoading, false);
		setBlockVisible(stateError, true);
		setBlockVisible(stateIframe, false);
		setBlockVisible(stateFallback, false);
		setBlockVisible(surveyFooter, false);
		if (stateError) {
			stateError.textContent = e instanceof Error ? e.message : 'Error';
		}
	} finally {
		setBusy(false);
	}
}

/** Iframe bridge: LLM form posts answers via postMessage. */
window.addEventListener('message', (event) => {
	if (!event.data || event.data.type !== 'public-survey-submit') {
		return;
	}
	if (renderMode !== 'iframe') {
		return;
	}
	const raw = event.data.answers;
	if (!raw || typeof raw !== 'object') {
		return;
	}
	submitAnswers(/** @type {Record<string, unknown>} */ (raw));
});

if (formEl) {
	formEl.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!surveyId || renderMode !== 'fallback') return;
		const fd = new FormData(formEl);
		/** @type {Record<string, unknown>} */
		const raw = {};
		for (const q of questions) {
			const type = String(q.type || 'text');
			const id = q.question_id;
			if (type === 'multiple_choice') {
				const vals = fd.getAll(`q-${id}`).filter(Boolean);
				if (vals.length) raw[id] = vals.map(String);
			} else if (type === 'single_choice') {
				const v = fd.get(`q-${id}`);
				if (v) raw[id] = String(v);
			} else {
				const v = fd.get(id);
				if (v !== null && v !== '') raw[id] = String(v);
			}
		}
		await submitAnswers(raw);
	});
}

if (submitBtn) {
	submitBtn.addEventListener('click', (e) => {
		if (renderMode === 'iframe' && surveyFrame?.contentWindow) {
			e.preventDefault();
			surveyFrame.contentWindow.postMessage({ type: 'public-survey-request-submit' }, '*');
			return;
		}
		if (renderMode === 'fallback' && formEl) {
			e.preventDefault();
			formEl.requestSubmit();
		}
	});
}

loadSurvey();
