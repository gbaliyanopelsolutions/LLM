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
 * POST /api/builder/surveys/{surveyId}/analytics/chat
 * AI-powered natural language to SQL converter scoped to a specific survey
 * Generates queries against that survey's questions and responses
 */
export async function POST(request, ctx) {
	if (!isDatabaseConfigured()) {
		return json({ error: 'Database not configured' }, 503);
	}

	try {
		const { surveyId } = await ctx.params;
		const body = await request.json();
		const { message } = body;

		if (!surveyId || !message) {
			return json({ error: 'Missing surveyId or message', code: 'VALIDATION' }, 400);
		}

		const pool = getPool();

		// Verify survey exists
		const survey = await getSurveyById(surveyId);
		if (!survey) {
			return json({ error: 'Survey not found', code: 'NOT_FOUND' }, 404);
		}

		// Get survey questions for context
		const questionsResult = await pool.query(
			`SELECT question_id, question_text, type, options_json
			 FROM public.questions
			 WHERE survey_id = $1
			 ORDER BY sort_order ASC`,
			[surveyId]
		);

		const questions = questionsResult.rows || [];
		const questionsList = questions
			.map((q) => `Q${questions.indexOf(q) + 1}. ${q.question_text} (Type: ${q.type})`)
			.join('\n');

		// Get analytics summary for context
		const analyticsResult = await pool.query(
			`SELECT
				COUNT(DISTINCT date_trunc('second', submitted_at))::int AS total_responses,
				COUNT(DISTINCT respondent_id)::int AS unique_respondents,
				MIN(submitted_at) AS first_response,
				MAX(submitted_at) AS last_response,
				COUNT(DISTINCT question_id)::int AS total_questions
			 FROM public.responses
			 WHERE survey_id = $1`,
			[surveyId]
		);

		const analytics = analyticsResult.rows[0] || {};

		// Get question-wise response counts
		const questionStatsResult = await pool.query(
			`SELECT
				q.question_id,
				q.question_text,
				q.type,
				COUNT(DISTINCT r.response_id) as answer_count,
				COUNT(DISTINCT CASE WHEN r.answer_text IS NOT NULL OR r.answer_score IS NOT NULL THEN r.response_id END) as valid_responses
			 FROM public.questions q
			 LEFT JOIN public.responses r ON q.question_id = r.question_id
			 WHERE q.survey_id = $1
			 GROUP BY q.question_id, q.question_text, q.type
			 ORDER BY q.sort_order ASC`,
			[surveyId]
		);

		const questionStats = questionStatsResult.rows || [];
		const questionStatsText = questionStats
			.map((q) => `- ${q.question_text}: ${q.valid_responses} responses (Type: ${q.type})`)
			.join('\n');

		// Create AI prompt scoped to this survey
		const systemPrompt = `You are an expert survey data analyst and SQL query generator. You help users understand survey responses through natural conversation.

SURVEY CONTEXT:
- Survey: "${survey.name}"
- Total Responses: ${analytics.total_responses || 0}
- Unique Respondents: ${analytics.unique_respondents || 0}
- First Response: ${analytics.first_response ? new Date(analytics.first_response).toLocaleString() : 'N/A'}
- Last Response: ${analytics.last_response ? new Date(analytics.last_response).toLocaleString() : 'N/A'}

QUESTIONS IN THIS SURVEY:
${questionsList}

QUESTION RESPONSE SUMMARY:
${questionStatsText}

DATABASE SCHEMA:
- public.questions: question_id, question_text, type (text/textarea/radio/checkbox/select/etc), options_json, sort_order
- public.responses: response_id, question_id, respondent_id, answer_text, answer_score, submitted_at, survey_id
- public.respondents: respondent_id, full_name, email, department, job_title, created_at

YOUR ROLE:
1. Generate SQL queries to analyze survey data
2. Interpret results and provide insights
3. Answer questions about response patterns, trends, and summaries
4. Handle follow-up questions within context

QUERY REQUIREMENTS:
- ALL queries MUST filter: WHERE survey_id = '${surveyId}'
- SELECT queries only - NO INSERT/UPDATE/DELETE
- Add LIMIT 100 for large result sets
- For aggregations, use COUNT/AVG/MIN/MAX/GROUP BY
- For text analysis, use simple pattern matching where needed

RESPONSE FORMAT (ALWAYS return valid JSON):
{
  "sql": "SELECT ... WHERE survey_id = '${surveyId}' ...",
  "explanation": "Plain English explanation of what this shows",
  "insight": "Human-readable summary of findings"
}

For non-queryable requests:
{
  "sql": null,
  "explanation": "Why this cannot be queried",
  "insight": "Relevant information or suggestion"
}

ANALYTICS YOU CAN PROVIDE:
- Response counts and completion rates
- Answer distributions for each question
- Text response summaries and patterns
- Response timing and trends
- Comparison between questions
- Top/bottom performing answers
- Respondent demographics (if available)
- Sentiment of text responses`;

		const client = new Anthropic();

		// Call Claude to generate SQL
		const response = await client.messages.create({
			model: 'claude-sonnet-4-6',
			max_tokens: 1024,
			system: systemPrompt,
			messages: [
				{
					role: 'user',
					content: message,
				},
			],
		});

		const aiText = response.content[0]?.type === 'text' ? response.content[0].text : '';

		// Parse AI response as JSON
		let sqlData;
		try {
			// Extract JSON from response (may have markdown wrapping)
			const jsonMatch = aiText.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				return json(
					{
						error: 'AI returned non-JSON response',
						raw: aiText,
						code: 'AI_ERROR',
					},
					502
				);
			}

			sqlData = JSON.parse(jsonMatch[0]);
		} catch (parseErr) {
			return json(
				{
					error: 'Failed to parse AI response as JSON',
					raw: aiText,
					code: 'AI_ERROR',
				},
				502
			);
		}

		if (!sqlData.sql) {
			// User asked something not queryable or needs AI analysis
			return json({
				sql: null,
				explanation: sqlData.explanation || 'Cannot generate query for this request',
				insight: sqlData.insight || '',
				columns: [],
				rows: [],
				rowCount: 0,
				queryError: null,
			});
		}

		// Validate SQL starts with SELECT
		if (!sqlData.sql.trim().toUpperCase().startsWith('SELECT')) {
			return json(
				{
					error: 'Generated query is not a SELECT statement',
					code: 'AI_ERROR',
				},
				400
			);
		}

		// Execute the generated query
		let queryResult;
		let queryError = null;
		try {
			queryResult = await pool.query(sqlData.sql);
		} catch (queryErr) {
			queryError = queryErr.message;
			queryResult = { rows: [] };
		}

		// Prepare response with data insights
		const analyticsResponse = {
			sql: sqlData.sql,
			explanation: sqlData.explanation || '',
			insight: sqlData.insight || '',
			columns: (queryResult.fields || []).map((f) => f.name),
			rows: queryResult.rows || [],
			rowCount: (queryResult.rows || []).length,
			queryError,
		};

		return json(analyticsResponse);
	} catch (err) {
		console.error('Error in survey analytics chat:', err);
		return json({ error: err.message, code: 'SERVER_ERROR' }, 500);
	}
}
