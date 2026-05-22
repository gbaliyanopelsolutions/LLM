const { parse } = require('pg-connection-string');
const { Pool } = require('pg');
const { loadProjectEnv } = require('../lib/loadEnv.js');

loadProjectEnv();

/** @type {import('pg').Pool | null} */
let pool = null;

/** @type {boolean} */
let poolErrorHandlerAttached = false;

/**
 * @returns {boolean}
 */
function isDatabaseConfigured() {
	if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim()) {
		return true;
	}
	const host = trimEnv(process.env.DB_HOST) || trimEnv(process.env.PGHOST);
	const database = trimEnv(process.env.DB_NAME) || trimEnv(process.env.PGDATABASE);
	const user = trimEnv(process.env.DB_USER) || trimEnv(process.env.PGUSER);
	return Boolean(host && database && user);
}

/**
 * @param {string | undefined} v
 * @returns {string}
 */
function trimEnv(v) {
	return typeof v === 'string' ? v.trim() : '';
}

/**
 * Normalize node-postgres / server errors for logging (never log DATABASE_URL or passwords).
 *
 * @param {unknown} err
 * @returns {{ message: string, code?: string, detail?: string, stack?: string }}
 */
function parsePgError(err) {
	if (err instanceof Error) {
		const any = err;
		const code = typeof any.code === 'string' ? any.code : undefined;
		const detail = typeof any.detail === 'string' ? any.detail : undefined;
		return {
			message: err.message,
			code,
			detail,
			stack: typeof err.stack === 'string' ? err.stack : undefined,
		};
	}
	if (err && typeof err === 'object') {
		const any = err;
		const message = typeof any.message === 'string' ? any.message : String(err);
		const code = typeof any.code === 'string' ? any.code : undefined;
		const detail = typeof any.detail === 'string' ? any.detail : undefined;
		return { message, code, detail };
	}
	return { message: String(err) };
}

/**
 * Extra guidance for common Supabase / local auth failures.
 *
 * @param {unknown} err
 * @returns {string | undefined}
 */
function connectionFailureHint(err) {
	const { message, code } = parsePgError(err);
	const authFailed =
		code === '28P01' ||
		/password authentication failed/i.test(message) ||
		/authentication failed/i.test(message);
	if (authFailed) {
		return [
			'',
			'--- How to fix password authentication ---',
			'• Use the database password from Supabase: Project Settings → Database → Database password (reset there if unsure).',
			'• That is not the same as your Supabase dashboard login password.',
			'• In DATABASE_URL, special characters in the password must be URL-encoded (e.g. @ → %40, # → %23, / → %2F).',
			'• Transaction pooler (port 6543): username is often postgres.<project-ref> in the URI Supabase shows.',
			'• Direct connection (port 5432): username is usually postgres.',
		].join('\n');
	}

	const sslFailed =
		code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
		/self-signed certificate in certificate chain/i.test(message) ||
		/unable to verify the first certificate/i.test(message) ||
		/certificate has expired/i.test(message) ||
		/Hostname\/IP mismatch/i.test(message);
	if (sslFailed) {
		return [
			'',
			'--- TLS / SSL (Supabase + Node pg) ---',
			'• Pool config merges explicit ssl.rejectUnauthorized (default false for dev; see config/db.js).',
			'• Strict verification: set PG_REJECT_UNAUTHORIZED=true in production.',
			'• Optional: add uselibpqcompat=true to DATABASE_URL to silence sslmode deprecation warnings.',
			'• Local Postgres without TLS: PGSSLMODE=disable or DB_SSL=false.',
		].join('\n');
	}

	return undefined;
}

/**
 * Log-friendly block for console (safe: no secrets).
 *
 * @param {unknown} err
 * @returns {string}
 */
function formatDbErrorForLog(err) {
	const { message, code, detail } = parsePgError(err);
	const lines = [message];
	if (code) {
		lines.push(`SQLSTATE / driver code: ${code}`);
	}
	if (detail) {
		lines.push(`Detail: ${detail}`);
	}
	const hint = connectionFailureHint(err);
	if (hint) {
		lines.push(hint);
	}
	return lines.join('\n');
}

/**
 * TLS for Supabase / remote Postgres with the `pg` package.
 *
 * Default: `rejectUnauthorized: false` so localhost dev works behind proxies and
 * avoids SELF_SIGNED_CERT_IN_CHAIN with common Supabase pooler URIs.
 *
 * Production: set PG_REJECT_UNAUTHORIZED=true (and use a direct DB URL with a valid chain).
 * Disable TLS entirely (local Postgres only): PGSSLMODE=disable or DB_SSL=false.
 *
 * @returns {{ ssl: false } | { ssl: { rejectUnauthorized: boolean } }}
 */
function resolveSsl() {
	if (trimEnv(process.env.PGSSLMODE) === 'disable' || trimEnv(process.env.DB_SSL) === 'false') {
		return { ssl: false };
	}
	const strict = trimEnv(process.env.PG_REJECT_UNAUTHORIZED) === 'true';
	return {
		ssl: {
			rejectUnauthorized: strict,
		},
	};
}

/**
 * Read discrete connection fields (DB_* preferred; PG* fallback).
 *
 * @returns {{ host: string, port: number, database: string, user: string, password: string }}
 */
