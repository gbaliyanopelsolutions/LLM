import { redirect } from 'next/navigation';

/** Root URL shows the login page first. Dev hub: /overview */
export default function HomePage() {
	redirect('/login');
}
