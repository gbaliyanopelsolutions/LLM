const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'auth_token';

/**
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function readToken(req) {
	if (req.cookies && typeof req.cookies[COOKIE_NAME] === 'string') {
		return req.cookies[COOKIE_NAME];
	}
	const h = req.headers.authorization;
	if (typeof h === 'string' && /^Bearer\s+/i.test(h)) {
		return h.replace(/^Bearer\s+/i, '').trim();
	}
	return null;
}

/**
 * Verify JWT and attach `req.user` from claims (no public.users — uses Supabase Auth ids).
 *
 * @type {import('express').RequestHandler}
 */
async function loadAuthUser(req, res, next) {
	req.user = null;
	const secret = process.env.JWT_SECRET;
	if (!secret || String(secret).trim().length < 16) {
		return next();
	}
	const token = readToken(req);
	if (!token) {
		return next();
	}
	try {
		const payload = jwt.verify(token, secret);
		const sub = typeof payload.sub === 'string' ? payload.sub : null;
		if (!sub) {
			return next();
		}
		req.user = {
			id: sub,
			email: typeof payload.email === 'string' ? payload.email : '',
			full_name: typeof payload.full_name === 'string' ? payload.full_name : '',
			role: typeof payload.role === 'string' ? payload.role : 'user',
			created_at: null,
		};
	} catch {
		req.user = null;
	}
	next();
}

/**
 * JSON APIs: 401 if not logged in.
 *
 * @type {import('express').RequestHandler}
 */
function requireAuth(req, res, next) {
	if (!req.user) {
		res.status(401).json({ ok: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
		return;
	}
	next();
}

/**
 * HTML pages: redirect to login.
 *
 * @type {import('express').RequestHandler}
 */
function requireAuthPage(req, res, next) {
	if (!req.user) {
		res.redirect('/login.html');
		return;
	}
	next();
}

module.exports = {
	loadAuthUser,
	requireAuth,
	requireAuthPage,
	COOKIE_NAME,
	readToken,
};
