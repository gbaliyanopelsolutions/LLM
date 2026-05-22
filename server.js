const path = require('path');
const cookieParser = require('cookie-parser');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const {
	getPool,
	testConnection,
	isDatabaseConfigured,
	closePool,
	parsePgError,
	connectionFailureHint,
	formatDbErrorForLog,
} = require('./db.js');
const authRoutes = require('./routes/auth.js');
const { loadAuthUser, requireAuthPage } = require('./middleware/authMiddleware.js');

/** Map retired/malformed IDs to their current replacements. */
const DEPRECATED_MODEL_ALIASES = {
	'claude-sonnet-4-20250514':    'claude-sonnet-4-5',
	'claude-4-sonnet-20250514':    'claude-sonnet-4-5',
	'claude-sonnet-4-5-20250929':  'claude-sonnet-4-5',
};

const DEFAULT_MODEL = 'claude-sonnet-4-5';

/**
 * Supabase JS expects the project origin only (no /rest/v1 path).
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeSupabaseUrl(raw) {
	let u = String(raw).trim();
	u = u.replace(/\/+$/, '');
	u = u.replace(/\/rest\/v1\/?$/i, '');
	return u.replace(/\/+$/, '');
}

/**
 * Resolve model id from env; remap deprecated Sonnet 4 snapshots.
 *
 * @param {string|undefined} raw From ANTHROPIC_MODEL.
 * @return {string}
 */
function resolveModel(raw) {
	const id = typeof raw === 'string' ? raw.trim() : '';
	if (!id) {
		return DEFAULT_MODEL;
	}
	if (Object.prototype.hasOwnProperty.call(DEPRECATED_MODEL_ALIASES, id)) {
		return DEPRECATED_MODEL_ALIASES[id];
	}
	return id;
}

const app = express();
const port = process.env.PORT || 3000;
const model = resolveModel(process.env.ANTHROPIC_MODEL);

/**
 * Let the static survey (often opened from http://localhost via XAMPP) call this
 * server on http://127.0.0.1:PORT without browser CORS blocking. Only loopback hosts.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function attachSurveyLoopbackCors(req, res, next) {
	const pathOnly = typeof req.path === 'string' ? req.path : String(req.url || '').split('?')[0];
	const isSurveyApi =
		pathOnly === '/generate' ||
		pathOnly === '/api/public/supabase-config' ||
		pathOnly.startsWith('/api/public/') ||
		pathOnly.startsWith('/api/builder');
	if (!isSurveyApi) {
		next();
		return;
	}
	const origin = req.get('Origin');
	if (origin) {
		try {
			const { hostname } = new URL(origin);
			if (hostname === 'localhost' || hostname === '127.0.0.1') {
				res.setHeader('Access-Control-Allow-Origin', origin);
				res.setHeader('Vary', 'Origin');
				res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
			}
		} catch {
			/* ignore */
		}
	}
	if (req.method === 'OPTIONS') {
		res.status(204).end();
		return;
	}
	next();
}

app.use(attachSurveyLoopbackCors);
app.use(cors({ origin: false }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

/**
 * Publishable Supabase client settings for the browser (anon key is intended for clients).
 * Never add service_role or other secrets to this response.
 */
app.get('/api/public/supabase-config', (req, res) => {
	const rawUrl =
		(typeof process.env.SUPABASE_URL === 'string' && process.env.SUPABASE_URL.trim()) ||
		(typeof process.env.NEXT_PUBLIC_SUPABASE_URL === 'string' && process.env.NEXT_PUBLIC_SUPABASE_URL.trim()) ||
		'';
	const supabaseAnonKey =
		(typeof process.env.SUPABASE_ANON_KEY === 'string' && process.env.SUPABASE_ANON_KEY.trim()) ||
		(typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === 'string' && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim()) ||
		'';
	if (!rawUrl || !supabaseAnonKey) {
		res.json({ configured: false });
		return;
	}
	res.json({ configured: true, supabaseUrl: normalizeSupabaseUrl(rawUrl), supabaseAnonKey });
});

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
	res.redirect(302, '/survey-demo/');
});

app.get('/login', (req, res) => {
	res.redirect(302, '/login.html');
});

app.get('/register', (req, res) => {
	res.redirect(302, '/register.html');
});

