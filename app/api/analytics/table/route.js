import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const { getPool, isDatabaseConfigured } = require('../../../../db.js');

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
	return NextResponse.json(data, { status, headers: cors });
}

export function OPTIONS() {
	return new Response(null, { status: 204, headers: cors });
}

const ALLOWED_TABLES = ['companies', 'surveys', 'questions', 'responses', 'respondents'];

export async function GET(request) {
	if (!isDatabaseConfigured()) {
		return json({ error: 'Database not configured' }, 503);
	}

	const { searchParams } = new URL(request.url);
	const table    = searchParams.get('table')    ?? 'companies';
	const page     = Math.max(1, parseInt(searchParams.get('page')     ?? '1',  10));
	const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get('pageSize') ?? '20', 10)));
	const q        = (searchParams.get('q') ?? '').trim();
	const sortCol  = searchParams.get('sort') ?? '';
	const sortDir  = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';

	if (!ALLOWED_TABLES.includes(table)) {
		return json({ error: 'Table not allowed' }, 400);
	}

	const pool   = getPool();
	const offset = (page - 1) * pageSize;

	try {
		// Dynamically discover columns
		const colRes = await pool.query(
			`SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
			[table]
		);

		const colMeta = colRes.rows;
		const columns = colMeta.map((r) => r.column_name);

		if (columns.length === 0) {
			return json({ columns: [], rows: [], total: 0, page, pageSize });
		}

		// Safe sort column
		const safeSort = sortCol && columns.includes(sortCol)
			? `"${sortCol}"`
			: `"${columns[0]}"`;

		// Build WHERE for search
		const params = [];
		let where = '';
		if (q) {
			const textTypes = new Set(['character varying', 'text', 'varchar', 'name', 'character']);
			const textCols  = colMeta
				.filter((r) => textTypes.has(r.data_type))
				.map((r) => `"${r.column_name}"::text ILIKE $1`);
			if (textCols.length > 0) {
				params.push(`%${q}%`);
				where = `WHERE (${textCols.join(' OR ')})`;
			}
		}

		const baseParams  = [...params];
		const countParams = [...baseParams];
		const dataParams  = [...baseParams, pageSize, offset];

		const [countRes, dataRes] = await Promise.all([
			pool.query(
				`SELECT COUNT(*)::int AS total FROM "${table}" ${where}`,
				countParams
			),
			pool.query(
				`SELECT * FROM "${table}" ${where}
         ORDER BY ${safeSort} ${sortDir}
         LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
				dataParams
			),
		]);

		return json({
			columns,
			rows:     dataRes.rows,
			total:    countRes.rows[0]?.total ?? 0,
			page,
			pageSize,
		});
	} catch (err) {
		console.error('Analytics table error:', err);
		return json({ error: err.message }, 500);
	}
}
