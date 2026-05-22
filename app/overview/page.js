import Link from 'next/link';

import { SignOutButton } from '@/components/SignOutButton.js';
import { isExpectedGuestAuthError } from '@/lib/supabase/authUi.js';
import { createClient } from '@/lib/supabase/server.js';

export const metadata = {
	title: 'Overview — only_LLm',
};

export default async function OverviewPage() {
	let userEmail = null;
	let authError = null;

	try {
		const supabase = await createClient();
		const { data, error } = await supabase.auth.getUser();
		if (error && !isExpectedGuestAuthError(error)) {
			authError = error.message;
		} else if (data.user) {
			userEmail = data.user.email;
		}
	} catch (e) {
		authError = e instanceof Error ? e.message : 'Auth unavailable';
	}

	return (
		<main>
			<h1>only_LLm</h1>
			<p className="muted">
				Next.js (App Router) + Supabase. Form generator:{' '}
				<Link href="/index.html">/index.html</Link>
				{' · '}
				<Link href="/login">Login</Link>
			</p>

			<div className="card">
				<h2>Session</h2>
				{userEmail ? (
					<p>
						Signed in as <strong>{userEmail}</strong>
						<br />
						<SignOutButton />
					</p>
				) : (
					<p className="muted">Not signed in.</p>
				)}
				{authError ? <p className="err">{authError}</p> : null}
			</div>

			<div className="card">
				<h2>API examples</h2>
				<ul>
					<li>
						<Link href="/api/supabase/example">GET /api/supabase/example</Link> — list rows
					</li>
					<li>
						<code>POST /api/supabase/example</code> with JSON{' '}
						<code>{`{ "title": "Hello" }`}</code> — insert row
					</li>
					<li>
						<Link href="/api/health">GET /api/health</Link> — env check (Anthropic / Supabase flags)
					</li>
				</ul>
			</div>

			<div className="card">
				<h2>PostgreSQL (pg pool)</h2>
				<p className="muted">
					Direct DB via <code>pg</code>. Apply <code>sql/users_schema.sql</code> and{' '}
					<code>sql/survey_tables.sql</code> in Supabase SQL Editor (or psql).
				</p>
				<ul>
					<li>
						<Link href="/api/pg">GET /api/pg</Link> — manifest
					</li>
					<li>
						<Link href="/api/pg/health">GET /api/pg/health</Link> — process health
					</li>
					<li>
						<Link href="/api/pg/db-test">GET /api/pg/db-test</Link> — <code>SELECT 1</code> + DB time
					</li>
					<li>
						<Link href="/api/pg/users">GET /api/pg/users</Link> — list users
					</li>
					<li>
						<code>POST /api/pg/users</code> — <code>{`{ "email": "...", "full_name": "..." }`}</code>
					</li>
				</ul>
			</div>
		</main>
	);
}
