import Link from 'next/link';

import { LoginForm } from './ui.js';

export const metadata = {
	title: 'Login',
};

export default async function LoginPage({ searchParams }) {
	const params = await searchParams;
	const urlError = typeof params.error === 'string' ? decodeURIComponent(params.error) : null;

	return (
		<main>
			<h1>Sign in</h1>
			<p className="muted">
				Magic link via Supabase Auth. Configure email in the Supabase dashboard (Auth → Providers →
				Email).
			</p>
			{urlError ? <p className="err">{urlError}</p> : null}
			<div className="card">
				<LoginForm />
			</div>
			<p className="muted">
				<Link href="/overview">Developer overview</Link>
			</p>
		</main>
	);
}
