'use strict';

const { isDatabaseConfigured, getPool, parsePgError } = require('../db.js');
const {
	splitHtmlDocument,
	bindQuestionFieldsToHtml,
	rebindDataQuestionIds,
	sanitizeCss,
	sanitizeHtmlBody,
} = require('./surveyFormHtml.js');

/** @type {{ hasMax: boolean, hasTotal: boolean } | null} */
let surveySubmissionCols = null;

/** @type {{ hasFormHtml: boolean, hasFormCss: boolean } | null} */
let surveyFormDesignCols = null;

/** @type {{ hasPlaceholder: boolean, hasValidationRules: boolean } | null} */
let questionEditorCols = null;

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ hasPlaceholder: boolean, hasValidationRules: boolean }>}
 */
async function loadQuestionEditorCols(pool) {
	if (questionEditorCols) {
		return questionEditorCols;
	}
	const { rows } = await pool.query(
		`SELECT column_name::text AS name
		 FROM information_schema.columns
		 WHERE table_schema = 'public'
		   AND table_name = 'questions'
		   AND column_name IN ('placeholder', 'validation_rules')`
	);
	const names = new Set(rows.map((r) => r.name));
	questionEditorCols = {
		hasPlaceholder: names.has('placeholder'),
		hasValidationRules: names.has('validation_rules'),
	};
	return questionEditorCols;
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function sanitizeValidationRules(raw) {
	if (!raw || typeof raw !== 'object') {
		return {};
	}
	/** @type {Record<string, unknown>} */
	const out = {};
	const keys = ['minLength', 'maxLength', 'min', 'max', 'pattern', 'accept'];
	for (const key of keys) {
		const v = /** @type {Record<string, unknown>} */ (raw)[key];
		if (v === null || v === undefined || v === '') {
			continue;
		}
		if (key === 'pattern' || key === 'accept') {
			out[key] = String(v).slice(0, 500);
			continue;
		}
		const n = Number(v);
		if (!Number.isNaN(n)) {
			out[key] = n;
		}
	}
	return out;
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ hasMax: boolean, hasTotal: boolean }>}
 */
async function loadSurveySubmissionCols(pool) {
	if (surveySubmissionCols) {
		return surveySubmissionCols;
	}
	const { rows } = await pool.query(
		`SELECT column_name::text AS name
		 FROM information_schema.columns
		 WHERE table_schema = 'public'
		   AND table_name = 'surveys'
		   AND column_name IN ('max_submissions', 'total_submissions')`
	);
	const names = new Set(rows.map((r) => r.name));
	surveySubmissionCols = {
		hasMax: names.has('max_submissions'),
		hasTotal: names.has('total_submissions'),
	};
	return surveySubmissionCols;
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ hasFormHtml: boolean, hasFormCss: boolean }>}
 */
async function loadSurveyFormDesignCols(pool) {
	if (surveyFormDesignCols) {
		return surveyFormDesignCols;
	}
	const { rows } = await pool.query(
		`SELECT column_name::text AS name
		 FROM information_schema.columns
		 WHERE table_schema = 'public'
		   AND table_name = 'surveys'
		   AND column_name IN ('form_html', 'form_css')`
	);
	const names = new Set(rows.map((r) => r.name));
	surveyFormDesignCols = {
		hasFormHtml: names.has('form_html'),
		hasFormCss: names.has('form_css'),
	};
	return surveyFormDesignCols;
}

/**
 * @param {string} alias
 * @returns {string}
 */
function responseCountSql(alias) {
	return `(SELECT count(DISTINCT date_trunc('second', r.submitted_at))::int
		FROM public.responses r
		WHERE r.survey_id = ${alias}.survey_id)`;
}

/**
 * @param {string} alias
 * @param {boolean} hasMax
 * @returns {string}
 */
function selectMaxSubmissionsSql(alias, hasMax) {
	return hasMax ? `${alias}.max_submissions` : 'NULL::integer AS max_submissions';
}

/**
 * @param {string} alias
 * @param {boolean} hasTotal
 * @returns {string}
 */
function selectTotalSubmissionsSql(alias, hasTotal) {
	const sub = responseCountSql(alias);
	if (hasTotal) {
		return `COALESCE(${alias}.total_submissions, ${sub}, 0) AS total_submissions`;
	}
	return `COALESCE(${sub}, 0) AS total_submissions`;
}

