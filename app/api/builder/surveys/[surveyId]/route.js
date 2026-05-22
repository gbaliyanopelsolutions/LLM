import { builderCors, jsonWithCors, surveyBuilderService } from '../../_shared.js';

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...builderCors } });
}

/**
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ surveyId: string }> }} ctx
 */
export async function GET(_request, ctx) {
	const { surveyId } = await ctx.params;
	const out = await surveyBuilderService.getSurveyById(surveyId);
	return jsonWithCors(out.json, out.status);
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ params: Promise<{ surveyId: string }> }} ctx
 */
export async function PATCH(request, ctx) {
	const { surveyId } = await ctx.params;
	let body = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const out = await surveyBuilderService.updateSurvey(surveyId, body);
	return jsonWithCors(out.json, out.status);
}

/**
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ surveyId: string }> }} ctx
 */
export async function DELETE(_request, ctx) {
	const { surveyId } = await ctx.params;
	const out = await surveyBuilderService.deleteSurvey(surveyId);
	return jsonWithCors(out.json, out.status);
}