function readDiscreteConfig() {
	const host = trimEnv(process.env.DB_HOST) || trimEnv(process.env.PGHOST);
	const port = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
	const database = trimEnv(process.env.DB_NAME) || trimEnv(process.env.PGDATABASE);
	const user = trimEnv(process.env.DB_USER) || trimEnv(process.env.PGUSER);
	const password =
		trimEnv(process.env.DB_PASSWORD) ||
		(process.env.PGPASSWORD !== undefined ? String(process.env.PGPASSWORD) : '');

	if (!host || !database || !user) {
		throw new Error(
			'Missing PostgreSQL configuration: set DATABASE_URL or DB_HOST, DB_NAME, DB_USER (see connection.env.example).'
		);
	}

	return { host, port, database, user, password };
}

/**
 * Pool size / timeouts shared by URI and discrete config.
 *
 * @returns {Pick<import('pg').PoolConfig, 'max' | 'idleTimeoutMillis' | 'connectionTimeoutMillis' | 'allowExitOnIdle'>}
 */
function poolLimits() {
	const max = Math.min(Math.max(Number(process.env.PG_POOL_MAX || 10), 1), 50);
	const idleTimeoutMillis = Number(process.env.PG_IDLE_MS || 30_000);
	const connectionTimeoutMillis = Number(process.env.PG_CONNECT_TIMEOUT_MS || 15_000);

	return {
		max,
		idleTimeoutMillis,
		connectionTimeoutMillis,
		allowExitOnIdle: true,
	};
}

/**
 * Build Pool config from DATABASE_URL so TLS is controlled explicitly.
 * pg merges parsed(connectionString) after Pool options, which can reset ssl
 * and keep sslmode=require on a strict verify path → SELF_SIGNED_CERT_IN_CHAIN.
 *
 * @param {string} connectionString
 * @param {ReturnType<typeof poolLimits>} limits
 * @returns {import('pg').PoolConfig}
 */
function poolConfigFromDatabaseUrl(connectionString, limits) {
	const parsed = parse(connectionString);
	const { ssl } = resolveSsl();

	const poolConfig = {
		...parsed,
		port: parsed.port ? Number(parsed.port) : 5432,
		...limits,
	};

	delete poolConfig.sslmode;

	if (ssl === false) {
		poolConfig.ssl = false;
	} else {
		const fromUrl =
			typeof parsed.ssl === 'object' && parsed.ssl !== null && !Array.isArray(parsed.ssl)
				? { ...parsed.ssl }
				: {};
		poolConfig.ssl = { ...fromUrl, ...ssl };
	}

	return poolConfig;
}

/**
 * @returns {import('pg').Pool}
 */
function createPool() {
	const limits = poolLimits();
	const connectionString =
		typeof process.env.DATABASE_URL === 'string' ? process.env.DATABASE_URL.trim() : '';

	if (connectionString) {
		return new Pool(poolConfigFromDatabaseUrl(connectionString, limits));
	}

	const { host, port, database, user, password } = readDiscreteConfig();
	const { ssl } = resolveSsl();

	return new Pool({
		host,
		port,
		database,
		user,
		password,
		...limits,
		...(ssl === false ? { ssl: false } : { ssl }),
	});
}

/**
 * Log idle-client pool errors (recommended for production).
 *
 * @param {import('pg').Pool} p
 */
function attachPoolErrorHandler(p) {
	if (poolErrorHandlerAttached) {
		return;
	}
	poolErrorHandlerAttached = true;
	p.on('error', (err) => {
		// eslint-disable-next-line no-console
		console.error('[pg Pool] Unexpected error on idle client', err);
	});
}

/**
 * Singleton pool for the Node process.
 *
 * @returns {import('pg').Pool}
 */
function getPool() {
	if (!isDatabaseConfigured()) {
		throw new Error(
			'PostgreSQL is not configured. Set DATABASE_URL (recommended) or DB_HOST, DB_NAME, DB_USER (see connection.env.example).'
		);
	}
	if (!pool) {
		try {
			pool = createPool();
			attachPoolErrorHandler(pool);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Failed to create PostgreSQL pool: ${message}`);
		}
	}
	return pool;
}

/**
 * Lightweight connectivity check (use on process startup).
 *
 * @returns {Promise<
 *   | { ok: true, latencyMs: number }
 *   | { ok: false, error: string, code?: string, hint?: string, stack?: string }
 * >}
 */
async function testConnection() {
	if (!isDatabaseConfigured()) {
		return { ok: false, error: 'Database environment variables are not set' };
	}
	try {
		const p = getPool();
		const started = Date.now();
		await p.query('SELECT 1 AS connection_ok');
		return { ok: true, latencyMs: Date.now() - started };
	} catch (err) {
		const { message, code, stack } = parsePgError(err);
		return {
			ok: false,
			error: message,
			code,
			hint: connectionFailureHint(err),
			stack,
		};
	}
}

/**
 * Graceful shutdown (call on SIGINT/SIGTERM in long-running servers).
 *
 * @returns {Promise<void>}
 */
async function closePool() {
	if (pool) {
		try {
			await pool.end();
		} catch (err) {
			// eslint-disable-next-line no-console
			console.error('[pg Pool] Error while closing pool', err);
		}
		pool = null;
		poolErrorHandlerAttached = false;
	}
}

module.exports = {
	getPool,
	testConnection,
	closePool,
	isDatabaseConfigured,
	formatDbErrorForLog,
	parsePgError,
	connectionFailureHint,
};