const JSON_SYSTEM = `You are a survey schema assistant. Output ONLY a valid JSON object — no markdown, no explanation.

Supported question types: text, textarea, email, radio, checkbox, select, number, date, rating, matrix_rating.

Standard question shape:
{ "question": "...", "type": "...", "required": true, "options": ["for radio/checkbox/select only"] }

Matrix rating shape (ONE parent question + multiple sub-items on the SAME scale):
{
  "type": "matrix_rating",
  "question": "How satisfied are you with X in terms of the following:",
  "rows": ["Purchase Process", "Agent Interactions", "Claim Experiences"],
  "scale": { "min": 0, "max": 10 },
  "required": true
}

Detection rules:
- Use matrix_rating when a single question title introduces multiple sub-items (rows) all rated on the same numeric scale.
- Do NOT split a matrix into separate rating questions for each row.
- Use rating for a single standalone 0-10 / 1-5 question (no sub-items).
- For radio/checkbox/select always include "options" array with 2+ strings.

STYLE EXTRACTION (read the user prompt carefully):
- If the prompt mentions a background color, hex code, or "dark/light theme" → set style.backgroundColor
- If the prompt mentions a text color or font color → set style.textColor
- If the prompt mentions a button or accent color → set style.accentColor
- If the prompt mentions a logo URL or image URL → set style.logoUrl
- If the prompt mentions a card/panel background → set style.cardColor
- Derive sensible defaults: dark bg → light text; light bg → dark text.
- Omit style fields that are not mentioned — do NOT invent colors.

Return exactly:
{
  "title": "Survey title",
  "description": "Brief description",
  "style": {
    "backgroundColor": "#hex or empty",
    "textColor": "#hex or empty",
    "accentColor": "#hex or empty",
    "cardColor": "#hex or empty",
    "logoUrl": "url or empty"
  },
  "questions": [ ...question objects... ]
}
Omit the entire "style" key if no styling was requested.`;

/**
 * Retry an async function on HTTP 429, up to maxRetries times.
 * @param {() => Promise<any>} fn
 * @param {number} [maxRetries=2]
 * @param {number} [delayMs=6000]
 */
async function callWithRetry(fn, maxRetries = 2, delayMs = 6000) {
	let lastErr;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			const status = (err && (err.status || err.statusCode)) || 0;
			if (status === 429 && attempt < maxRetries) {
				console.warn(`[generateSurveyJson] 429 rate limit — retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})…`);
				await new Promise((r) => setTimeout(r, delayMs));
				continue;
			}
			throw err;
		}
	}
	throw lastErr;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function extractJson(raw) {
	let text = String(raw).trim();
	const fence = /^```(?:json)?\s*\n?/i;
	if (fence.test(text)) {
		text = text.replace(fence, '');
		text = text.replace(/\n?```\s*$/i, '');
	}
	return text.trim();
}

/**
 * @param {string} t
 * @returns {string}
 */
function mapQuestionType(t) {
	const x = String(t || '').toLowerCase().trim();
	const map = {
		text: 'text',
		textarea: 'text',
		email: 'text',
		file: 'text',
		number: 'number',
		date: 'date',
		radio: 'single_choice',
		checkbox: 'multiple_choice',
		select: 'single_choice',
		single_choice: 'single_choice',
		multiple_choice: 'multiple_choice',
		likert: 'likert',
		rating: 'rating',
		matrix: 'matrix',
	};
	return map[x] || 'text';
}

/**
 * @returns {{ status: number, json: object } | null}
 */
function dbUnavailableResponse() {
	if (!isDatabaseConfigured()) {
		return { status: 503, json: { ok: false, error: 'Database not configured', code: 'NO_DATABASE' } };
	}
	return null;
}

/**
 * @returns {Promise<{ status: number, json: object }>}
 */
async function listCompanies() {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	try {
		const pool = getPool();
		const { rows } = await pool.query(
			`SELECT company_id, name, industry, region, tier, created_at
			 FROM public.companies
			 ORDER BY name ASC
			 LIMIT 500`
		);
		return { status: 200, json: { ok: true, companies: rows } };
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: number, json: object }>}
 */