app.get('/login.html', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard.html', loadAuthUser, requireAuthPage, (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/index.html', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

/** Optional: verify Postgres when DB_* or DATABASE_URL is set */
app.get('/api/db-health', async (req, res) => {
	if (!isDatabaseConfigured()) {
		res.status(503).json({
			ok: false,
			configured: false,
			message: 'Set DATABASE_URL (recommended) or DB_HOST, DB_NAME, DB_USER',
		});
		return;
	}
	try {
		const pool = getPool();
		const { rows } = await pool.query(
			'SELECT current_database() AS database, current_user AS db_user, now() AS server_time'
		);
		res.json({ ok: true, ...rows[0] });
	} catch (err) {
		const { message, code } = parsePgError(err);
		const hint = connectionFailureHint(err);
		res.status(500).json({
			ok: false,
			error: message,
			code,
			hint: hint || undefined,
		});
	}
});

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

const { createSurveyBuilderRouter } = require('./routes/surveyBuilderApi.js');
app.use('/api/builder', createSurveyBuilderRouter({ anthropic, model }));

const SYSTEM_PROMPT = `You are an expert single-file HTML form generator. Your ONLY output is one complete HTML5 document.

Requirements:
- Include ALL CSS inside <style> tags and ALL JavaScript inside <script> tags in that same file.
- Produce production-ready, accessible, responsive forms with clear labels and sensible defaults.
- Infer the best structure from the user's request. Detect and apply appropriate patterns for:
  • Contact / inquiry forms (name, email, message, validation)
  • Survey forms (radio, checkbox, scales, progress)
  • Multi-step forms / wizards (steps, Next/Back, validation per step)
  • Login, signup, and password-reset style flows
  • Checkout or order summaries with shipping/payment-style sections when relevant
- Use semantic HTML5, keyboard-friendly controls, and mobile-friendly layouts.

Strict output rules:
- Output ONLY the raw HTML document. Start with <!DOCTYPE html> or <html>.
- Do NOT wrap output in markdown code fences. Do NOT use markdown at all.
- Do NOT add explanations, apologies, or commentary before or after the HTML.
- Close all tags properly and ensure the page runs standalone in a browser.`;

/**
 * Strip optional markdown fences from model output.
 *
 * @param {string} raw Raw model text.
 * @return {string} Cleaned HTML string.
 */
function extractHtml(raw) {
	let text = String(raw).trim();
	const fence = /^```(?:html)?\s*\n?/i;
	if (fence.test(text)) {
		text = text.replace(fence, '');
		text = text.replace(/\n?```\s*$/i, '');
	}
	return text.trim();
}

/**
 * Normalize prior conversation turns for Claude.
 *
 * @param {unknown} raw History from client.
 * @return {Array<{ role: 'user' | 'assistant', content: string }>}
 */
function normalizeHistory(raw) {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out = [];
	for (const item of raw) {
		if (
			item &&
			typeof item === 'object' &&
			(item.role === 'user' || item.role === 'assistant') &&
			typeof item.content === 'string'
		) {
			out.push({ role: item.role, content: item.content });
		}
	}
	return out;
}

/**
 * Extract a safe error message from Anthropic / network errors.
 *
 * @param {unknown} err Thrown value.
 * @return {{ status: number, message: string }}
 */
function formatApiError(err) {
	if (err && typeof err === 'object') {
		const anyErr = err;
		const status =
			typeof anyErr.status === 'number'
				? anyErr.status
				: typeof anyErr.statusCode === 'number'
					? anyErr.statusCode
					: 500;
		let message = 'Generation failed';
		if (typeof anyErr.message === 'string' && anyErr.message) {
			message = anyErr.message;
		}
		if (anyErr.error && typeof anyErr.error === 'object') {
			const nested = anyErr.error;
			if (typeof nested.message === 'string' && nested.message) {
				message = nested.message;
			}
		}
		return { status: status >= 400 && status < 600 ? status : 500, message };
	}
	return { status: 500, message: err instanceof Error ? err.message : 'Generation failed' };
}

