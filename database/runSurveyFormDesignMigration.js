'use strict';

const fs = require('fs/promises');
const path = require('path');

const { splitSqlStatements } = require('./sqlSplit.js');

/**
 * Apply database/migration_survey_form_design.sql
 *
 * @returns {Promise<{ executed: number }>}
 */
async function runSurveyFormDesignMigration() {
	const { getPool, parsePgError, formatDbErrorForLog } = require('../db.js');
	const pool = getPool();
	const sqlPath = path.join(__dirname, 'migration_survey_form_design.sql');
	const raw = await fs.readFile(sqlPath, 'utf8');
	const statements = splitSqlStatements(raw);

	const client = await pool.connect();
	let executed = 0;
	try {
		for (let s = 0; s < statements.length; s += 1) {
			const text = statements[s];
			// eslint-disable-next-line no-await-in-loop
			await client.query(text);
			executed += 1;
		}
	} catch (err) {
		const snippet = statements[executed]?.replace(/\s+/g, ' ').slice(0, 220) || '';
		const { message, code } = parsePgError(err);
		throw new Error(
			[
				`[db:migrate:form-design] Statement ${executed + 1}/${statements.length} failed:`,
				message,
				code ? `code: ${code}` : '',
				`snippet: ${snippet}`,
				formatDbErrorForLog(err),
			]
				.filter(Boolean)
				.join('\n'),
			{ cause: err }
		);
	} finally {
		client.release();
	}

	return { executed };
}

module.exports = { runSurveyFormDesignMigration };
