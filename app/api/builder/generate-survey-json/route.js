import Anthropic from '@anthropic-ai/sdk';

import { builderCors, jsonWithCors, surveyBuilderService } from '../_shared.js';

const DEPRECATED_MODEL_ALIASES = {
	'claude-sonnet-4-20250514': 'claude-sonnet-4-5-20250929',
	'claude-4-sonnet-20250514': 'claude-sonnet-4-5-20250929',
};

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/**
 * @param {string|undefined} raw
 * @returns {string}
 */
function resolveModel(raw) {
	const id = typeof raw === 'string' ? raw.trim() : '';
	if (!id) {
		return DEFAULT_MODEL;
	}
	if (Object.prototype.hasOwnProperty.call(DEPRECATED_MODEL_ALIASES, id)) {
		return DEPRECATED_MODEL_ALIASES[id];
	}
	return id;
}

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...builderCors } });
}

export async function POST(request) {
	let body = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const anthropic = new Anthropic();
	const model = resolveModel(process.env.ANTHROPIC_MODEL);
	const out = await surveyBuilderService.generateSurveyJson({ anthropic, model, body });
	return jsonWithCors(out.json, out.status);
}
