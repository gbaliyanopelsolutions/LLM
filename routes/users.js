const { handleUsersCrud } = require('../controllers/usersController.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string | null} id
 * @returns {boolean}
 */
function isValidUserId(id) {
	if (!id) {
		return true;
	}
	return UUID_RE.test(id);
}

/**
 * Users REST branch (called by pg router when path is users).
 *
 * @param {import('pg').Pool} pool
 * @param {string} method
 * @param {string | null} id
 * @param {unknown} body
 */
async function dispatchUsers(pool, method, id, body) {
	if (!isValidUserId(id)) {
		return {
			statusCode: 400,
			body: { ok: false, error: 'Invalid user id (expected UUID)', code: 'VALIDATION' },
		};
	}
	return handleUsersCrud(pool, method, id, body);
}

module.exports = {
	dispatchUsers,
};
