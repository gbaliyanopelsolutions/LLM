import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

import { getSupabaseServerEnv } from './lib/supabase/env.js';

/**
 * @param {string} origin
 * @returns {boolean}
 */
function isLoopbackOrigin(origin) {
	if (!origin) {
		return false;
	}
	try {
		const { hostname } = new URL(origin);
		return hostname === 'localhost' || hostname === '127.0.0.1';
	} catch {
		return false;
	}
}

/**
 * @param {string} origin
 * @returns {Record<string, string>}
 */
function surveyCorsHeaders(origin) {
	return {
		'Access-Control-Allow-Origin': origin,
		Vary: 'Origin',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
	};
}

/**
 * Refreshes Supabase auth cookies on each matched request (PKCE / SSR).
 *
 * @param {import('next/server').NextRequest} request
 */
export async function middleware(request) {
	const path = request.nextUrl.pathname;
	const origin = request.headers.get('origin') || '';
	const surveyPath = path === '/generate' || path.startsWith('/api/public') || path.startsWith('/api/builder');

	if (surveyPath && isLoopbackOrigin(origin)) {
		if (request.method === 'OPTIONS') {
			return new NextResponse(null, { status: 204, headers: surveyCorsHeaders(origin) });
		}
	}

	let response = NextResponse.next({
		request: {
			headers: request.headers,
		},
	});

	const { url, anonKey } = getSupabaseServerEnv();

	if (!url || !anonKey) {
		if (surveyPath && isLoopbackOrigin(origin)) {
			Object.entries(surveyCorsHeaders(origin)).forEach(([k, v]) => {
				response.headers.set(k, v);
			});
		}
		return response;
	}

	const supabase = createServerClient(url, anonKey, {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				cookiesToSet.forEach(({ name, value }) => {
					request.cookies.set(name, value);
				});
				response = NextResponse.next({
					request: {
						headers: request.headers,
					},
				});
				cookiesToSet.forEach(({ name, value, options }) => {
					response.cookies.set(name, value, options);
				});
			},
		},
	});

	await supabase.auth.getUser();

	if (surveyPath && isLoopbackOrigin(origin)) {
		Object.entries(surveyCorsHeaders(origin)).forEach(([k, v]) => {
			response.headers.set(k, v);
		});
	}

	return response;
}
export const config = {
	matcher: [
		/*
		 * Match all request paths except static assets and images.
		 */
		'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
	],
};