async function createCompany(body) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const b = body && typeof body === 'object' ? body : {};
	const name = typeof b.name === 'string' ? b.name.trim() : '';
	const industry = typeof b.industry === 'string' ? b.industry.trim() : '';
	const region = typeof b.region === 'string' ? b.region.trim() : '';
	const tierRaw = typeof b.tier === 'string' ? b.tier.trim() : '';
	const allowedTiers = new Set(['Tier 1', 'Tier 2', 'Tier 3']);
	if (!name) {
		return { status: 400, json: { ok: false, error: 'Company name is required', code: 'VALIDATION' } };
	}
	if (!tierRaw || !allowedTiers.has(tierRaw)) {
		return {
			status: 400,
			json: { ok: false, error: 'Tier must be Tier 1, Tier 2, or Tier 3', code: 'VALIDATION' },
		};
	}
	try {
		const pool = getPool();
		const { rows } = await pool.query(
			`INSERT INTO public.companies (name, industry, region, tier, metadata)
			 VALUES ($1, $2, $3, $4, '{}'::jsonb)
			 RETURNING company_id, name, industry, region, tier, created_at`,
			[name, industry || null, region || null, tierRaw]
		);
		return { status: 201, json: { ok: true, company: rows[0] } };
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * @param {{ anthropic: import('@anthropic-ai/sdk').default, model: string, body: Record<string, unknown> }} opts
 * @returns {Promise<{ status: number, json: object }>}
 */
async function generateSurveyJson({ anthropic, model, body }) {
	const b = body && typeof body === 'object' ? body : {};
	const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
	const htmlSample = typeof b.htmlSample === 'string' ? b.htmlSample.slice(0, 12000) : '';
	const history = Array.isArray(b.messages) ? b.messages : [];

	if (!prompt) {
		return { status: 400, json: { ok: false, error: 'Missing prompt', code: 'MISSING_PROMPT' } };
	}
	if (!process.env.ANTHROPIC_API_KEY) {
		return { status: 500, json: { ok: false, error: 'ANTHROPIC_API_KEY is not set', code: 'MISSING_API_KEY' } };
	}

	// Keep at most the last 4 history turns and truncate each to 1500 chars
	// to avoid exceeding the 30 k tokens/min rate limit.
	const MAX_HISTORY_TURNS = 4;
	const MAX_TURN_CHARS = 1_500;
	const msgs = [];
	for (const item of history) {
		if (item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string') {
			const content = item.content.length > MAX_TURN_CHARS
				? `${item.content.slice(0, MAX_TURN_CHARS)}\n…(truncated)`
				: item.content;
			msgs.push({ role: item.role, content });
		}
	}
	const trimmedHistory = msgs.slice(-MAX_HISTORY_TURNS);

	const userBlock = `Generate the survey JSON for this request:\n${prompt}`;
	const messages = [...trimmedHistory, { role: 'user', content: userBlock }];

	try {
		const message = await callWithRetry(() =>
			anthropic.messages.create({
				model,
				max_tokens: 4000,
				system: JSON_SYSTEM,
				messages,
			})
		);
		const raw = message.content
			.filter((block) => block.type === 'text')
			.map((block) => block.text)
			.join('');
		const jsonText = extractJson(raw);
		const parsed = JSON.parse(jsonText);
		if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.questions)) {
			throw new Error('Invalid JSON shape from model');
		}
		return { status: 200, json: { ok: true, survey: parsed } };
	} catch (err) {
		const status = (err && (err.status || err.statusCode)) || 0;
		const msg = err instanceof Error ? err.message : 'JSON generation failed';
		if (status === 429) {
			return { status: 429, json: { ok: false, error: 'Rate limited — please wait a moment and try again.', code: 'RATE_LIMIT' } };
		}
		return { status: 502, json: { ok: false, error: msg, code: 'JSON_GENERATE' } };
	}
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: number, json: object }>}
 */
