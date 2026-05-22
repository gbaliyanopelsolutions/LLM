'use strict';

/**
 * Apply database/init.sql to Supabase/Postgres (same logic as Express startup).
 *
 * Does NOT run during `npm run dev` (Next.js). Use this script or `npm run server`.
 *
 * Usage: npm run db:init
 */

require('../db.js');

const { isDatabaseConfigured, testConnection } = require('../db.js');
const { runDatabaseInitialization } = require('../database/initDb.js');

function routingHelp() {
	return [
		'',
		'--- How to create tables in Supabase ---',
		'• `npm run dev` (Next.js) does not run schema init — it never loads server.js.',
		'• Run either:  npm run db:init   OR   npm run server   (with DATABASE_URL set).',
		'• If init fails on port 6543 (Transaction pooler), use Direct connection (port 5432):',
		'  Supabase → Project Settings → Database → Connection string → Method: Direct.',
	].join('\n');
}

async function main() {
	if (!isDatabaseConfigured()) {
		// eslint-disable-next-line no-console
		console.error('[db:init] DATABASE_URL or DB_HOST/DB_NAME/DB_USER is not set.');
		// eslint-disable-next-line no-console
		console.error(routingHelp());
		process.exit(1);
	}

	if (process.env.SKIP_DB_INIT === '1' || process.env.SKIP_DB_INIT === 'true') {
		// eslint-disable-next-line no-console
		console.error('[db:init] SKIP_DB_INIT is set; remove it to apply database/init.sql.');
		process.exit(1);
	}

	const t = await testConnection();
	if (!t.ok) {
		// eslint-disable-next-line no-console
		console.error('[db:init] Connection failed:', t.error);
		if (t.code) {
			// eslint-disable-next-line no-console
			console.error('Code:', t.code);
		}
		if (t.hint) {
			// eslint-disable-next-line no-console
			console.error(t.hint);
		}
		// eslint-disable-next-line no-console
		console.error(routingHelp());
		process.exit(1);
	}

	// eslint-disable-next-line no-console
	console.log('[db:init] Database reachable (' + t.latencyMs + ' ms)');

	try {
		await runDatabaseInitialization();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('[db:init] Failed:', err instanceof Error ? err.message : err);
		// eslint-disable-next-line no-console
		console.error(routingHelp());
		process.exit(1);
	}
}

main();
