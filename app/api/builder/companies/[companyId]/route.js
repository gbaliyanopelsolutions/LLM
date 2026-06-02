import { getPool, parsePgError } from '../../../../db.js';

export async function GET(request, { params }) {
	try {
		const companyId = params.companyId;

		if (!companyId || typeof companyId !== 'string') {
			return Response.json(
				{ ok: false, error: 'Company ID is required' },
				{ status: 400 }
			);
		}

		const pool = getPool();
		const { rows } = await pool.query(
			`SELECT company_id, name, industry, region, tier, metadata, created_at, updated_at
			 FROM public.companies
			 WHERE company_id = $1`,
			[companyId]
		);

		if (rows.length === 0) {
			return Response.json(
				{ ok: false, error: 'Company not found' },
				{ status: 404 }
			);
		}

		return Response.json({
			ok: true,
			company: rows[0],
		});
	} catch (error) {
		console.error('Error fetching company:', error);
		const { message } = parsePgError(error);
		return Response.json(
			{ ok: false, error: message || 'Failed to fetch company' },
			{ status: 500 }
		);
	}
}

export async function PATCH(request, { params }) {
	try {
		const companyId = params.companyId;

		if (!companyId || typeof companyId !== 'string') {
			return Response.json(
				{ ok: false, error: 'Company ID is required' },
				{ status: 400 }
			);
		}

		const body = await request.json();
		const name = typeof body.name === 'string' ? body.name.trim() : null;
		const industry = typeof body.industry === 'string' ? body.industry.trim() : null;
		const region = typeof body.region === 'string' ? body.region.trim() : null;
		const tierRaw = typeof body.tier === 'string' ? body.tier.trim() : null;
		const description = typeof body.description === 'string' ? body.description.trim() : null;
		const allowedTiers = new Set(['Tier 1', 'Tier 2', 'Tier 3']);

		if (name !== null && !name) {
			return Response.json(
				{ ok: false, error: 'Company name cannot be empty' },
				{ status: 400 }
			);
		}

		if (tierRaw !== null && !allowedTiers.has(tierRaw)) {
			return Response.json(
				{ ok: false, error: 'Tier must be Tier 1, Tier 2, or Tier 3' },
				{ status: 400 }
			);
		}

		const pool = getPool();
		const metadataObj = body && typeof body.metadata === 'object' ? body.metadata : undefined;

		let query = `UPDATE public.companies SET updated_at = NOW()`;
		const params = [];
		let paramNum = 1;

		if (name !== null) {
			query += `, name = $${paramNum}`;
			params.push(name);
			paramNum += 1;
		}
		if (industry !== null) {
			query += `, industry = $${paramNum}`;
			params.push(industry);
			paramNum += 1;
		}
		if (region !== null) {
			query += `, region = $${paramNum}`;
			params.push(region);
			paramNum += 1;
		}
		if (tierRaw !== null) {
			query += `, tier = $${paramNum}`;
			params.push(tierRaw);
			paramNum += 1;
		}
		if (metadataObj !== undefined) {
			query += `, metadata = $${paramNum}::jsonb`;
			params.push(JSON.stringify(metadataObj));
			paramNum += 1;
		}

		query += ` WHERE company_id = $${paramNum} RETURNING company_id, name, industry, region, tier, metadata, created_at, updated_at`;
		params.push(companyId);

		const { rows } = await pool.query(query, params);

		if (rows.length === 0) {
			return Response.json(
				{ ok: false, error: 'Company not found' },
				{ status: 404 }
			);
		}

		return Response.json({
			ok: true,
			company: rows[0],
		});
	} catch (error) {
		console.error('Error updating company:', error);
		const { message } = parsePgError(error);
		return Response.json(
			{ ok: false, error: message || 'Failed to update company' },
			{ status: 500 }
		);
	}
}

export async function DELETE(request, { params }) {
	try {
		const companyId = params.companyId;

		if (!companyId || typeof companyId !== 'string') {
			return Response.json(
				{ ok: false, error: 'Company ID is required' },
				{ status: 400 }
			);
		}

		const pool = getPool();

		// Check if company has surveys
		const { rows: surveyCheck } = await pool.query(
			`SELECT COUNT(*) as count FROM public.surveys WHERE company_id = $1`,
			[companyId]
		);

		if (surveyCheck[0].count > 0) {
			return Response.json(
				{
					ok: false,
					error: 'Cannot delete company with existing surveys. Delete surveys first.',
				},
				{ status: 409 }
			);
		}

		const { rows } = await pool.query(
			`DELETE FROM public.companies WHERE company_id = $1 RETURNING company_id`,
			[companyId]
		);

		if (rows.length === 0) {
			return Response.json(
				{ ok: false, error: 'Company not found' },
				{ status: 404 }
			);
		}

		return Response.json({
			ok: true,
			message: 'Company deleted',
		});
	} catch (error) {
		console.error('Error deleting company:', error);
		const { message } = parsePgError(error);
		return Response.json(
			{ ok: false, error: message || 'Failed to delete company' },
			{ status: 500 }
		);
	}
}