async function saveSurvey(body) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const b = body && typeof body === 'object' ? body : {};
	const companyId = typeof b.companyId === 'string' ? b.companyId.trim() : '';
	const survey = b.survey;
	if (!companyId) {
		return { status: 400, json: { ok: false, error: 'companyId is required', code: 'VALIDATION' } };
	}
	if (!survey || typeof survey !== 'object' || typeof survey.title !== 'string' || !Array.isArray(survey.questions)) {
		return { status: 400, json: { ok: false, error: 'Invalid survey payload', code: 'VALIDATION' } };
	}

	const title = survey.title.trim();
	const desc =
		typeof survey.description === 'string' ? survey.description.trim() : '';
	if (!title) {
		return { status: 400, json: { ok: false, error: 'Survey title is required', code: 'VALIDATION' } };
	}
	if (!desc) {
		return { status: 400, json: { ok: false, error: 'Survey description is required', code: 'VALIDATION' } };
	}

	const statusRaw = typeof b.status === 'string' ? b.status.trim().toLowerCase() : 'draft';
	const mapped = uiStatusToDb(statusRaw);
	const status = mapped || 'draft';
	if (!['draft', 'active', 'closed'].includes(status)) {
		return {
			status: 400,
			json: { ok: false, error: 'Invalid status. Use draft, published, or closed.', code: 'VALIDATION' },
		};
	}
	const maxSubmissions = maxSubmissionsFromBody(b, survey);

	const pool = getPool();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows: cRows } = await client.query(
			`SELECT 1 FROM public.companies WHERE company_id = $1::uuid LIMIT 1`,
			[companyId]
		);
		if (!cRows.length) {
			await client.query('ROLLBACK');
			return { status: 404, json: { ok: false, error: 'Company not found', code: 'NOT_FOUND' } };
		}

		const cols = await loadSurveySubmissionCols(pool);
		const insertParams = [
			title,
			desc,
			'llm-builder',
			status,
			companyId,
			JSON.stringify({ source: 'llm-form-builder' }),
		];
		let insertSql = `INSERT INTO public.surveys (name, description, category, status, company_id, settings_json)
			 VALUES ($1, $2, $3, $4::public.survey_status, $5::uuid, $6::jsonb)
			 RETURNING survey_id`;
		if (cols.hasMax) {
			insertSql = `INSERT INTO public.surveys (name, description, category, status, company_id, settings_json, max_submissions)
			 VALUES ($1, $2, $3, $4::public.survey_status, $5::uuid, $6::jsonb, $7)
			 RETURNING survey_id`;
			insertParams.push(maxSubmissions);
		}
		const { rows: sRows } = await client.query(insertSql, insertParams);
		const surveyId = sRows[0].survey_id;

		const editorCols = await loadQuestionEditorCols(pool);
		let order = 0;
		for (const q of survey.questions) {
			order += 1;
			const qtext = typeof q.question === 'string' ? q.question.trim() : '';
			if (!qtext) {
				continue;
			}
			const pgType = mapQuestionType(q.type);
			const opts = {};
			if (Array.isArray(q.options) && q.options.length) {
				opts.options = q.options.map((o) => String(o));
			}
			if (typeof q.required === 'boolean') {
				opts.required = q.required;
			}
			const placeholder =
				typeof q.placeholder === 'string' && q.placeholder.trim()
					? q.placeholder.slice(0, 500)
					: null;
			const validationRules = sanitizeValidationRules(q.validation);
			const cols = ['survey_id', 'question_text', 'type', 'sort_order', 'options_json'];
			const placeholders = ['$1::uuid', '$2', '$3::public.question_type', '$4', '$5::jsonb'];
			const values = [surveyId, qtext, pgType, order, JSON.stringify(opts)];
			if (editorCols.hasPlaceholder) {
				cols.push('placeholder');
				placeholders.push(`$${values.length + 1}`);
				values.push(placeholder);
			}
			if (editorCols.hasValidationRules) {
				cols.push('validation_rules');
				placeholders.push(`$${values.length + 1}::jsonb`);
				values.push(JSON.stringify(validationRules));
			}
			await client.query(
				`INSERT INTO public.questions (${cols.join(', ')})
				 VALUES (${placeholders.join(', ')})`,
				values
			);
		}

		const { rows: qCount } = await client.query(
			`SELECT count(*)::int AS n FROM public.questions WHERE survey_id = $1::uuid`,
			[surveyId]
		);
		if (!qCount[0] || qCount[0].n < 1) {
			await client.query('ROLLBACK');
			return { status: 400, json: { ok: false, error: 'No valid questions to save', code: 'VALIDATION' } };
		}

		const formCols = await loadSurveyFormDesignCols(pool);
		const rawFormHtml =
			typeof b.formHtml === 'string'
				? b.formHtml
				: typeof survey.formHtml === 'string'
					? survey.formHtml
					: '';
		const rawFormCss =
			typeof b.formCss === 'string'
				? b.formCss
				: typeof survey.formCss === 'string'
					? survey.formCss
					: '';

		if (formCols.hasFormHtml && rawFormHtml.trim()) {
			const { rows: qRows } = await client.query(
				`SELECT question_id, type, options_json, sort_order
				 FROM public.questions
				 WHERE survey_id = $1::uuid
				 ORDER BY sort_order ASC`,
				[surveyId]
			);

			let bodyHtml = rawFormHtml.trim();
			let css = rawFormCss.trim();
			if (!css || bodyHtml.includes('<style')) {
				const split = splitHtmlDocument(rawFormHtml);
				if (!css) {
					css = split.formCss;
				}
				if (split.formHtml) {
					bodyHtml = split.formHtml;
				}
			}

			const boundHtml = bindQuestionFieldsToHtml(bodyHtml, qRows);
			const safeCss = sanitizeCss(css);
			const safeHtml = sanitizeHtmlBody(boundHtml);

			if (formCols.hasFormCss) {
				await client.query(
					`UPDATE public.surveys SET form_html = $2, form_css = $3, updated_at = now() WHERE survey_id = $1::uuid`,
					[surveyId, safeHtml, safeCss]
				);
			} else {
				await client.query(
					`UPDATE public.surveys SET form_html = $2, updated_at = now() WHERE survey_id = $1::uuid`,
					[surveyId, safeHtml]
				);
			}
		}

		await client.query('COMMIT');
		return { status: 201, json: { ok: true, surveyId, questionCount: qCount[0].n, status } };
	} catch (err) {
		await client.query('ROLLBACK');
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	} finally {
		client.release();
	}
}

/**
 * @param {string} surveyId
 * @returns {Promise<{ status: number, json: object }>}
 */
