/**
 * Minimal Express + `pg` + dotenv + shared pool (Supabase-compatible).
 *
 * Install:
 *   npm install express pg dotenv
 *
 * Run:
 *   node examples/express-pg-integration.js
 *
 * Env: set DATABASE_URL (or DB_*) in connection.env — copy connection.env.example
 */
const path = require('path');
const express = require('express');
const { loadProjectEnv } = require('../lib/loadEnv.js');

loadProjectEnv();

const { getPool, testConnection, isDatabaseConfigured, closePool } = require('../config/db.js');

const app = express();
const port = Number(process.env.PORT || 4000);

app.get('/health', async (req, res) => {
	if (!isDatabaseConfigured()) {
		res.status(503).json({ ok: false, database: 'not_configured' });
		return;
	}
	const r = await testConnection();
	if (!r.ok) {
		res.status(503).json({ ok: false, database: 'unreachable', error: r.error });
		return;
	}
	res.json({ ok: true, database: 'up', latencyMs: r.latencyMs });
});

app.get('/sample', async (req, res) => {
	try {
		const pool = getPool();
		const { rows } = await pool.query('SELECT now() AS server_time');
		res.json({ ok: true, row: rows[0] });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		res.status(500).json({ ok: false, error: message });
	}
});

async function start() {
	if (isDatabaseConfigured()) {
		const r = await testConnection();
		if (!r.ok) {
			// eslint-disable-next-line no-console
			console.error('Startup DB check failed:', r.error);
			process.exit(1);
		}
		// eslint-disable-next-line no-console
		console.log(`PostgreSQL OK (${r.latencyMs}ms)`);
	} else {
		// eslint-disable-next-line no-console
		console.warn('DB not configured: /health will return 503 until you set DATABASE_URL or DB_*');
	}

	app.listen(port, '127.0.0.1', () => {
		// eslint-disable-next-line no-console
		console.log(`Express listening on http://127.0.0.1:${port}`);
	});
}

process.on('SIGINT', async () => {
	await closePool();
	process.exit(0);
});

start().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exit(1);
});
