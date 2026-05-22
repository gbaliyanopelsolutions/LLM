import { redirect } from 'next/navigation';

/** Root URL opens the survey demo form. */
export default function HomePage() {
	redirect('/survey-demo/');
}
