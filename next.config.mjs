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
		return {
			// beforeFiles runs BEFORE Next.js page routing — critical for /index
			// which Next.js would otherwise normalise to "/" and redirect to /dashboard
			beforeFiles: [
				{ source: '/index',        destination: '/index.html' },
				{ source: '/dashboard',    destination: '/dashboard.html' },
				{ source: '/survey',       destination: '/survey.html' },
				{ source: '/forms',        destination: '/forms.html' },
				{ source: '/add-company',  destination: '/add-company.html' },
				{ source: '/login',        destination: '/login.html' },
				{ source: '/register',     destination: '/register.html' },
				{ source: '/form',         destination: '/form.html' },
			],
			afterFiles: [
				// API alias
				{ source: '/generate', destination: '/api/generate' },
			],
		};
	},
	async redirects() {
		return [
			// Legacy .html links → clean URL (permanent)
			{ source: '/dashboard.html',    destination: '/dashboard',    permanent: true },
			{ source: '/index.html',        destination: '/index',        permanent: true },
			{ source: '/survey.html',       destination: '/survey',       permanent: true },
			{ source: '/forms.html',        destination: '/forms',        permanent: true },
			{ source: '/add-company.html',  destination: '/add-company',  permanent: true },
			{ source: '/login.html',        destination: '/login',        permanent: true },
			{ source: '/register.html',     destination: '/register',     permanent: true },
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
