import { NextResponse } from 'next/server';

import { getSupabasePublicConfig } from '@/lib/supabase/env.js';

/**
 * Same contract as Express `GET /api/public/supabase-config` so `public/index.html` works under `next dev`.
 */
export async function GET() {
	return NextResponse.json(getSupabasePublicConfig());
}
