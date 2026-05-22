/**
 * Sample usage: run a read-only query against Supabase Postgres via the shared pool.
 *
 * Install: npm install pg dotenv
 * Run:     node scripts/pg-sample-query.js
 */
const path = require('path');

const { loadProjectEnv } = require('../lib/loadEnv.js');
loadProjectEnv();

const { getPool, testConnection, isDatabaseConfigured, closePool } = require('../config/db.js');

async function main() {
	if (!isDatabaseConfigured()) {
		// eslint-disable-next-line no-console
		console.error('Configure DATABASE_URL in connection.env (copy connection.env.example).');
		process.exitCode = 1;
		return;
	}

	const ping = await testConnection();
	if (!ping.ok) {
		// eslint-disable-next-line no-console
		console.error('Connection test failed:', ping.error);
		if (ping.code) {
			// eslint-disable-next-line no-console
			console.error('Code:', ping.code);
		}
		if (ping.hint) {
			// eslint-disable-next-line no-console
			console.error(ping.hint);
		}
		process.exitCode = 1;
		return;
	}
	// eslint-disable-next-line no-console
	console.log('Connection OK', `(${ping.latencyMs}ms)`);

	const pool = getPool();
	const { rows } = await pool.query(
		`SELECT current_database() AS database, current_user AS db_user, now() AS server_time`
	);
	// eslint-disable-next-line no-console
	console.log('Sample query result:', rows[0]);

	await closePool();
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exitCode = 1;
});
