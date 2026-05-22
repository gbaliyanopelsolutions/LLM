/**
 * Strip trailing slashes and mistaken `/rest/v1` suffix (PostgREST lives under that path automatically).
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeSupabaseUrl(raw) {
	let u = String(raw).trim();
	u = u.replace(/\/+$/, '');
	u = u.replace(/\/rest\/v1\/?$/i, '');
	return u.replace(/\/+$/, '');
}

/**
 * Resolve Supabase URL and anon key for server components and middleware.
 * Browser code must use NEXT_PUBLIC_* only (see client.js). Set keys in connection.env (see connection.env.example).
 *
 * @returns {{ url: string, anonKey: string }}
 */
export function getSupabaseServerEnv() {
	const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
	const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
	return { url: normalizeSupabaseUrl(rawUrl), anonKey: String(anonKey).trim() };
}

/**
 * Payload for `GET /api/public/supabase-config` (publishable keys only).
 *
 * @returns {{ configured: false } | { configured: true, supabaseUrl: string, supabaseAnonKey: string }}
 */
export function getSupabasePublicConfig() {
	const { url, anonKey } = getSupabaseServerEnv();
	if (!url || !anonKey) {
		return { configured: false };
	}
	return { configured: true, supabaseUrl: url, supabaseAnonKey: anonKey };
}
