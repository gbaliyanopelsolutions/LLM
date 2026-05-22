// next.config.mjs
// NOTE: dotenv is NOT called here. On Vercel, environment variables are injected
// automatically. For local development, set them in .env.local or connection.env
// (the lib/loadEnv.js helper loads connection.env for the Express server only).

/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	// pg uses native bindings that must stay server-side
	serverExternalPackages: ['pg'],
	// Silence "Critical dependency: the request of a dependency is an expression"
	// coming from pg's optional native pg-native bindings
	webpack(config) {
		config.resolve.alias['pg-native'] = false;
		return config;
	},
	async rewrites() {
		return [
			// Allow /generate as a short alias for /api/generate
			{ source: '/generate', destination: '/api/generate' },
		];
	},
	// Security headers applied to every route
	async headers() {
		return [
			{
				source: '/(.*)',
				headers: [
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'X-Frame-Options', value: 'DENY' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
				],
			},
		];
	},
};

export default nextConfig;
