import { createRequire } from 'module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const { getPool, isDatabaseConfigured } = require('../../../../db.js');

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

/** Run a query and return rows, or [] on failure. */
async function safeQuery(pool, sql, params = []) {
	try {
		const { rows } = await pool.query(sql, params);
		return rows;
	} catch {
		return [];
	}
}

export async function GET() {
	if (!isDatabaseConfigured()) {
		return json({ error: 'Database not configured' }, 503);
	}

	const pool = getPool();

	const [counts, surveysPerCo, responsesPerSurvey, questionsByType, monthlyTrend] =
		await Promise.all([
			safeQuery(
				pool,
				`SELECT
          (SELECT COUNT(*)::int FROM public.companies)            AS total_companies,
          (SELECT COUNT(*)::int FROM public.surveys)              AS total_surveys,
          (SELECT COUNT(*)::int FROM public.questions)            AS total_questions,
          (SELECT COUNT(*)::int FROM public.responses)            AS total_responses,
          (SELECT COUNT(*)::int FROM public.respondents)          AS total_respondents,
          (SELECT COUNT(*)::int FROM public.surveys
            WHERE status = 'active')                    AS active_surveys`
			),
			safeQuery(
				pool,
				`SELECT c.name, COUNT(s.survey_id)::int AS count
         FROM companies c
         LEFT JOIN surveys s ON c.company_id = s.company_id
         GROUP BY c.company_id, c.name
         ORDER BY count DESC
         LIMIT 10`
			),
			safeQuery(
				pool,
				`SELECT s.name, COUNT(*)::int AS count
         FROM surveys s
         LEFT JOIN responses r ON s.survey_id = r.survey_id
         GROUP BY s.survey_id, s.name
         ORDER BY count DESC
         LIMIT 10`
			),
			safeQuery(
				pool,
				`SELECT COALESCE(type, 'unknown') AS type, COUNT(*)::int AS count
         FROM questions
         GROUP BY type
         ORDER BY count DESC`
			),
			safeQuery(
				pool,
				`SELECT
            TO_CHAR(DATE_TRUNC('month', created_at), 'Mon ''YY') AS month,
            COUNT(*)::int AS count
          FROM responses
          WHERE created_at >= NOW() - INTERVAL '6 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY DATE_TRUNC('month', created_at)`
			),
		]);

	return json({
		counts: counts[0] ?? {
			total_companies: 0,
			total_surveys: 0,
			total_questions: 0,
			total_responses: 0,
			total_respondents: 0,
			active_surveys: 0,
		},
		surveysPerCompany: surveysPerCo,
		responsesPerSurvey,
		questionsByType,
		monthlyTrend,
	});
}