async function getPublicSurvey(surveyId) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const id = String(surveyId || '').trim();
	if (!id) {
		return { status: 400, json: { ok: false, error: 'Missing survey id', code: 'VALIDATION' } };
	}
	try {
		const pool = getPool();
		const cols = await loadSurveySubmissionCols(pool);
		const formCols = await loadSurveyFormDesignCols(pool);
		const formSelect = formCols.hasFormHtml
			? `, s.form_html${formCols.hasFormCss ? ', s.form_css' : ', NULL::text AS form_css'}`
			: ', NULL::text AS form_html, NULL::text AS form_css';
		const { rows: sRows } = await pool.query(
			`SELECT survey_id, name, description, company_id, status,
				${selectMaxSubmissionsSql('s', cols.hasMax)},
				${selectTotalSubmissionsSql('s', cols.hasTotal)}
				${formSelect}
			 FROM public.surveys s
			 WHERE survey_id = $1::uuid
			 LIMIT 1`,
			[id]
		);
		if (!sRows.length) {
			return { status: 404, json: { ok: false, error: 'Survey not found', code: 'NOT_FOUND' } };
		}
		const row = sRows[0];
		const ui = dbStatusToUi(row.status);
		if (ui === 'draft') {
			return {
				status: 403,
				json: {
					ok: false,
					error: 'This survey is not available yet.',
					code: 'SURVEY_DRAFT',
				},
			};
		}
		if (ui === 'closed') {
			return {
				status: 403,
				json: {
					ok: false,
					error: 'This survey is no longer accepting responses.',
					code: 'SURVEY_CLOSED',
				},
			};
		}
		if (ui !== 'published') {
			return { status: 404, json: { ok: false, error: 'Survey not available', code: 'NOT_FOUND' } };
		}
		const editorCols = await loadQuestionEditorCols(pool);
		const editorSelect = [
			editorCols.hasPlaceholder ? 'placeholder' : 'NULL::text AS placeholder',
			editorCols.hasValidationRules ? 'validation_rules' : `'{}'::jsonb AS validation_rules`,
		].join(', ');
		const { rows: qRows } = await pool.query(
			`SELECT question_id, question_text, type, sort_order, options_json, ${editorSelect}
			 FROM public.questions
			 WHERE survey_id = $1::uuid
			 ORDER BY sort_order ASC`,
			[id]
		);
		const survey = enrichSurveyRow(row);
		const hasDesign = Boolean(row.form_html && String(row.form_html).trim());

		// Rebind data-question-id attributes from editor UUIDs → real DB question_ids.
		// This fixes validation for surveys saved before the slot-binding fix was deployed:
		// the stored HTML may have local editor UUIDs; rebindDataQuestionIds replaces them
		// positionally so the iframe bridge can key answers by the actual DB question_id.
		const formHtml = hasDesign && row.form_html
			? rebindDataQuestionIds(row.form_html, qRows)
			: null;

		return {
			status: 200,
			json: {
				ok: true,
				survey: { ...survey, has_custom_design: hasDesign },
				form_html: formHtml,
				form_css: row.form_css || null,
				has_custom_design: hasDesign,
				questions: qRows,
			},
		};
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} companyId
 * @returns {Promise<string>}
 */
async function getOrCreatePublicRespondent(client, companyId) {
	const email = `public-form-${companyId}@respondents.internal`;
	const { rows: existing } = await client.query(
		`SELECT respondent_id FROM public.respondents WHERE lower(email::text) = lower($1) LIMIT 1`,
		[email]
	);
	if (existing.length) {
		return existing[0].respondent_id;
	}
	const { rows: ins } = await client.query(
		`INSERT INTO public.respondents (company_id, full_name, email, profile_json)
		 VALUES ($1::uuid, $2, $3::citext, $4::jsonb)
		 RETURNING respondent_id`,
		[companyId, 'Public form respondent', email, JSON.stringify({ anonymous: true })]
	);
	return ins[0].respondent_id;
}

/**
 * @param {string} surveyId
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: number, json: object }>}
 */
