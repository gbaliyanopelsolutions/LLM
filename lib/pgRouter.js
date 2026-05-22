const { getPool } = require('../config/db.js');
const { dispatchUsers } = require('../routes/users.js');
const { formatError } = require('./httpJson.js');

/**
 * @returns {Promise<{ statusCode: number, body: Record<string, unknown> }>}
 */
async function getManifest() {
	return {
		statusCode: 200,
		body: {
			ok: true,
			service: 'only_llm',
			postgres: {
				note: 'PostgreSQL REST-style API via Next.js Route Handler: /api/pg/* (see app/api/pg/[[...path]]/route.js).',
				endpoints: [
					'GET /api/pg',
					'GET /api/pg/health',
					'GET /api/pg/db-test',
					'GET /api/pg/users',
					'GET /api/pg/users?id=<uuid>',
					'POST /api/pg/users',
					'PUT|PATCH /api/pg/users?id=<uuid>',
					'DELETE /api/pg/users?id=<uuid>',
				],
			},
		},
	};
}

/**
 * @returns {Promise<{ statusCode: number, body: Record<string, unknown> }>}
 */
async function getHealth() {
	return {
		statusCode: 200,
		body: {
			ok: true,
			service: 'only_llm',
			timestamp: new Date().toISOString(),
			hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
			hasPgHost: Boolean(process.env.PGHOST || process.env.DB_HOST),
		},
	};
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ statusCode: number, body: Record<string, unknown> }>}
 */
async function getDbTest(pool) {
	const started = Date.now();
	const result = await pool.query('SELECT 1 AS ok, now() AS server_time, current_database() AS database');
	const ms = Date.now() - started;
	return {
		statusCode: 200,
		body: {
			ok: true,
			latencyMs: ms,
			row: result.rows[0],
		},
	};
}

/**
 * @param {string} method
 * @param {string[]} segments path after /api/pg/ — e.g. ['users'] or ['db-test']
 * @param {URLSearchParams} searchParams
 * @param {unknown} body
 * @returns {Promise<{ statusCode: number, body: Record<string, unknown> }>}
 */
async function runPgRoute(method, segments, searchParams, body) {
	const key = segments.join('/');

	if (method === 'OPTIONS') {
		return { statusCode: 204, body: { ok: true } };
	}

	if (key === '' || key === 'index') {
		if (method !== 'GET') {
			return { statusCode: 405, body: { ok: false, error: 'Method not allowed', code: 'METHOD' } };
		}
		return getManifest();
	}

	if (key === 'health') {
		if (method !== 'GET') {
			return { statusCode: 405, body: { ok: false, error: 'Method not allowed', code: 'METHOD' } };
		}
		return getHealth();
	}

	if (key === 'db-test') {
		if (method !== 'GET') {
			return { statusCode: 405, body: { ok: false, error: 'Method not allowed', code: 'METHOD' } };
		}
		const pool = getPool();
		return getDbTest(pool);
	}

	if (key === 'users') {
		const id = searchParams.get('id');
		const pool = getPool();
		return dispatchUsers(pool, method, id, body);
	}

	return { statusCode: 404, body: { ok: false, error: 'Not found', code: 'NOT_FOUND' } };
}

/**
 * @param {string} method
 * @param {string[]} segments
 * @param {URLSearchParams} searchParams
 * @param {unknown} body
 */
async function runPgRouteSafe(method, segments, searchParams, body) {
	try {
		return await runPgRoute(method, segments, searchParams, body);
	} catch (err) {
		if (err && typeof err === 'object' && err.code === '23505') {
			return {
				statusCode: 409,
				body: { ok: false, error: 'Email already exists', code: 'CONFLICT' },
			};
		}
		const { statusCode, body: errBody } = formatError(err);
		return { statusCode, body: errBody };
	}
}

module.exports = {
	runPgRouteSafe,
	getManifest,
	getHealth,
	getDbTest,
};
