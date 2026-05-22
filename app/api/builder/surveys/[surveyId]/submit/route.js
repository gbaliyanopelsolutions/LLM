import { builderCors, jsonWithCors, surveyBuilderService } from '../../../_shared.js';

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...builderCors } });
}

/**
 * @param {import('next/server').NextRequest} request
 * @param {{ params: Promise<{ surveyId: string }> }} ctx
 */
export async function POST(request, ctx) {
	const { surveyId } = await ctx.params;
	let body = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const out = await surveyBuilderService.submitSurvey(surveyId, body);
	return jsonWithCors(out.json, out.status);
}
