-- =============================================================================
-- Survey schema: example queries (PostgREST / SQL) + Supabase JS patterns
-- Companion: supabase/migrations/20260512120000_survey_schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PostgREST-style join (single round trip via foreign keys)
-- Equivalent to: GET /rest/v1/responses?select=*,questions(*),respondents(*),surveys(*)
-- Filter by survey; order by submission time.
-- -----------------------------------------------------------------------------
/*
https://YOUR_PROJECT.supabase.co/rest/v1/responses
  ?survey_id=eq.cccccccc-cccc-cccc-cccc-cccccccccccc
  &select=response_id,answer_text,answer_score,submitted_at,
           questions(question_id,question_text,type,sort_order,dimension_tag,options_json),
           respondents(respondent_id,full_name,email,department,job_title),
           surveys(survey_id,name,status,category,company_id)
  &order=submitted_at.desc
*/

-- Same shape in SQL (dashboard export / BI tools)
select
	r.response_id,
	r.submitted_at,
	r.answer_text,
	r.answer_score,
	q.question_id,
	q.question_text,
	q.type,
	q.sort_order,
	q.dimension_tag,
	q.options_json,
	resp.respondent_id,
	resp.full_name,
	resp.email,
	s.survey_id,
	s.name as survey_name,
	s.status as survey_status,
	c.name as company_name
from public.responses r
join public.questions q on q.question_id = r.question_id
join public.respondents resp on resp.respondent_id = r.respondent_id
join public.surveys s on s.survey_id = r.survey_id
join public.companies c on c.company_id = r.company_id
where r.survey_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
order by r.submitted_at desc;

-- -----------------------------------------------------------------------------
-- 2) Analytics: average score by dimension_tag (tenant + date filter)
-- -----------------------------------------------------------------------------
select
	c.company_id,
	c.name as company_name,
	q.dimension_tag,
	avg(r.answer_score::numeric) filter (where r.answer_score is not null) as avg_score,
	count(*) filter (where r.answer_score is not null) as scored_answers,
	count(distinct r.respondent_id) as distinct_respondents
from public.responses r
join public.surveys s on s.survey_id = r.survey_id
join public.companies c on c.company_id = r.company_id
join public.questions q on q.question_id = r.question_id
where r.submitted_at >= (now() - interval '90 days')
	and c.region = 'NA'
group by c.company_id, c.name, q.dimension_tag
order by c.name, q.dimension_tag;

-- -----------------------------------------------------------------------------
-- 3) Analytics: completion among respondents who submitted at least one answer
-- -----------------------------------------------------------------------------
with qcounts as (
	select survey_id, count(*)::integer as question_count
	from public.questions
	group by survey_id
),
answered as (
	select survey_id, respondent_id, count(*)::integer as answered_count
	from public.responses
	group by survey_id, respondent_id
)
select
	s.survey_id,
	s.name,
	qc.question_count,
	sum(case when a.answered_count >= qc.question_count then 1 else 0 end) as respondents_completed,
	sum(case when a.answered_count < qc.question_count then 1 else 0 end) as respondents_partial
from public.surveys s
join qcounts qc on qc.survey_id = s.survey_id
join answered a on a.survey_id = s.survey_id
group by s.survey_id, s.name, qc.question_count;

-- -----------------------------------------------------------------------------
-- 4) Supabase JS (@supabase/supabase-js) — fetch joined survey responses
-- Run in app code with the user's session (RLS applies). Replace URL and keys.
-- -----------------------------------------------------------------------------
/*
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
	process.env.NEXT_PUBLIC_SUPABASE_URL!,
	process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const surveyId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const { data, error } = await supabase
	.from('responses')
	.select(`
		response_id,
		submitted_at,
		answer_text,
		answer_score,
		questions (
			question_id,
			question_text,
			type,
			sort_order,
			dimension_tag,
			options_json
		),
		respondents (
			respondent_id,
			full_name,
			email,
			department,
			job_title
		),
		surveys (
			survey_id,
			name,
			status,
			category,
			company_id
		)
	`)
	.eq('survey_id', surveyId)
	.order('submitted_at', { ascending: false });

if (error) throw error;
console.table(data);
*/

-- -----------------------------------------------------------------------------
-- 5) RPC-free aggregation in JS (small datasets): fetch scores then reduce
-- -----------------------------------------------------------------------------
/*
const { data, error } = await supabase
	.from('responses')
	.select('answer_score, question_id, questions(dimension_tag)')
	.not('answer_score', 'is', null)
	.gte('submitted_at', new Date(Date.now() - 90 * 86400000).toISOString());

if (error) throw error;

const byTag = new Map<string, { sum: number; n: number }>();
for (const row of data ?? []) {
	const tag = row.questions?.dimension_tag ?? 'untagged';
	const prev = byTag.get(tag) ?? { sum: 0, n: 0 };
	const v = row.answer_score as number;
	byTag.set(tag, { sum: prev.sum + v, n: prev.n + 1 });
}
const averages = [...byTag.entries()].map(([tag, { sum, n }]) => ({
	tag,
	avg: n ? sum / n : null,
}));
*/
