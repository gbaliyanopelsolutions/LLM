/**
 * Read-only access to Supabase auth.users (public.users was removed).
 * Mutations must go through Supabase Auth Admin API or the Dashboard.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ rows: unknown[] }>}
 */
async function listUsers(pool) {
	const result = await pool.query(
		`SELECT id,
			email,
			coalesce(raw_user_meta_data->>'full_name', '') AS full_name,
			coalesce(raw_app_meta_data->>'role', 'user') AS role,
			created_at,
			updated_at
		 FROM auth.users
		 ORDER BY created_at DESC
		 LIMIT 100`
	);
	return { rows: result.rows };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} id
 */
async function getUserById(pool, id) {
	const result = await pool.query(
		`SELECT id,
			email,
			coalesce(raw_user_meta_data->>'full_name', '') AS full_name,
			coalesce(raw_app_meta_data->>'role', 'user') AS role,
			created_at,
			updated_at
		 FROM auth.users
		 WHERE id = $1::uuid`,
		[id]
	);
	return result.rows[0] ?? null;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} method
 * @param {string | null} id
 * @param {unknown} body
 */
async function handleUsersCrud(pool, method, id, body) {
	if (method === 'GET' && !id) {
		const { rows } = await listUsers(pool);
		return { statusCode: 200, body: { ok: true, users: rows } };
	}

	if (method === 'GET' && id) {
		const row = await getUserById(pool, id);
		if (!row) {
			return { statusCode: 404, body: { ok: false, error: 'User not found', code: 'NOT_FOUND' } };
		}
		return { statusCode: 200, body: { ok: true, user: row } };
	}

	return {
		statusCode: 501,
		body: {
			ok: false,
			error:
				'User CRUD via SQL on public.users was removed. Use Supabase Auth (sign-up API) or the Dashboard.',
			code: 'USE_SUPABASE_AUTH',
		},
	};
}

module.exports = {
	listUsers,
	getUserById,
	handleUsersCrud,
};
