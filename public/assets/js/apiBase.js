/**
 * Base URL for same-origin API calls. Empty string = current document origin.
 * Set `<meta name="app-api-base" content="http://127.0.0.1:3000">` when HTML is
 * served from Apache/XAMPP but Node (Express or Next) serves `/api` and `/generate`.
 *
 * @returns {string} Origin without trailing slash
 */
export function getApiBase() {
	const meta = document.querySelector('meta[name="app-api-base"]');
	if (meta && meta.content && meta.content.trim()) {
		return meta.content.trim().replace(/\/+$/, '');
	}
	if (typeof window !== 'undefined' && window.__APP_API_BASE__) {
		return String(window.__APP_API_BASE__).trim().replace(/\/+$/, '');
	}
	return '';
}
