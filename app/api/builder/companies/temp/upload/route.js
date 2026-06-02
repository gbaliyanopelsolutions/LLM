export async function POST(request) {
	try {
		const formData = await request.formData();
		const file = formData.get('file');
		const uploadType = request.nextUrl.searchParams.get('uploadType') || 'logo';

		if (!file) {
			return Response.json(
				{ ok: false, error: 'No file uploaded' },
				{ status: 400 }
			);
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			return Response.json(
				{ ok: false, error: 'Only JPEG, PNG, and WebP images are allowed' },
				{ status: 400 }
			);
		}

		// Validate file size (5MB max)
		if (file.size > 5 * 1024 * 1024) {
			return Response.json(
				{ ok: false, error: 'File size must be less than 5MB' },
				{ status: 400 }
			);
		}

		// Read file as base64 for data URL
		const bytes = await file.arrayBuffer();
		const buffer = Buffer.from(bytes);
		const base64 = buffer.toString('base64');
		const dataUrl = `data:${file.type};base64,${base64}`;

		// Return data URL for display and storage
		// Note: On Vercel, files are not persisted. For production, use cloud storage (Supabase, AWS S3, etc.)
		return Response.json({
			ok: true,
			url: dataUrl,
		});
	} catch (error) {
		console.error('Upload error:', error);
		return Response.json(
			{ ok: false, error: error instanceof Error ? error.message : 'Upload failed' },
			{ status: 500 }
		);
	}
}
