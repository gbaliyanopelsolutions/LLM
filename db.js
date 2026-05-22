'use strict';

const { loadProjectEnv } = require('./lib/loadEnv.js');

loadProjectEnv();

/**
 * PostgreSQL pool + helpers (see config/db.js).
 * TLS: DATABASE_URL connections merge `ssl: { rejectUnauthorized }` from config/db.js
 * (default false for localhost; set PG_REJECT_UNAUTHORIZED=true in production).
 */
module.exports = require('./config/db.js');
