const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const COOKIE_NAME = 'auth_token';

/**
 * @param {unknown} v
 * @returns {string}
 */
function str(v) {
	return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * @param {string|undefined} raw
 * @returns {string}
 */
function normalizeSupabaseUrl(raw) {
	let u = String(raw || '').trim();
	u = u.replace(/\/+$/, '');
	u = u.replace(/\/rest\/v1\/?$/i, '');
	return u.replace(/\/+$/, '');
}

/**
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function supabaseAuthClient() {
	const url = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '');
	const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
	if (!url || !key) {
		throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY in connection.env for Supabase Auth.');
	}
	return createClient(url, key, {
		auth: {
			persistSession: false,
			autoRefreshToken: false,
			detectSessionInUrl: false,
		},
	});
}

/**
 * @returns {string}
 */
function jwtSecret() {
	const s = str(process.env.JWT_SECRET);
	if (!s || s.length < 16) {
		throw new Error('JWT_SECRET is missing or too short (min 16 chars). Set it in connection.env.');
	}
	return s;
}

/**
 * @param {import('express').Response} res
 * @param {string} token
 */
function setAuthCookie(res, token) {
	const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
	res.cookie(COOKIE_NAME, token, {
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		path: '/',
		maxAge: maxAgeMs,
	});
}

/**
 * @param {import('express').Response} res
 */
function clearAuthCookie(res) {
	res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
}

/**
 * Map Supabase Auth user to our JWT / API shape.
 *
 * @param {import('@supabase/supabase-js').User | null} u
 * @returns {{ id: string, email: string, full_name: string, role: string, created_at: string } | null}
 */
function mapAuthUser(u) {
	if (!u || !u.id) {
		return null;
	}
	const meta = u.user_metadata && typeof u.user_metadata === 'object' ? u.user_metadata : {};
	const fullName = typeof meta.full_name === 'string' ? meta.full_name : '';
	const app = u.app_metadata && typeof u.app_metadata === 'object' ? u.app_metadata : {};
	const role = typeof app.role === 'string' ? app.role : 'user';
	return {
		id: u.id,
		email: typeof u.email === 'string' ? u.email : '',
		full_name: fullName,
		role,
		created_at: typeof u.created_at === 'string' ? u.created_at : new Date().toISOString(),
	};
}

/**
 * @param {{ id: string, email: string, full_name: string, role: string }} user
 * @returns {string}
 */
function signToken(user) {
	return jwt.sign(
		{ sub: user.id, email: user.email, full_name: user.full_name, role: user.role },
		jwtSecret(),
		{ expiresIn: '7d' }
	);
}

/**
 * POST /api/auth/register — Supabase Auth (auth.users), not public.users.
 *
 * @type {import('express').RequestHandler}
 */
async function register(req, res) {
	try {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const full_name = str(body.full_name);
		const email = str(body.email).toLowerCase();
		const password = str(body.password);

		if (!full_name || full_name.length < 2) {
			res.status(400).json({ ok: false, error: 'Full name must be at least 2 characters.', code: 'VALIDATION' });
			return;
		}
		if (!isValidEmail(email)) {
			res.status(400).json({ ok: false, error: 'Invalid email address.', code: 'VALIDATION' });
			return;
		}
		if (password.length < 8) {
			res.status(400).json({ ok: false, error: 'Password must be at least 8 characters.', code: 'VALIDATION' });
			return;
		}

		const supabase = supabaseAuthClient();
		const { data, error } = await supabase.auth.signUp({
			email,
			password,
			options: { data: { full_name } },
		});

		if (error) {
			const msg = error.message || 'Registration failed';
			if (/already registered|already been registered|User already exists/i.test(msg)) {
				res.status(409).json({ ok: false, error: 'An account with this email already exists.', code: 'DUPLICATE_EMAIL' });
				return;
			}
			res.status(400).json({ ok: false, error: msg, code: 'SUPABASE_AUTH' });
			return;
		}

		const mapped = mapAuthUser(data.user);
		if (!mapped) {
			res.status(201).json({
				ok: true,
				pendingConfirmation: true,
				message: 'If email confirmation is enabled in Supabase, check your inbox to finish sign-up.',
				user: null,
			});
			return;
		}

		const token = signToken(mapped);
		setAuthCookie(res, token);

		res.status(201).json({
			ok: true,
			user: mapped,
			token,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Registration failed';
		res.status(500).json({ ok: false, error: message, code: 'SERVER' });
	}
}

/**
 * POST /api/auth/login
 *
 * @type {import('express').RequestHandler}
 */
async function login(req, res) {
	try {
		const body = req.body && typeof req.body === 'object' ? req.body : {};
		const email = str(body.email).toLowerCase();
		const password = str(body.password);

		if (!isValidEmail(email) || !password) {
			res.status(400).json({ ok: false, error: 'Email and password are required.', code: 'VALIDATION' });
			return;
		}

		const supabase = supabaseAuthClient();
		const { data, error } = await supabase.auth.signInWithPassword({ email, password });

		if (error || !data.user) {
			res.status(401).json({ ok: false, error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
			return;
		}

		const mapped = mapAuthUser(data.user);
		if (!mapped) {
			res.status(401).json({ ok: false, error: 'Invalid email or password.', code: 'INVALID_CREDENTIALS' });
			return;
		}

		const token = signToken(mapped);
		setAuthCookie(res, token);

		res.json({ ok: true, user: mapped, token });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Login failed';
		res.status(500).json({ ok: false, error: message, code: 'SERVER' });
	}
}

/**
 * POST /api/auth/logout
 *
 * @type {import('express').RequestHandler}
 */
function logout(req, res) {
	clearAuthCookie(res);
	res.json({ ok: true });
}

/**
 * GET /api/auth/me
 *
 * @type {import('express').RequestHandler}
 */
async function me(req, res) {
	if (!req.user) {
		res.status(401).json({ ok: false, error: 'Not authenticated', code: 'UNAUTHORIZED' });
		return;
	}
	res.json({ ok: true, user: req.user });
}

module.exports = {
	register,
	login,
	logout,
	me,
	COOKIE_NAME,
};
