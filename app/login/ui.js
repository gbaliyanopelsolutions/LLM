'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client.js';

export function LoginForm() {
	const [email, setEmail] = useState('');
	const [status, setStatus] = useState(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e) {
		e.preventDefault();
		setStatus(null);
		setLoading(true);

		try {
			const supabase = createClient();
			const { error } = await supabase.auth.signInWithOtp({
				email: email.trim(),
				options: {
					emailRedirectTo: `${window.location.origin}/auth/callback`,
				},
			});

			if (error) {
				setStatus({ type: 'error', message: error.message });
			} else {
				setStatus({
					type: 'ok',
					message: 'Check your email for the login link.',
				});
			}
		} catch (err) {
			setStatus({
				type: 'error',
				message: err instanceof Error ? err.message : 'Request failed',
			});
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<label htmlFor="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				autoComplete="email"
				required
				value={email}
				onChange={(ev) => setEmail(ev.target.value)}
				disabled={loading}
			/>
			<button type="submit" disabled={loading}>
				{loading ? 'Sending…' : 'Send magic link'}
			</button>
			{status ? (
				<p className={status.type === 'error' ? 'err' : 'muted'}>{status.message}</p>
			) : null}
		</form>
	);
}
