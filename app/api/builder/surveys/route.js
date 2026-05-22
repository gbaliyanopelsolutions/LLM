import { builderCors, jsonWithCors, surveyBuilderService } from '../_shared.js';

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...builderCors } });
}

/**
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const out = await surveyBuilderService.listSurveys({
		search: searchParams.get('q') || '',
		page: searchParams.get('page') || undefined,
		pageSize: searchParams.get('pageSize') || undefined,
	});
	return jsonWithCors(out.json, out.status);
}