async function submitSurvey(surveyId, body) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const sid = String(surveyId || '').trim();
	const b = body && typeof body === 'object' ? body : {};
	const answers = b.answers;
	if (!sid) {
		return { status: 400, json: { ok: false, error: 'Missing survey id', code: 'VALIDATION' } };
	}
	if (!answers || typeof answers !== 'object') {
		return { status: 400, json: { ok: false, error: 'answers object required', code: 'VALIDATION' } };
	}

	const pool = getPool();
	const cols = await loadSurveySubmissionCols(pool);
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const { rows: sRows } = await client.query(
			`SELECT survey_id, company_id, status,
				${selectMaxSubmissionsSql('s', cols.hasMax)},
				${selectTotalSubmissionsSql('s', cols.hasTotal)}
			 FROM public.surveys s
			 WHERE survey_id = $1::uuid
			 FOR UPDATE`,
			[sid]
		);
		if (!sRows.length) {
			await client.query('ROLLBACK');
			return { status: 404, json: { ok: false, error: 'Survey not found', code: 'NOT_FOUND' } };
		}
		const surveyRow = sRows[0];
		const ui = dbStatusToUi(surveyRow.status);
		if (ui === 'draft') {
			await client.query('ROLLBACK');
			return {
				status: 403,
				json: { ok: false, error: 'This survey is not available yet.', code: 'SURVEY_DRAFT' },
			};
		}
		if (ui === 'closed') {
			await client.query('ROLLBACK');
			return {
				status: 403,
				json: {
					ok: false,
					error: 'This survey is no longer accepting responses.',
					code: 'SURVEY_CLOSED',
				},
			};
		}
		if (ui !== 'published') {
			await client.query('ROLLBACK');
			return { status: 404, json: { ok: false, error: 'Survey not found', code: 'NOT_FOUND' } };
		}
		const maxCap =
			surveyRow.max_submissions === null || surveyRow.max_submissions === undefined
				? null
				: Number(surveyRow.max_submissions);
		const currentTotal = Number(surveyRow.total_submissions) || 0;
		if (maxCap != null && !Number.isNaN(maxCap) && currentTotal >= maxCap) {
			await client.query(
				`UPDATE public.surveys SET status = 'closed'::public.survey_status, closed_at = COALESCE(closed_at, now()), updated_at = now()
				 WHERE survey_id = $1::uuid`,
				[sid]
			);
			await client.query('COMMIT');
			return {
				status: 403,
				json: {
					ok: false,
					error: 'This survey is no longer accepting responses.',
					code: 'SURVEY_CLOSED',
				},
			};
		}

		const companyId = surveyRow.company_id;
		const respondentId = await getOrCreatePublicRespondent(client, companyId);

		const entries = Object.entries(answers);
		for (const [qid, value] of entries) {
			const { rows: qCheck } = await client.query(
				`SELECT question_id, type FROM public.questions WHERE question_id = $1::uuid AND survey_id = $2::uuid LIMIT 1`,
				[qid, sid]
			);
			if (!qCheck.length) {
				continue;
			}
			let answerText = null;
			let answerScore = null;
			let answerJson = null;
			if (value === null || value === undefined) {
				answerJson = JSON.stringify({ skipped: true });
			} else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
				answerText = String(value);
				answerJson = JSON.stringify({ value });
			} else if (Array.isArray(value)) {
				answerJson = JSON.stringify({ values: value });
				answerText = value.map((v) => String(v)).join(', ');
			} else if (typeof value === 'object') {
				answerJson = JSON.stringify(value);
			} else {
				answerJson = JSON.stringify({ raw: value });
			}

			await client.query(
				`INSERT INTO public.responses (
					survey_id, respondent_id, company_id, question_id, answer_text, answer_score, answer_json
				) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb)`,
				[sid, respondentId, companyId, qid, answerText, answerScore, answerJson]
			);
		}

		let newTotal = currentTotal + 1;
		let maxAfter = maxCap;
		if (cols.hasTotal) {
			const { rows: incRows } = await client.query(
				`UPDATE public.surveys
				 SET total_submissions = total_submissions + 1,
				     updated_at = now()
				 WHERE survey_id = $1::uuid
				 RETURNING total_submissions, max_submissions`,
				[sid]
			);
			const after = incRows[0];
			newTotal = Number(after?.total_submissions) || currentTotal + 1;
			maxAfter =
				after?.max_submissions === null || after?.max_submissions === undefined
					? null
					: Number(after.max_submissions);
		} else {
			await client.query(
				`UPDATE public.surveys SET updated_at = now() WHERE survey_id = $1::uuid`,
				[sid]
			);
			const { rows: countRows } = await client.query(
				`SELECT ${responseCountSql('s')}::int AS total FROM public.surveys s WHERE survey_id = $1::uuid`,
				[sid]
			);
			newTotal = Number(countRows[0]?.total) || newTotal;
		}
		let autoClosed = false;
		if (maxAfter != null && !Number.isNaN(maxAfter) && newTotal >= maxAfter) {
			await client.query(
				`UPDATE public.surveys
				 SET status = 'closed'::public.survey_status,
				     closed_at = COALESCE(closed_at, now()),
				     updated_at = now()
				 WHERE survey_id = $1::uuid`,
				[sid]
			);
			autoClosed = true;
		}

		await client.query('COMMIT');
		return {
			status: 201,
			json: {
				ok: true,
				saved: entries.length,
				total_submissions: newTotal,
				auto_closed: autoClosed,
			},
		};
	} catch (err) {
		await client.query('ROLLBACK');
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	} finally {
		client.release();
	}
}

/** UI: Draft / Published / Closed. DB enum uses `active` for Published. */
const STATUS_UI_TO_DB = {
	draft: 'draft',
	published: 'active',
	active: 'active',
	closed: 'closed',
};

/**
 * @param {string} dbStatus
 * @returns {string}
 */
function dbStatusToUi(dbStatus) {
	const s = String(dbStatus || '').toLowerCase();
	if (s === 'active') {
		return 'published';
	}
	if (s === 'archived') {
		return 'closed';
	}
	return s;
}

/**
 * @param {string} uiStatus
 * @returns {string|null}
 */
function uiStatusToDb(uiStatus) {
	const key = String(uiStatus || '').toLowerCase();
	return STATUS_UI_TO_DB[key] || null;
}

/**
 * @param {unknown} raw
 * @returns {number|null} null = unlimited
 */
function parseMaxSubmissions(raw) {
	if (raw === null || raw === undefined || raw === '') {
		return null;
	}
	const n = parseInt(String(raw), 10);
	if (Number.isNaN(n) || n < 1) {
		return null;
	}
	return n;
}

/**
 * @param {Record<string, unknown>} b
 * @param {Record<string, unknown>} [survey]
 * @returns {number|null}
 */
