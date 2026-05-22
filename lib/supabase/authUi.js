/**
 * Supabase `auth.getUser()` (and similar) can return an error when nobody is signed in.
 * That is expected for public pages — do not show it as a red "failure" message.
 *
 * @param {import('@supabase/supabase-js').AuthError | null | undefined} error
 * @returns {boolean}
 */
export function isExpectedGuestAuthError(error) {
	if (!error || typeof error !== 'object') {
		return false;
	}
	const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
	const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
	return (
		name === 'AuthSessionMissingError' ||
		message === 'Auth session missing!' ||
		name === 'AuthInvalidTokenResponseError' ||
		message === 'Auth session or user missing'
	);
}
