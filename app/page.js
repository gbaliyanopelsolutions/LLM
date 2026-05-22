import { redirect } from 'next/navigation';

/** Root URL opens the LLM Survey Builder. */
export default function HomePage() {
	redirect('/index.html');
}