function maxSubmissionsFromBody(b, survey) {
	if (survey && 'maxSubmissions' in survey) {
		return parseMaxSubmissions(survey.maxSubmissions);
	}
	if (survey && 'max_submissions' in survey) {
		return parseMaxSubmissions(survey.max_submissions);
	}
	if (b && 'maxSubmissions' in b) {
		return parseMaxSubmissions(b.maxSubmissions);
	}
	if (b && 'max_submissions' in b) {
		return parseMaxSubmissions(b.max_submissions);
	}
	return null;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function enrichSurveyRow(row) {
	const total = Number(row.total_submissions ?? row.submit_count ?? 0) || 0;
	const max =
		row.max_submissions === null || row.max_submissions === undefined
			? null
			: Number(row.max_submissions);
	const maxVal = max != null && !Number.isNaN(max) ? max : null;
	const remaining = maxVal != null ? Math.max(0, maxVal - total) : null;
	return {
		...row,
		status_ui: dbStatusToUi(row.status),
		total_submissions: total,
		submit_count: total,
		max_submissions: maxVal,
		remaining_submissions: remaining,
	};
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
function isUuidLike(raw) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		String(raw || '').trim()
	);
}

/**
 * @param {{ search?: string, page?: number, pageSize?: number }} params
 * @returns {Promise<{ status: number, json: object }>}
 */
async function listSurveys(params = {}) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const search = typeof params.search === 'string' ? params.search.trim() : '';
	const page = Math.max(1, parseInt(String(params.page || 1), 10) || 1);
	const pageSize = Math.min(100, Math.max(1, parseInt(String(params.pageSize || 10), 10) || 10));
	const offset = (page - 1) * pageSize;
	const pattern = search ? `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%` : null;

	try {
		const pool = getPool();
		const cols = await loadSurveySubmissionCols(pool);
		const countParams = pattern ? [pattern, pattern] : [];
		const { rows: countRows } = await pool.query(
			`SELECT count(*)::int AS total
			 FROM public.surveys s
			 INNER JOIN public.companies c ON c.company_id = s.company_id
			 WHERE ($1::text IS NULL OR s.name ILIKE $1 OR c.name ILIKE $1)`,
			pattern ? [pattern] : [null]
		);
		const total = countRows[0]?.total ?? 0;

		const { rows } = await pool.query(
			`SELECT
				s.survey_id,
				s.name,
				s.description,
				s.status,
				s.created_at,
				s.updated_at,
				c.company_id,
				c.name AS company_name,
				${selectMaxSubmissionsSql('s', cols.hasMax)},
				${selectTotalSubmissionsSql('s', cols.hasTotal)},
				(SELECT count(*)::int FROM public.questions q WHERE q.survey_id = s.survey_id) AS question_count
			 FROM public.surveys s
			 INNER JOIN public.companies c ON c.company_id = s.company_id
			 WHERE ($1::text IS NULL OR s.name ILIKE $1 OR c.name ILIKE $1)
			 ORDER BY s.created_at DESC
			 LIMIT $2 OFFSET $3`,
			pattern ? [pattern, pageSize, offset] : [null, pageSize, offset]
		);

		const surveys = rows.map((row) => enrichSurveyRow(row));

		return {
			status: 200,
			json: {
				ok: true,
				surveys,
				pagination: {
					page,
					pageSize,
					total,
					totalPages: Math.max(1, Math.ceil(total / pageSize)),
				},
			},
		};
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * @param {string} surveyId
 * @returns {Promise<{ status: number, json: object }>}
 */
async function getSurveyById(surveyId) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const id = String(surveyId || '').trim();
	if (!isUuidLike(id)) {
		return { status: 400, json: { ok: false, error: 'Invalid survey id', code: 'VALIDATION' } };
	}
	try {
		const pool = getPool();
		const cols = await loadSurveySubmissionCols(pool);
		const { rows: sRows } = await pool.query(
			`SELECT
				s.survey_id,
				s.name,
				s.description,
				s.status,
				s.category,
				s.created_at,
				s.updated_at,
				s.closed_at,
				c.company_id,
				c.name AS company_name,
				c.tier AS company_tier,
				${selectMaxSubmissionsSql('s', cols.hasMax)},
				${selectTotalSubmissionsSql('s', cols.hasTotal)}
			 FROM public.surveys s
			 INNER JOIN public.companies c ON c.company_id = s.company_id
			 WHERE s.survey_id = $1::uuid
			 LIMIT 1`,
			[id]
		);
		if (!sRows.length) {
			return { status: 404, json: { ok: false, error: 'Survey not found', code: 'NOT_FOUND' } };
		}
		const editorCols2 = await loadQuestionEditorCols(pool);
		const editorSelect2 = [
			editorCols2.hasPlaceholder ? 'placeholder' : 'NULL::text AS placeholder',
			editorCols2.hasValidationRules ? 'validation_rules' : `'{}'::jsonb AS validation_rules`,
		].join(', ');
		const { rows: qRows } = await pool.query(
			`SELECT question_id, question_text, type, sort_order, options_json, ${editorSelect2}
			 FROM public.questions
			 WHERE survey_id = $1::uuid
			 ORDER BY sort_order ASC`,
			[id]
		);
		const survey = enrichSurveyRow(sRows[0]);
		return { status: 200, json: { ok: true, survey, questions: qRows } };
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * @param {string} surveyId
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: number, json: object }>}
 */
