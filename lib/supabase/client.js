'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components and browser code.
 * Next.js only exposes NEXT_PUBLIC_* to the bundle.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!url || !anonKey) {
		throw new Error(
			'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy values from connection.env.example into connection.env (NEXT_PUBLIC_* keys).'
		);
	}

	return createBrowserClient(url, anonKey);
}
