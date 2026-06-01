import { builderCors, jsonWithCors, surveyBuilderService } from '../../../_shared.js';

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...builderCors } });
}

/**
 * @param {import('next/server').NextRequest} _request
 * @param {{ params: Promise<{ surveyId: string }> }} ctx
 */
export async function POST(_request, ctx) {
	const { surveyId } = await ctx.params;
	const out = await surveyBuilderService.duplicateSurvey(surveyId);
	return jsonWithCors(out.json, out.status);
}
