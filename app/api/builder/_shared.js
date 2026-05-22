import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const surveyBuilderService = require('../../../lib/surveyBuilderService.js');

/** Matches Express loopback CORS for static pages calling the app origin. */
export const builderCors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * @param {unknown} body
 * @param {number} status
 * @returns {import('next/server').NextResponse}
 */
export function jsonWithCors(body, status) {
	return NextResponse.json(body, { status, headers: { ...builderCors } });
}

export { surveyBuilderService };
