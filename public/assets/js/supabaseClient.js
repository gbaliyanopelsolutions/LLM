/**
 * Browser Supabase client (ESM). Uses the publishable anon key from the server config route.
 * Package version aligned with repo dependency @supabase/supabase-js ^2.x
 */
import { getApiBase } from './apiBase.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

/**
 * Dashboard “API URL” is correct; some env files mistakenly use …/rest/v1 — strip it.
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeSupabaseUrl(raw) {
	let u = String(raw).trim();
	u = u.replace(/\/+$/, '');
	u = u.replace(/\/rest\/v1\/?$/i, '');
	return u.replace(/\/+$/, '');
}

/**
 * Fetch URL + anon key, then build a client. Returns null if the app is not configured.
 *
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient | null>}
 */
export async function getSupabaseClient() {
	const base = getApiBase();
	const res = await fetch(`${base}/api/public/supabase-config`);
	if (!res.ok) {
		throw new Error('Could not load Supabase configuration from the server.');
	}
	const data = await res.json();
	if (!data || !data.configured || !data.supabaseUrl || !data.supabaseAnonKey) {
		return null;
	}
	const url = normalizeSupabaseUrl(data.supabaseUrl);
	return createClient(url, data.supabaseAnonKey, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
		},
	});
}
