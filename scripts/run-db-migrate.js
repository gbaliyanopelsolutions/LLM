'use strict';

/**
 * Apply survey migrations (max submissions + form HTML/CSS design)
 *
 * Usage: npm run db:migrate
 */

require('../db.js');

const { isDatabaseConfigured, testConnection } = require('../db.js');
const { runSurveyMaxSubmissionsMigration } = require('../database/runSurveyMaxSubmissionsMigration.js');
const { runSurveyFormDesignMigration } = require('../database/runSurveyFormDesignMigration.js');
const { runSurveyQuestionFieldsMigration } = require('../database/runSurveyQuestionFieldsMigration.js');
const { runStyleJsonMigration } = require('../database/runStyleJsonMigration.js');

function routingHelp() {
	return [
		'',
		'--- Survey max-submissions migration ---',
		'• Requires DATABASE_URL in connection.env',
		'• If DDL fails on port 6543 (pooler), use Direct connection (port 5432):',
		'  Supabase → Project Settings → Database → Connection string → Direct.',
	].join('\n');
}

async function main() {
	if (!isDatabaseConfigured()) {
		// eslint-disable-next-line no-console
		console.error('[db:migrate] DATABASE_URL or DB_HOST/DB_NAME/DB_USER is not set.');
		// eslint-disable-next-line no-console
		console.error(routingHelp());
		process.exit(1);
	}

	const t = await testConnection();
	if (!t.ok) {
		// eslint-disable-next-line no-console
		console.error('[db:migrate] Connection failed:', t.error);
		// eslint-disable-next-line no-console
		console.error(routingHelp());
		process.exit(1);
	}

	// eslint-disable-next-line no-console
	console.log('[db:migrate] Database reachable (' + t.latencyMs + ' ms)');

	try {
		const maxSub = await runSurveyMaxSubmissionsMigration();
		const formDesign = await runSurveyFormDesignMigration();
		const questionFields = await runSurveyQuestionFieldsMigration();
		const styleJson = await runStyleJsonMigration();
		// eslint-disable-next-line no-console
		console.log(
			'[db:migrate] Done — max_submissions:',
			maxSub.executed,
			'statement(s); form_design:',
			formDesign.executed,
			'statement(s); question_fields:',
			questionFields.executed,
			'statement(s); style_json:',
			styleJson.executed,
			'statement(s).'
		);
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error(err instanceof Error ? err.message : err);
		// eslint-disable-next-line no-console
		console.error(routingHelp());
		process.exit(1);
	}
}

main();
