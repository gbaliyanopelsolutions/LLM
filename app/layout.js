import './globals.css';

export const metadata = {
	title: 'only_LLm',
	description: 'LLM tools with Supabase',
};

export const viewport = {
	width: 'device-width',
	initialScale: 1,
	viewportFit: 'cover',
};

export default function RootLayout({ children }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