app.post('/generate', async (req, res) => {
	const body = req.body && typeof req.body === 'object' ? req.body : {};
	const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
	const history = normalizeHistory(body.messages);

	if (!prompt) {
		res.status(400).json({ error: 'Missing or empty prompt', code: 'MISSING_PROMPT' });
		return;
	}

	if (!process.env.ANTHROPIC_API_KEY) {
		res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set', code: 'MISSING_API_KEY' });
		return;
	}

	if (history.length % 2 !== 0) {
		res.status(400).json({
			error: 'Conversation history must be complete user/assistant pairs',
			code: 'INVALID_THREAD',
		});
		return;
	}

	for (let i = 0; i < history.length; i += 1) {
		const expected = i % 2 === 0 ? 'user' : 'assistant';
		if (history[i].role !== expected) {
			res.status(400).json({
				error: 'Conversation must alternate user and assistant messages',
				code: 'INVALID_THREAD',
			});
			return;
		}
	}

	const messages = [...history, { role: 'user', content: prompt }];

	try {
		const message = await anthropic.messages.create({
			model,
			max_tokens: 8192,
			system: SYSTEM_PROMPT,
			messages,
		});

		const raw = message.content
			.filter((block) => block.type === 'text')
			.map((block) => block.text)
			.join('');
		const html = extractHtml(raw);

		if (!html || !/<html[\s>]/i.test(html) && !/<!DOCTYPE\s+html/i.test(html)) {
			res.status(502).json({
				error: 'Model did not return a complete HTML document. Try again or shorten the conversation.',
				code: 'INVALID_OUTPUT',
			});
			return;
		}

		res.type('text/html; charset=utf-8').send(html);
	} catch (err) {
		const { status, message } = formatApiError(err);
		res.status(status).json({ error: message, code: 'ANTHROPIC_ERROR' });
	}
});

async function startServer() {
	if (isDatabaseConfigured()) {
		const dbTest = await testConnection();
		if (!dbTest.ok) {
			// eslint-disable-next-line no-console
			console.error('\n======== PostgreSQL startup check failed ========');
			// eslint-disable-next-line no-console
			console.error(dbTest.error);
			if (dbTest.code) {
				// eslint-disable-next-line no-console
				console.error('Code:', dbTest.code);
			}
			if (dbTest.hint) {
				// eslint-disable-next-line no-console
				console.error(dbTest.hint);
			}
			if (dbTest.stack && process.env.DEBUG_DB === '1') {
				// eslint-disable-next-line no-console
				console.error(dbTest.stack);
			}
			// eslint-disable-next-line no-console
			console.error('================================================\n');
			process.exit(1);
		}
		// eslint-disable-next-line no-console
		console.log(`PostgreSQL OK (${dbTest.latencyMs}ms) — GET /api/db-health for details`);

		if (process.env.SKIP_DB_INIT === '1' || process.env.SKIP_DB_INIT === 'true') {
			// eslint-disable-next-line no-console
			console.warn(
				'[DB Init] SKIP_DB_INIT is set — skipping automatic schema (set DATABASE_URL + run database/init.sql manually if needed)'
			);
		} else {
			try {
				const { runDatabaseInitialization } = require('./database/initDb.js');
				await runDatabaseInitialization();
			} catch (initErr) {
				// eslint-disable-next-line no-console
				console.error('\n======== Database initialization failed ========');
				// eslint-disable-next-line no-console
				console.error(initErr instanceof Error ? initErr.message : String(initErr));
				if (initErr instanceof Error && initErr.cause) {
					// eslint-disable-next-line no-console
					console.error(formatDbErrorForLog(initErr.cause));
				} else {
					// eslint-disable-next-line no-console
					console.error(formatDbErrorForLog(initErr));
				}
				// eslint-disable-next-line no-console
				console.error(
					'Hint: Supabase transaction pooler (port 6543) can block some DDL — try direct connection (port 5432) in DATABASE_URL, or run database/init.sql in the SQL Editor.'
				);
				// eslint-disable-next-line no-console
				console.error('================================================\n');
				process.exit(1);
			}
		}

		const jwtOk = process.env.JWT_SECRET && String(process.env.JWT_SECRET).trim().length >= 16;
		if (!jwtOk) {
			// eslint-disable-next-line no-console
			console.warn(
				'JWT_SECRET is not set (or too short). Express /api/auth cookies will fail until you set JWT_SECRET in connection.env (min 16 characters). Auth uses Supabase Auth (auth.users).'
			);
		}
	} else {
		// eslint-disable-next-line no-console
		console.warn(
			'PostgreSQL not configured; skipping DB startup test (copy connection.env.example → connection.env and set DATABASE_URL or DB_*)'
		);
	}

	app.listen(port, '127.0.0.1', () => {
		// eslint-disable-next-line no-console
		console.log(`Server at http://127.0.0.1:${port} (model: ${model})`);
	});
}

process.once('SIGINT', async () => {
	await closePool();
	process.exit(0);
});

process.once('SIGTERM', async () => {
	await closePool();
	process.exit(0);
});

startServer().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exit(1);
});