async function updateSurvey(surveyId, body) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const id = String(surveyId || '').trim();
	if (!isUuidLike(id)) {
		return { status: 400, json: { ok: false, error: 'Invalid survey id', code: 'VALIDATION' } };
	}
	const b = body && typeof body === 'object' ? body : {};
	const sets = [];
	const values = [];
	let idx = 1;

	if (typeof b.name === 'string' && b.name.trim()) {
		sets.push(`name = $${idx++}`);
		values.push(b.name.trim());
	}
	if (typeof b.description === 'string') {
		sets.push(`description = $${idx++}`);
		values.push(b.description.trim());
	}
	if (typeof b.status === 'string') {
		const dbStatus = uiStatusToDb(b.status);
		if (!dbStatus || !['draft', 'active', 'closed'].includes(dbStatus)) {
			return {
				status: 400,
				json: { ok: false, error: 'Invalid status. Use draft, published, or closed.', code: 'VALIDATION' },
			};
		}
		sets.push(`status = $${idx++}::public.survey_status`);
		values.push(dbStatus);
		if (dbStatus === 'closed') {
			sets.push(`closed_at = COALESCE(closed_at, now())`);
		} else {
			sets.push(`closed_at = NULL`);
		}
	}
	try {
		const pool = getPool();
		const cols = await loadSurveySubmissionCols(pool);
		if (cols.hasMax && ('maxSubmissions' in b || 'max_submissions' in b)) {
			sets.push(`max_submissions = $${idx++}`);
			values.push(maxSubmissionsFromBody(b, null));
		}

		if (!sets.length) {
			return { status: 400, json: { ok: false, error: 'No fields to update', code: 'VALIDATION' } };
		}

		sets.push('updated_at = now()');
		values.push(id);

		const { rows } = await pool.query(
			`UPDATE public.surveys SET ${sets.join(', ')} WHERE survey_id = $${idx}::uuid
			 RETURNING survey_id, name, description, status, created_at, updated_at`,
			values
		);
		if (!rows.length) {
			return { status: 404, json: { ok: false, error: 'Survey not found', code: 'NOT_FOUND' } };
		}
		return {
			status: 200,
			json: {
				ok: true,
				survey: enrichSurveyRow(rows[0]),
			},
		};
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * @param {string} surveyId
 * @returns {Promise<{ status: number, json: object }>}
 */
async function deleteSurvey(surveyId) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const id = String(surveyId || '').trim();
	if (!isUuidLike(id)) {
		return { status: 400, json: { ok: false, error: 'Invalid survey id', code: 'VALIDATION' } };
	}
	try {
		const pool = getPool();
		const { rowCount } = await pool.query(
			`DELETE FROM public.surveys WHERE survey_id = $1::uuid`,
			[id]
		);
		if (!rowCount) {
			return { status: 404, json: { ok: false, error: 'Survey not found', code: 'NOT_FOUND' } };
		}
		return { status: 200, json: { ok: true, deleted: true } };
	} catch (err) {
		const { message, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: message, code: code || 'DB_ERROR' } };
	}
}

/**
 * Persist LLM prompt + generated HTML to public.submissions (message = prompt, result = HTML).
 *
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: number, json: object }>}
 */
async function createSubmission(body) {
	const guard = dbUnavailableResponse();
	if (guard) {
		return guard;
	}
	const b = body && typeof body === 'object' ? body : {};
	const message = typeof b.message === 'string' ? b.message.trim() : '';
	if (!message) {
		return { status: 400, json: { ok: false, error: 'Prompt (message) is required', code: 'VALIDATION' } };
	}
	let result = null;
	if (typeof b.result === 'string') {
		result = b.result;
	} else if (b.result != null) {
		result = String(b.result);
	}

	try {
		const pool = getPool();
		const { rows } = await pool.query(
			`INSERT INTO public.submissions (message, result)
			 VALUES ($1, $2)
			 RETURNING id, message, created_at`,
			[message, result]
		);
		return { status: 201, json: { ok: true, submission: rows[0] } };
	} catch (err) {
		const { message: errMsg, code } = parsePgError(err);
		return { status: 500, json: { ok: false, error: errMsg, code: code || 'DB_ERROR' } };
	}
}

module.exports = {
	listCompanies,
	createCompany,
	generateSurveyJson,
	saveSurvey,
	getPublicSurvey,
	submitSurvey,
	listSurveys,
	getSurveyById,
	updateSurvey,
	deleteSurvey,
	createSubmission,
	dbStatusToUi,
	uiStatusToDb,
};
