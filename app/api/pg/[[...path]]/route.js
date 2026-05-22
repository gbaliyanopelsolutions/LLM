import { NextResponse } from 'next/server';

import { runPgRouteSafe } from '../../../../lib/pgRouter.js';

const corsHeaders = () => ({
	'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization',
});

/**
 * @param {string | string[] | undefined} pathParam
 * @returns {string[]}
 */
function normalizeSegments(pathParam) {
	if (!pathParam) {
		return [];
	}
	return Array.isArray(pathParam) ? pathParam : [pathParam];
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ params: Promise<{ path?: string | string[] }> }} ctx
 * @returns {Promise<NextResponse>}
 */
async function handle(request, ctx) {
	const params = await ctx.params;
	const segments = normalizeSegments(params.path);
	const url = new URL(request.url);

	let body = null;
	if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
		try {
			body = await request.json();
		} catch {
			body = undefined;
		}
	}

	const out = await runPgRouteSafe(request.method, segments, url.searchParams, body);
	return NextResponse.json(out.body, {
		status: out.statusCode,
		headers: corsHeaders(),
	});
}

export async function GET(request, ctx) {
	return handle(request, ctx);
}

export async function POST(request, ctx) {
	return handle(request, ctx);
}

export async function PUT(request, ctx) {
	return handle(request, ctx);
}

export async function PATCH(request, ctx) {
	return handle(request, ctx);
}

export async function DELETE(request, ctx) {
	return handle(request, ctx);
}

export async function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
