'use strict';

const path = require('path');
const dotenv = require('dotenv');

/**
 * Load environment variables for local development.
 *
 * Priority (highest wins):
 *   1. Already-set process.env (Vercel / CI injects vars before Node starts)
 *   2. connection.env.local  — gitignored personal overrides
 *   3. connection.env        — gitignored local secrets
 *   4. .env.local            — gitignored Next.js convention
 *
 * On Vercel none of these files exist — the function is a no-op, which is correct
 * because Vercel injects env vars directly into process.env.
 *
 * @param {string} [projectRoot] - Absolute path to repo root (default: `process.cwd()`).
 */
function loadProjectEnv(projectRoot) {
	const root = projectRoot || process.cwd();
	// dotenv.config is safe even when the file doesn't exist; it simply skips.
	dotenv.config({ path: path.join(root, 'connection.env') });
	dotenv.config({ path: path.join(root, 'connection.env.local'), override: true });
	dotenv.config({ path: path.join(root, '.env.local'), override: true });
}

module.exports = { loadProjectEnv };
