import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server.js';

/**
 * OAuth / magic-link redirect target: exchanges `code` for a session cookie.
 */
export async function GET(request) {
	const { searchParams, origin } = new URL(request.url);
	const code = searchParams.get('code');
	const nextPath = searchParams.get('next') ?? '/';

	if (!code) {
		return NextResponse.redirect(new URL('/login?error=missing_code', origin));
	}

	try {
		const supabase = await createClient();
		const { error } = await supabase.auth.exchangeCodeForSession(code);

		if (error) {
			const login = new URL('/login', origin);
			login.searchParams.set('error', encodeURIComponent(error.message));
			return NextResponse.redirect(login);
		}
	} catch {
		return NextResponse.redirect(new URL('/login?error=exchange_failed', origin));
	}

	return NextResponse.redirect(new URL(nextPath, origin));
}
