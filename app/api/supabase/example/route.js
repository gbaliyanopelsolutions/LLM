import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server.js';

const TABLE = 'example_items';

/**
 * @param {unknown} err
 * @returns {{ message: string, code?: string }}
 */
function formatError(err) {
	if (err && typeof err === 'object') {
		const o = err;
		const message = typeof o.message === 'string' ? o.message : 'Database error';
		const code = typeof o.code === 'string' ? o.code : undefined;
		return { message, code };
	}
	return { message: err instanceof Error ? err.message : 'Unknown error' };
}

/**
 * GET: select recent rows from `example_items`.
 * POST: insert `{ "title": string }`.
 */
export async function GET() {
	try {
		const supabase = await createClient();
		const { data, error } = await supabase
			.from(TABLE)
			.select('id, title, created_at')
			.order('created_at', { ascending: false })
			.limit(20);

		if (error) {
			const { message, code } = formatError(error);
			return NextResponse.json(
				{
					ok: false,
					error: message,
					code: code ?? 'SUPABASE_ERROR',
					hint: 'Create table example_items and RLS policies (see connection.env.example).',
				},
				{ status: 400 }
			);
		}

		return NextResponse.json({ ok: true, table: TABLE, rows: data ?? [] });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Server error';
		return NextResponse.json({ ok: false, error: msg, code: 'UNEXPECTED' }, { status: 500 });
	}
}

export async function POST(request) {
	try {
		let body = {};
		try {
			body = await request.json();
		} catch {
			return NextResponse.json(
				{ ok: false, error: 'Invalid JSON body', code: 'INVALID_JSON' },
				{ status: 400 }
			);
		}

		const title = typeof body.title === 'string' ? body.title.trim() : '';
		if (!title) {
			return NextResponse.json(
				{ ok: false, error: 'Missing or empty "title"', code: 'VALIDATION' },
				{ status: 400 }
			);
		}

		const supabase = await createClient();
		const { data, error } = await supabase
			.from(TABLE)
			.insert({ title })
			.select('id, title, created_at')
			.single();

		if (error) {
			const { message, code } = formatError(error);
			return NextResponse.json(
				{ ok: false, error: message, code: code ?? 'SUPABASE_ERROR' },
				{ status: 400 }
			);
		}

		return NextResponse.json({ ok: true, row: data }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Server error';
		return NextResponse.json({ ok: false, error: msg, code: 'UNEXPECTED' }, { status: 500 });
	}
}
