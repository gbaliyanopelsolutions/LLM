'use strict';

/**
 * Smoke-test SQL splitting without DATABASE_URL or pg (no network).
 * Usage: node scripts/verify-sql-split.js
 */

const fs = require('fs');
const path = require('path');

const { splitSqlStatements } = require('../database/sqlSplit.js');

const sqlPath = path.join(__dirname, '..', 'database', 'init.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const statements = splitSqlStatements(sql);

if (!statements.length) {
	console.error('verify-sql-split: no statements parsed');
	process.exit(1);
}

console.log('verify-sql-split: OK —', statements.length, 'statements from database/init.sql');
console.log(
	'Note: this only parses SQL locally. To create tables in Supabase run: npm run db:init (or npm run server).'
);
