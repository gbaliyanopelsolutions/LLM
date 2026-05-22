import { NextResponse } from 'next/server';

import { getSupabaseServerEnv } from '@/lib/supabase/env.js';

/**
 * Lightweight health check for deployment and env wiring.
 */
export async function GET() {
	const { url, anonKey } = getSupabaseServerEnv();

	return NextResponse.json({
		ok: true,
		hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
		anthropicModel: process.env.ANTHROPIC_MODEL || null,
		hasSupabaseUrl: Boolean(url),
		hasSupabaseAnonKey: Boolean(anonKey),
	});
}
