'use strict';

const fs = require('fs/promises');
const path = require('path');

const { splitSqlStatements } = require('./sqlSplit.js');

/** @type {readonly string[]} */
const REQUIRED_TABLES = Object.freeze([
	'companies',
	'respondents',
	'surveys',
	'questions',
	'responses',
	'submissions',
]);

/**
 * @param {import('pg').Pool} pool
 * @param {readonly string[]} names
 * @returns {Promise<Set<string>>}
 */
async function listPresentTables(pool, names) {
	const { rows } = await pool.query(
		`SELECT table_name
		 FROM information_schema.tables
		 WHERE table_schema = 'public'
		   AND table_name = ANY($1::text[])`,
		[names]
	);
	return new Set(rows.map((r) => r.table_name));
}

/**
 * Run database/init.sql: extensions, enums, tables, indexes, triggers, seed.
 * Loads `../db.js` only when called so requiring this module does not open a pool.
 *
 * @returns {Promise<{ created: string[], hadAllBefore: boolean }>}
 */
async function runDatabaseInitialization() {
	const { getPool, formatDbErrorForLog, parsePgError } = require('../db.js');
	const pool = getPool();

	const { rows: dbRow } = await pool.query('SELECT current_database() AS name, current_user AS role');
	// eslint-disable-next-line no-console
	console.log('[DB Init] Database connected:', dbRow[0].name, `(${dbRow[0].role})`);

	const before = await listPresentTables(pool, REQUIRED_TABLES);
	const hadAllBefore = REQUIRED_TABLES.every((t) => before.has(t));

	const sqlPath = path.join(__dirname, 'init.sql');
	const raw = await fs.readFile(sqlPath, 'utf8');
	const statements = splitSqlStatements(raw);

	let executed = 0;
	const client = await pool.connect();
	try {
		for (let s = 0; s < statements.length; s += 1) {
			const text = statements[s];
			try {
				// eslint-disable-next-line no-await-in-loop
				await client.query(text);
				executed += 1;
			} catch (err) {
				const snippet = text.replace(/\s+/g, ' ').slice(0, 220);
				const { message, code } = parsePgError(err);
				const errMsg = [
					`[DB Init] Statement ${s + 1}/${statements.length} failed:`,
					message,
					code ? `code: ${code}` : '',
					`snippet: ${snippet}`,
					formatDbErrorForLog(err),
				]
					.filter(Boolean)
					.join('\n');
				throw new Error(errMsg, { cause: err });
			}
		}
	} finally {
		client.release();
	}

	const after = await listPresentTables(pool, REQUIRED_TABLES);
	const missing = REQUIRED_TABLES.filter((t) => !after.has(t));
	if (missing.length) {
		throw new Error(
			`[DB Init] Initialization incomplete — missing tables: ${missing.join(', ')} (executed ${executed} statements)`
		);
	}

	const created = REQUIRED_TABLES.filter((t) => !before.has(t) && after.has(t));
	if (created.length) {
		// eslint-disable-next-line no-console
		console.log('[DB Init] Tables created:', created.join(', '));
	}
	if (hadAllBefore) {
		// eslint-disable-next-line no-console
		console.log('[DB Init] Tables already exist (idempotent DDL / indexes / seed reapplied)');
	}

	// eslint-disable-next-line no-console
	console.log('[DB Init] Initialization complete');
	return { created, hadAllBefore };
}

module.exports = {
	REQUIRED_TABLES,
	splitSqlStatements,
	runDatabaseInitialization,
};
