import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const { getPool, isDatabaseConfigured } = require('../../../../db.js');

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
	return NextResponse.json(data, { status, headers: cors });
}

export function OPTIONS() {
	return new Response(null, { status: 204, headers: cors });
}

/** Fetch live schema from information_schema. */
async function getSchema(pool) {
	const { rows } = await pool.query(
		`SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('companies','surveys','questions','responses','respondents')
     ORDER BY table_name, ordinal_position`
	);

	/** @type {Record<string,string[]>} */
	const tables = {};
	for (const r of rows) {
		(tables[r.table_name] ??= []).push(`${r.column_name} (${r.data_type})`);
	}

	return Object.entries(tables)
		.map(([t, cols]) => `${t}:\n  ${cols.join('\n  ')}`)
		.join('\n\n');
}

/** Strip markdown code fences from AI output. */
function stripFences(text) {
	return text
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/\s*```\s*$/i, '')
		.trim();
}

export async function POST(request) {
	if (!isDatabaseConfigured()) {
		return json({ error: 'Database not configured' }, 503);
	}
	if (!process.env.ANTHROPIC_API_KEY) {
		return json({ error: 'ANTHROPIC_API_KEY is not set' }, 500);
	}

	let body = {};
	try {
		body = await request.json();
	} catch {
		/* ignore */
	}

	const userMessage = typeof body.message === 'string' ? body.message.trim() : '';
	if (!userMessage) {
		return json({ error: 'Missing message' }, 400);
	}

	const pool = getPool();

	let schema = '';
	try {
		schema = await getSchema(pool);
	} catch {
		schema = '(schema unavailable)';
	}

	const systemPrompt = `You are a SQL analytics expert for a survey management database.

DATABASE SCHEMA:
${schema}

RULES:
- Generate only SELECT queries — never INSERT, UPDATE, DELETE, DROP, TRUNCATE, or any DDL.
- Use clear table aliases (e.g. c for companies, s for surveys).
- Add LIMIT 100 unless the query is a pure aggregate (COUNT/SUM/AVG).
- Use COALESCE to handle NULLs where sensible.
- Respond ONLY with valid JSON — no markdown, no code fences, no extra text.

JSON FORMAT:
{
  "sql": "SELECT ...",
  "explanation": "One sentence describing what this query returns."
}`;

	const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

	try {
		const aiMsg = await anthropic.messages.create({
			model:      'claude-sonnet-4-5',
			max_tokens: 1024,
			system:     systemPrompt,
			messages:   [{ role: 'user', content: userMessage }],
		});

		const rawText = aiMsg.content
			.filter((b) => b.type === 'text')
			.map((b) => b.text)
			.join('');

		// Extract JSON
		let parsed = {};
		try {
			const cleaned = stripFences(rawText);
			const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				parsed = JSON.parse(jsonMatch[0]);
			}
		} catch {
			return json({ error: 'AI returned unparseable response', raw: rawText }, 502);
		}

		const sql         = typeof parsed.sql === 'string'         ? parsed.sql.trim()         : '';
		const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';

		// Strict SELECT guard
		if (!sql || !/^\s*SELECT\s/i.test(sql)) {
			return json({ error: 'AI did not generate a valid SELECT query', sql, explanation }, 502);
		}

		// Run query
		try {
			const result  = await pool.query(sql);
			const columns = result.fields.map((f) => f.name);
			return json({
				sql,
				explanation,
				columns,
				rows:     result.rows.slice(0, 100),
				rowCount: result.rowCount,
			});
		} catch (dbErr) {
			// Return the SQL + explanation even if execution fails
			return json({
				sql,
				explanation,
				columns:  [],
				rows:     [],
				rowCount: 0,
				queryError: dbErr.message,
			});
		}
	} catch (err) {
		return json({ error: err.message }, 500);
	}
}
