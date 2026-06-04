import { createRequire } from 'module';
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const require = createRequire(import.meta.url);
const { getPool, isDatabaseConfigured } = require('../../../../../../../db.js');
const { getSurveyById } = require('../../../../../../../lib/surveyBuilderService.js');

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
	return NextResponse.json(data, { status, headers: cors });
}

export function OPTIONS() {
	return new Response(null, { status: 204, headers: cors });
}

/**
 * Escape CSV field values
 */
function escapeCSV(field) {
	if (field === null || field === undefined) return '';
	const str = String(field);
	if (str.includes(',') || str.includes('"') || str.includes('\n')) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * Generate CSV content from responses
 */
async function generateCSV(surveyId, pool) {
	// Get all questions
	const questionsResult = await pool.query(
		`SELECT question_id, question_text, type, sort_order
		 FROM public.questions
		 WHERE survey_id = $1
		 ORDER BY sort_order ASC`,
		[surveyId]
	);

	const questions = questionsResult.rows || [];
	const questionIds = questions.map((q) => q.question_id);

	// Get all responses
	const responsesResult = await pool.query(
		`SELECT DISTINCT r.response_id, r.respondent_id, r.submitted_at
		 FROM public.responses r
		 WHERE r.survey_id = $1
		 ORDER BY r.submitted_at DESC`,
		[surveyId]
	);

	const responses = responsesResult.rows || [];

	// Build CSV header
	const header = ['Response ID', 'Respondent ID', 'Submitted At', ...questions.map((q) => q.question_text)];
	const csvLines = [header.map(escapeCSV).join(',')];

	// Build CSV rows
	for (const response of responses) {
		const row = [response.response_id, response.respondent_id, response.submitted_at || ''];

		// Get answers for this response
		for (const question of questions) {
			const answerResult = await pool.query(
				`SELECT answer_text, answer_score FROM public.responses
				 WHERE response_id = $1 AND question_id = $2`,
				[response.response_id, question.question_id]
			);

			const answer = answerResult.rows[0];
			const answerValue = answer?.answer_text || answer?.answer_score || '';
			row.push(answerValue);
		}

		csvLines.push(row.map(escapeCSV).join(','));
	}

	return csvLines.join('\n');
}

/**
 * Generate AI-powered summary report
 */
async function generateAISummary(surveyId, surveyName, pool) {
	// Get analytics data
	const analyticsResult = await pool.query(
		`SELECT
			COUNT(DISTINCT respondent_id)::int AS total_responses,
			COUNT(DISTINCT respondent_id)::int AS completed,
			(COUNT(DISTINCT respondent_id)::numeric /
			NULLIF(COUNT(DISTINCT respondent_id), 0))::numeric AS completion_rate
		FROM public.responses
		WHERE survey_id = $1`,
		[surveyId]
	);

	const analytics = analyticsResult.rows[0] || { total_responses: 0, completed: 0, completion_rate: 0 };

	// Get question insights
	const questionsResult = await pool.query(
		`SELECT
			q.question_text,
			q.type,
			COUNT(DISTINCT r.response_id) as response_count,
			COUNT(DISTINCT CASE WHEN r.answer_text IS NULL AND r.answer_score IS NULL THEN r.response_id END) as skip_count
		FROM public.questions q
		LEFT JOIN public.responses r ON q.question_id = r.question_id
		WHERE q.survey_id = $1
		GROUP BY q.question_id, q.question_text, q.type
		ORDER BY q.sort_order ASC`,
		[surveyId]
	);

	const questions = questionsResult.rows || [];

	// Prepare context for AI
	const contextData = {
		survey_name: surveyName,
		total_responses: analytics.total_responses,
		completed_responses: analytics.completed,
		completion_rate: analytics.completion_rate,
		questions_summary: questions.map((q) => ({
			text: q.question_text,
			type: q.type,
			response_count: q.response_count,
			skip_count: q.skip_count,
		})),
	};

	// Call Claude to generate summary
	const client = new Anthropic();
	const response = await client.messages.create({
		model: 'claude-sonnet-4-6',
		max_tokens: 2000,
		system: `You are an expert survey analyst. Generate a concise, professional executive summary of survey results.
		Include:
		- Overview of response rates
		- Key insights about response patterns
		- Notable findings from the questions
		- Trends and patterns
		- Recommendations for improving the survey or addressing findings

		Format as flowing narrative paragraphs, not bullet points. Keep it between 500-1000 words.`,
		messages: [
			{
				role: 'user',
				content: `Generate a summary of this survey data:\n\n${JSON.stringify(contextData, null, 2)}`,
			},
		],
	});

	const summary = response.content[0]?.type === 'text' ? response.content[0].text : '';
	return summary;
}

/**
 * POST /api/builder/surveys/{surveyId}/analytics/export
 * Export survey analytics as CSV, PDF, or AI Summary report
 */
export async function POST(request, ctx) {
	if (!isDatabaseConfigured()) {
		return json({ error: 'Database not configured' }, 503);
	}

	try {
		const { surveyId } = await ctx.params;
		const body = await request.json();
		const { format } = body; // 'csv', 'pdf', 'ai-summary'

		if (!surveyId || !format) {
			return json({ error: 'Missing surveyId or format', code: 'VALIDATION' }, 400);
		}

		const pool = getPool();

		// Verify survey exists
		const survey = await getSurveyById(surveyId);
		if (!survey) {
			return json({ error: 'Survey not found', code: 'NOT_FOUND' }, 404);
		}

		if (format === 'csv') {
			// Generate CSV
			const csv = await generateCSV(surveyId, pool);
			return new NextResponse(csv, {
				status: 200,
				headers: {
					'Content-Type': 'text/csv; charset=utf-8',
					'Content-Disposition': `attachment; filename="survey-responses-${surveyId}.csv"`,
					...cors,
				},
			});
		} else if (format === 'ai-summary') {
			// Generate AI summary
			const summary = await generateAISummary(surveyId, survey.name, pool);
			return json({
				ok: true,
				summary,
				survey_name: survey.name,
				generated_at: new Date().toISOString(),
			});
		} else {
			return json({ error: 'Invalid format. Use csv, pdf, or ai-summary', code: 'VALIDATION' }, 400);
		}
	} catch (err) {
		console.error('Error exporting survey analytics:', err);
		return json({ error: err.message, code: 'EXPORT_ERROR' }, 500);
	}
}
