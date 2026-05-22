'use strict';

/**
 * Split a PostgreSQL script on semicolons that terminate statements,
 * respecting single-quoted strings, double-quoted identifiers, line/block
 * comments, and dollar-quoted bodies ($$...$$, $tag$...$tag$).
 *
 * @param {string} sql
 * @returns {string[]}
 */
function splitSqlStatements(sql) {
	const out = [];
	let buf = '';
	let i = 0;
	/** @type {'code' | 'line_comment' | 'block_comment' | 'sq' | 'dq' | 'dollar'} */
	let state = 'code';
	/** @type {string} */
	let dollarTag = '';

	while (i < sql.length) {
		const c = sql[i];
		const next = sql[i + 1];

		if (state === 'line_comment') {
			if (c === '\n' || c === '\r') {
				state = 'code';
			}
			i += 1;
			continue;
		}

		if (state === 'block_comment') {
			if (c === '*' && next === '/') {
				state = 'code';
				i += 2;
				continue;
			}
			i += 1;
			continue;
		}

		if (state === 'sq') {
			buf += c;
			if (c === "'") {
				if (next === "'") {
					buf += next;
					i += 2;
					continue;
				}
				state = 'code';
			}
			i += 1;
			continue;
		}

		if (state === 'dq') {
			buf += c;
			if (c === '"') {
				if (next === '"') {
					buf += next;
					i += 2;
					continue;
				}
				state = 'code';
			}
			i += 1;
			continue;
		}

		if (state === 'dollar') {
			if (c === '$') {
				const rest = sql.slice(i);
				const close = '$' + dollarTag + '$';
				if (rest.startsWith(close)) {
					buf += close;
					i += close.length;
					state = 'code';
					dollarTag = '';
					continue;
				}
			}
			buf += c;
			i += 1;
			continue;
		}

		if (c === '-' && next === '-') {
			state = 'line_comment';
			i += 2;
			continue;
		}
		if (c === '/' && next === '*') {
			state = 'block_comment';
			i += 2;
			continue;
		}
		if (c === "'") {
			state = 'sq';
			buf += c;
			i += 1;
			continue;
		}
		if (c === '"') {
			state = 'dq';
			buf += c;
			i += 1;
			continue;
		}
		if (c === '$') {
			const rest = sql.slice(i);
			const m = /^\$([A-Za-z0-9_]*)\$/.exec(rest);
			if (m) {
				dollarTag = m[1];
				buf += m[0];
				i += m[0].length;
				state = 'dollar';
				continue;
			}
		}
		if (c === ';') {
			const t = buf.trim();
			if (t) {
				out.push(t);
			}
			buf = '';
			i += 1;
			continue;
		}

		buf += c;
		i += 1;
	}

	const tail = buf.trim();
	if (tail) {
		out.push(tail);
	}
	return out;
}

module.exports = { splitSqlStatements };
