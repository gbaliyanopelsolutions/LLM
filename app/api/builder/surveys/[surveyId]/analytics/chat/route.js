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
			.map((q) => `- ${q.question_text} (ID: ${q.question_id}, Type: ${q.type})`)
			.join('\n');

		// Get sample data structure for responses
		const sampleResult = await pool.query(
			`SELECT
				r.response_id,
				r.question_id,
				r.answer_text,
				r.answer_score,
				r.submitted_at
			 FROM public.responses
			 WHERE survey_id = $1
			 LIMIT 5`,
			[surveyId]
		);

		const sampleResponses = sampleResult.rows || [];

		// Create AI prompt scoped to this survey
		const systemPrompt = `You are a SQL query generator for survey analytics. You have access to a survey database with the following structure:

Survey: "${survey.name}"
Survey ID: ${surveyId}

Questions in this survey:
${questionsList}

Tables available (filtered to this survey):
1. public.questions - Question details (question_id, question_text, type, options_json, sort_order)
2. public.responses - Response data (response_id, question_id, respondent_id, answer_text, answer_score, submitted_at, survey_id)
3. public.respondents - Respondent info (respondent_id, full_name, email, created_at)

IMPORTANT: All queries MUST include "WHERE survey_id = '${surveyId}'" to filter to this survey only.

Constraints:
- You MUST only generate SELECT queries
- Maximum response size: 100 rows
- Return response as JSON with this structure:
{
  "sql": "SELECT ... WHERE survey_id = '${surveyId}' LIMIT 100",
  "explanation": "What this query does in plain English"
}

If the user asks something you cannot query, respond with:
{
  "sql": null,
  "explanation": "Explanation of why this cannot be queried"
}`;

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
			// User asked something not queryable
			return json({
				sql: null,
				explanation: sqlData.explanation || 'Cannot generate query for this request',
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

		return json({
			sql: sqlData.sql,
			explanation: sqlData.explanation || '',
			columns: (queryResult.fields || []).map((f) => f.name),
			rows: queryResult.rows || [],
			rowCount: (queryResult.rows || []).length,
			queryError,
		});
	} catch (err) {
		console.error('Error in survey analytics chat:', err);
		return json({ error: err.message, code: 'SERVER_ERROR' }, 500);
	}
}
