import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseServerEnv } from './env.js';

/**
 * Supabase client for Server Components, Server Actions, and Route Handlers.
 * Uses the user session from cookies when present.
 *
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function createClient() {
	const cookieStore = await cookies();
	const { url, anonKey } = getSupabaseServerEnv();

	if (!url || !anonKey) {
		throw new Error(
			'Missing SUPABASE_URL / SUPABASE_ANON_KEY (or NEXT_PUBLIC_* fallbacks). See connection.env.example.'
		);
	}

	return createServerClient(url, anonKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet) {
				try {
					cookiesToSet.forEach(({ name, value, options }) => {
						cookieStore.set(name, value, options);
					});
				} catch {
					// Called from a Server Component without mutable cookies; middleware refreshes session.
				}
			},
		},
	});
}
