'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BarChart2, Plus, Eye, Trash2, Loader } from 'lucide-react';
import s from './page.module.css';

export default function SurveysPage() {
	const [surveys, setSurveys] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [page, setPage] = useState(1);
	const [pagination, setPagination] = useState({});

	const ITEMS_PER_PAGE = 20;

	useEffect(() => {
		const loadSurveys = async () => {
			setLoading(true);
			try {
				const res = await fetch(`/api/builder/surveys?page=${page}&pageSize=${ITEMS_PER_PAGE}`);
				const data = await res.json();
				if (data.ok) {
					setSurveys(data.surveys || []);
					setPagination(data.pagination || {});
				} else {
					setError(data.error || 'Failed to load surveys');
				}
			} catch (err) {
				setError(err.message || 'Error loading surveys');
			} finally {
				setLoading(false);
			}
		};
		loadSurveys();
	}, [page]);

	const handleDelete = async (surveyId) => {
		if (!confirm('Are you sure you want to delete this survey?')) return;

		try {
			const res = await fetch(`/api/builder/surveys/${surveyId}`, {
				method: 'DELETE',
			});
			if (res.ok) {
				setSurveys((prev) => prev.filter((s) => s.survey_id !== surveyId));
			}
		} catch (err) {
			console.error('Error deleting survey:', err);
		}
	};

	if (loading) {
		return (
			<div className={s.page}>
				<div className={s.container}>
					<div className={s.emptyState}>
						<Loader size={48} />
						<h2>Loading Surveys...</h2>
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className={s.page}>
				<div className={s.container}>
					<div className={s.emptyState}>
						<h2>Error</h2>
						<p>{error}</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={s.page}>
			{/* Header */}
			<div className={s.header}>
				<div className={s.headerContent}>
					<div>
						<h1>My Surveys</h1>
						<p>View and manage your survey responses and analytics</p>
					</div>
					<Link href="/index" className={s.newBtn}>
						<Plus size={18} /> New Survey
					</Link>
				</div>
			</div>

			{/* Content */}
			<div className={s.container}>
				{surveys.length === 0 ? (
					<div className={s.emptyState}>
						<BarChart2 size={48} style={{ opacity: 0.5 }} />
						<h2>No Surveys Yet</h2>
						<p>Create your first survey to get started</p>
						<Link href="/index" className={s.ctaBtn}>
							Create Survey
						</Link>
					</div>
				) : (
					<>
						{/* Surveys Grid */}
						<div className={s.grid}>
							{surveys.map((survey, i) => (
								<motion.div
									key={survey.survey_id}
									className={s.card}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: i * 0.1 }}
								>
									<div className={s.cardHeader}>
										<h3>{survey.name}</h3>
										<span className={`${s.statusBadge} ${s[survey.status]}`}>
											{survey.status}
										</span>
									</div>

									{survey.description && (
										<p className={s.cardDesc}>{survey.description}</p>
									)}

									<div className={s.cardStats}>
										<span>
											<strong>{survey.total_submissions || 0}</strong> responses
										</span>
										<span>•</span>
										<span>
											Created{' '}
											{new Date(survey.created_at).toLocaleDateString()}
										</span>
									</div>

									<div className={s.cardActions}>
										<Link
											href={`/surveys/${survey.survey_id}/analytics`}
											className={s.actionBtn}
										>
											<Eye size={16} /> Analytics
										</Link>
										<button
											className={`${s.actionBtn} ${s.danger}`}
											onClick={() => handleDelete(survey.survey_id)}
										>
											<Trash2 size={16} /> Delete
										</button>
									</div>
								</motion.div>
							))}
						</div>

						{/* Pagination */}
						{pagination.totalPages && pagination.totalPages > 1 && (
							<div className={s.pagination}>
								<button
									onClick={() => setPage((p) => Math.max(1, p - 1))}
									disabled={page === 1}
									className={s.paginationBtn}
								>
									Previous
								</button>
								<span>
									Page {page} of {pagination.totalPages}
								</span>
								<button
									onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
									disabled={page === pagination.totalPages}
									className={s.paginationBtn}
								>
									Next
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
