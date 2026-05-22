/**
 * API base + optional Supabase browser client for authenticated features.
 */

/**
 * When the UI is opened from file:// or Apache (port 80/8080) while the API runs on Node/Next
 * (e.g. 127.0.0.1:3000), a relative fetch('/api/...') would hit the wrong server. Infer the dev API origin.
 *
 * @returns {string} Empty string when same origin should serve /api (e.g. Next or Express on :3000).
 */
function inferLoopbackApiBase() {
	if (typeof window === 'undefined') {
		return '';
	}
	const { protocol, hostname, port } = window.location;
	if (protocol === 'file:') {
		return 'http://127.0.0.1:3000';
	}
	const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
	if (!isLoopback) {
		return '';
	}
	const p = port ? parseInt(port, 10) : protocol === 'https:' ? 443 : 80;
	/* Dev servers that expose /api on the same origin — keep relative URLs. */
	if (p === 3000 || p === 3001) {
		return '';
	}
	/* Typical XAMPP / IIS / reverse-proxy static hosting — API on default Node port. */
	if (p === 80 || p === 443 || p === 8080 || p === 8443) {
		return 'http://127.0.0.1:3000';
	}
	return '';
}

/**
 * @returns {string}
 */
export function getApiBase() {
	const meta = document.querySelector('meta[name="app-api-base"]');
	if (meta && meta.content && meta.content.trim()) {
		return meta.content.trim().replace(/\/+$/, '');
	}
	if (typeof window !== 'undefined' && window.__APP_API_BASE__) {
		return String(window.__APP_API_BASE__).trim().replace(/\/+$/, '');
	}
	try {
		const fromLs = localStorage.getItem('appApiBase');
		if (fromLs && fromLs.trim()) {
			return fromLs.trim().replace(/\/+$/, '');
		}
	} catch {
		/* private mode or blocked */
	}
	const inferred = inferLoopbackApiBase();
	return inferred || '';
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeSupabaseUrl(raw) {
	let u = String(raw || '').trim();
	u = u.replace(/\/+$/, '');
	u = u.replace(/\/rest\/v1\/?$/i, '');
	return u.replace(/\/+$/, '');
}

/**
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient | null>}
 */
export async function getBrowserSupabase() {
	const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.8');
	const res = await fetch(`${getApiBase()}/api/public/supabase-config`);
	if (!res.ok) {
		throw new Error('Could not load Supabase configuration.');
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

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ message: string, result: string | null }} payload
 */
export async function insertSubmission(client, payload) {
	const message = typeof payload.message === 'string' ? payload.message.trim() : '';
	if (!message) {
		throw new Error('Message is required.');
	}
	const result =
		typeof payload.result === 'string' ? payload.result : payload.result == null ? null : String(payload.result);
	const { error } = await client.from('submissions').insert({ message, result });
	if (error) {
		const parts = [
			error.message,
			error.details ? `Details: ${error.details}` : '',
			error.hint ? `Hint: ${error.hint}` : '',
			error.code ? `(${error.code})` : '',
		].filter(Boolean);
		throw new Error(parts.join(' — ') || 'Insert failed');
	}
}
