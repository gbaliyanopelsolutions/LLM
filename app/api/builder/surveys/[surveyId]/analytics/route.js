import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const { getPool, isDatabaseConfigured } = require('../../../../../../db.js');
const { getSurveyById } = require('../../../../../../lib/surveyBuilderService.js');

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
	return NextResponse.json(data, { status, headers: cors });
}

export function OPTIONS() {
	return new Response(null, { status: 204, headers: cors });
}

/**
 * GET /api/builder/surveys/{surveyId}/analytics
 * Returns survey-specific analytics: response counts, completion rates, trends, question breakdown
 */
export async function GET(_request, ctx) {
	if (!isDatabaseConfigured()) {
		return json({ error: 'Database not configured' }, 503);
	}

	try {
		const { surveyId } = await ctx.params;

		if (!surveyId) {
			return json({ error: 'Missing survey id', code: 'VALIDATION' }, 400);
		}

		const pool = getPool();

		// Get survey (with ownership validation)
		const survey = await getSurveyById(surveyId);
		if (!survey) {
			return json({ error: 'Survey not found', code: 'NOT_FOUND' }, 404);
		}

		// Get overview stats
		const overviewResult = await pool.query(
			`SELECT
				COUNT(DISTINCT response_id)::int AS total_responses,
				COUNT(DISTINCT CASE WHEN submitted_at IS NOT NULL THEN respondent_id END)::int AS completed,
				COUNT(DISTINCT CASE WHEN submitted_at IS NULL THEN respondent_id END)::int AS abandoned,
				ROUND(
					COUNT(DISTINCT CASE WHEN submitted_at IS NOT NULL THEN respondent_id END)::float /
					NULLIF(COUNT(DISTINCT respondent_id), 0),
					2
				) AS completion_rate,
				ROUND(
					COUNT(DISTINCT CASE WHEN submitted_at IS NULL THEN respondent_id END)::float /
					NULLIF(COUNT(DISTINCT respondent_id), 0),
					2
				) AS abandonment_rate,
				ROUND(
					AVG(EXTRACT(EPOCH FROM (submitted_at - created_at)))::int
				) AS avg_time_seconds
			FROM public.responses
			WHERE survey_id = $1`,
			[surveyId]
		);

		const overview = overviewResult.rows[0] || {
			total_responses: 0,
			completed: 0,
			abandoned: 0,
			completion_rate: 0,
			abandonment_rate: 0,
			avg_time_seconds: 0,
		};

		// Get responses over time (last 30 days)
		const trendsResult = await pool.query(
			`SELECT
				DATE(created_at) as date,
				COUNT(DISTINCT response_id)::int as count
			FROM public.responses
			WHERE survey_id = $1
			AND created_at >= NOW() - INTERVAL '30 days'
			GROUP BY DATE(created_at)
			ORDER BY date ASC`,
			[surveyId]
		);

		const responses_over_time = trendsResult.rows || [];

		// Get questions with response analysis
		const questionsResult = await pool.query(
			`SELECT
				q.question_id,
				q.question_text,
				q.type,
				q.options_json,
				q.sort_order,
				COUNT(DISTINCT CASE WHEN r.answer_text IS NOT NULL OR r.answer_score IS NOT NULL THEN r.response_id END)::int as response_count,
				COUNT(DISTINCT CASE WHEN r.answer_text IS NULL AND r.answer_score IS NULL THEN r.response_id END)::int as skip_count
			FROM public.questions q
			LEFT JOIN public.responses r ON q.question_id = r.question_id
			WHERE q.survey_id = $1
			GROUP BY q.question_id, q.question_text, q.type, q.options_json, q.sort_order
			ORDER BY q.sort_order ASC`,
			[surveyId]
		);

		// Process questions with response distributions
		const questions = [];
		for (const q of questionsResult.rows || []) {
			const questionData = {
				question_id: q.question_id,
				question_text: q.question_text,
				type: q.type,
				response_count: q.response_count,
				skip_count: q.skip_count,
				skip_rate: overview.total_responses > 0 ?
					parseFloat((q.skip_count / overview.total_responses).toFixed(2)) : 0,
			};

			// For choice questions, get response distributions
			if (['single_choice', 'multiple_choice'].includes(q.type)) {
				const optionsResult = await pool.query(
					`SELECT
						answer_text as option,
						COUNT(*) as count
					FROM public.responses
					WHERE question_id = $1 AND answer_text IS NOT NULL
					GROUP BY answer_text
					ORDER BY count DESC`,
					[q.question_id]
				);

				const options = optionsResult.rows.map((row) => ({
					option: row.option,
					count: row.count,
					percentage: parseFloat(
						((row.count / Math.max(q.response_count, 1)) * 100).toFixed(1)
					),
				}));

				questionData.options = options;
			}

			questions.push(questionData);
		}

		return json({
			ok: true,
			survey: {
				survey_id: survey.survey_id,
				name: survey.name,
				description: survey.description,
				status: survey.status,
				created_at: survey.created_at,
				updated_at: survey.updated_at,
			},
			analytics: {
				overview: {
					total_responses: overview.total_responses,
					completed: overview.completed,
					started_not_completed: overview.abandoned,
					completion_rate: Number(overview.completion_rate) || 0,
					abandonment_rate: Number(overview.abandonment_rate) || 0,
					avg_time_seconds: Number(overview.avg_time_seconds) || 0,
				},
				responses_over_time,
				questions,
			},
		});
	} catch (err) {
		console.error('Error fetching survey analytics:', err);
		return json({ error: err.message, code: 'DB_ERROR' }, 500);
	}
}
