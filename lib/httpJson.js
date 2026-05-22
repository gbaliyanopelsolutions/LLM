/**
 * Small helpers for Node-style HTTP JSON handlers (Express, raw http.Server, etc.).
 *
 * @param {import('http').ServerResponse} res
 * @param {Record<string, string>} [extraHeaders]
 */
function setCors(res, extraHeaders = {}) {
	res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	Object.entries(extraHeaders).forEach(([k, v]) => {
		res.setHeader(k, v);
	});
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
async function readJsonBody(req) {
	if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
		return null;
	}
	const chunks = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	if (chunks.length === 0) {
		return null;
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return undefined;
	}
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} statusCode
 * @param {unknown} body
 */
function sendJson(res, statusCode, body) {
	setCors(res, { 'Content-Type': 'application/json; charset=utf-8' });
	res.statusCode = statusCode;
	res.end(JSON.stringify(body));
}

/**
 * @param {unknown} err
 * @returns {{ statusCode: number, body: Record<string, unknown> }}
 */
function formatError(err) {
	if (err && typeof err === 'object') {
		const code = typeof err.code === 'string' ? err.code : undefined;
		// PostgreSQL / pg driver
		if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
			return {
				statusCode: 503,
				body: { ok: false, error: 'Database unreachable', code: 'DB_CONNECTION' },
			};
		}
		if (code === '57P01' || code === '57P02' || code === '57P03') {
			return {
				statusCode: 503,
				body: { ok: false, error: 'Database administratively unavailable', code: 'DB_ADMIN' },
			};
		}
	}
	const message = err instanceof Error ? err.message : 'Internal server error';
	return {
		statusCode: 500,
		body: { ok: false, error: message, code: 'INTERNAL' },
	};
}

module.exports = {
	setCors,
	readJsonBody,
	sendJson,
	formatError,
};
