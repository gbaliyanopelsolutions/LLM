import { builderCors, jsonWithCors, surveyBuilderService } from '../_shared.js';

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: { ...builderCors } });
}

export async function GET() {
	const out = await surveyBuilderService.listCompanies();
	return jsonWithCors(out.json, out.status);
}

export async function POST(request) {
	let body = {};
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	const out = await surveyBuilderService.createCompany(body);
	return jsonWithCors(out.json, out.status);
}
