/**
 * Persist one LLM turn to Supabase (public.submissions).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ message: string, result: string | null }} payload
 * @returns {Promise<void>}
 */
export async function insertSubmission(client, payload) {
	const message = typeof payload.message === 'string' ? payload.message.trim() : '';
	if (!message) {
		throw new Error('Message is required.');
	}
	const result = typeof payload.result === 'string' ? payload.result : payload.result == null ? null : String(payload.result);

	const { error } = await client.from('submissions').insert({
		message,
		result,
	});

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
