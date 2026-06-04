'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '@/app/components/Sidebar';
import {
	BarChart, Bar, LineChart, Line,
	XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
	Download, ChevronDown, Send, Sparkles, AlertCircle, Loader, RotateCcw,
	TrendingUp, Users, CheckCircle, ZapOff,
} from 'lucide-react';
import s from './page.module.css';

const PALETTE = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'];

const STAT_DEFS = [
	{ key: 'total_responses', label: 'Total Responses', Icon: Users },
	{ key: 'completion_rate', label: 'Completion Rate', Icon: CheckCircle, format: (v) => `${(v * 100).toFixed(1)}%` },
	{ key: 'abandonment_rate', label: 'Abandonment Rate', Icon: ZapOff, format: (v) => `${(v * 100).toFixed(1)}%` },
	{ key: 'avg_time_seconds', label: 'Avg Time', Icon: TrendingUp, format: (v) => `${v}s` },
];

export default function SurveyAnalyticsPage() {
	const params = useParams();
	const surveyId = params?.surveyId;

	const [surveys, setSurveys] = useState([]);
	const [selectedSurvey, setSelectedSurvey] = useState(null);
	const [analytics, setAnalytics] = useState(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const [chatMessages, setChatMessages] = useState([]);
	const [chatInput, setChatInput] = useState('');
	const [chatLoading, setChatLoading] = useState(false);
	const [showDropdown, setShowDropdown] = useState(false);
	const chatEndRef = useRef(null);

	// Load surveys list
	useEffect(() => {
		const loadSurveys = async () => {
			try {
				const res = await fetch('/api/builder/surveys?pageSize=100');
				const data = await res.json();
				if (data.ok) {
					setSurveys(data.surveys || []);
					// If surveyId in URL, select it
					if (surveyId && data.surveys) {
						const survey = data.surveys.find((s) => s.survey_id === surveyId);
						if (survey) {
							setSelectedSurvey(survey);
						}
					}
				}
			} catch (err) {
				console.error('Error loading surveys:', err);
			}
		};
		loadSurveys();
	}, [surveyId]);

	// Load analytics when survey selected
	useEffect(() => {
		if (!selectedSurvey) return;

		const loadAnalytics = async () => {
			setLoading(true);
			setError('');
			setChatMessages([]);
			try {
				const res = await fetch(`/api/builder/surveys/${selectedSurvey.survey_id}/analytics`);
				const data = await res.json();
				if (data.ok) {
					setAnalytics(data.analytics);
				} else {
					setError(data.error || 'Failed to load analytics');
				}
			} catch (err) {
				setError(err.message || 'Error loading analytics');
			} finally {
				setLoading(false);
			}
		};
		loadAnalytics();
	}, [selectedSurvey]);

	// Scroll to bottom of chat
	useEffect(() => {
		if (chatEndRef.current) {
			chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [chatMessages]);

	const handleAIChat = async (e) => {
		e.preventDefault();
		if (!chatInput.trim() || !selectedSurvey) return;

		const userMessage = chatInput;
		setChatInput('');
		setChatMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
		setChatLoading(true);

		try {
			const res = await fetch(`/api/builder/surveys/${selectedSurvey.survey_id}/analytics/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: userMessage }),
			});

			const data = await res.json();

			let responseText = '';
			if (data.sql && data.rowCount > 0) {
				responseText = `${data.explanation}\n\nResults: ${data.rowCount} row(s)\n`;
				if (data.rows.length > 0) {
					responseText += `\nData:\n${JSON.stringify(data.rows, null, 2)}`;
				}
			} else if (data.sql === null) {
				responseText = data.explanation || 'Unable to generate query for this request.';
			} else if (data.queryError) {
				responseText = `Query generated but encountered an error: ${data.queryError}`;
			} else {
				responseText = 'No data found for this query.';
			}

			setChatMessages((prev) => [...prev, { role: 'assistant', content: responseText }]);
		} catch (err) {
			setChatMessages((prev) => [
				...prev,
				{ role: 'assistant', content: `Error: ${err.message}` },
			]);
		} finally {
			setChatLoading(false);
		}
	};

	const handleExport = async (format) => {
		if (!selectedSurvey) return;

		try {
			const res = await fetch(`/api/builder/surveys/${selectedSurvey.survey_id}/analytics/export`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ format }),
			});

			if (format === 'csv') {
				const csv = await res.text();
				const blob = new Blob([csv], { type: 'text/csv' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `survey-responses-${selectedSurvey.survey_id}.csv`;
				a.click();
				URL.revokeObjectURL(url);
			} else if (format === 'ai-summary') {
				const data = await res.json();
				// Copy summary to clipboard or download
				setChatMessages((prev) => [
					...prev,
					{ role: 'assistant', content: `**AI Summary**\n\n${data.summary}` },
				]);
			}
		} catch (err) {
			console.error(`Error exporting ${format}:`, err);
		}
	};

	if (!selectedSurvey) {
		return (
			<div className={s.page}>
				<div className={s.container}>
					<div className={s.emptyState}>
						<AlertCircle size={48} style={{ opacity: 0.5 }} />
						<h2>Select a Survey</h2>
						<p>Choose a survey from the dropdown above to view analytics</p>
					</div>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className={s.page}>
				<div className={s.container}>
					<div className={s.emptyState}>
						<Loader size={48} style={{ opacity: 0.5, animation: 'spin 1s linear infinite' }} />
						<h2>Loading Analytics...</h2>
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
						<AlertCircle size={48} style={{ opacity: 0.5, color: '#ef4444' }} />
						<h2>Error</h2>
						<p>{error}</p>
					</div>
				</div>
			</div>
		);
	}

	if (!analytics || analytics.overview.total_responses === 0) {
		return (
			<div className={s.page}>
				<div className={s.container}>
					<div className={s.emptyState}>
						<AlertCircle size={48} style={{ opacity: 0.5 }} />
						<h2>No Responses Yet</h2>
						<p>This survey hasn't received any responses yet. Check back later!</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={s.page}>
			{/* Sidebar Navigation */}
			<Sidebar />

			{/* Main Content */}
			<div className={s.mainContent}>
				{/* Header with survey selector */}
				<div className={s.header}>
				<div className={s.headerContent}>
					<h1>Survey Analytics</h1>
					<div className={s.surveySelector}>
						<button
							className={s.selectorBtn}
							onClick={() => setShowDropdown(!showDropdown)}
						>
							<span>{selectedSurvey?.name}</span>
							<ChevronDown size={18} />
						</button>
						{showDropdown && (
							<div className={s.dropdown}>
								{surveys.map((survey) => (
									<button
										key={survey.survey_id}
										className={s.dropdownItem}
										onClick={() => {
											setSelectedSurvey(survey);
											setShowDropdown(false);
										}}
									>
										{survey.name}
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className={s.container}>
				{/* Overview cards */}
				<div className={s.statsGrid}>
					{STAT_DEFS.map((stat, i) => {
						const Icon = stat.Icon;
						const value = analytics.overview[stat.key];
						const formatted = stat.format ? stat.format(value) : value;
						return (
							<motion.div
								key={stat.key}
								className={s.statCard}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: i * 0.1 }}
							>
								<div className={s.statIcon}>
									<Icon size={24} />
								</div>
								<div>
									<div className={s.statValue}>{formatted}</div>
									<div className={s.statLabel}>{stat.label}</div>
								</div>
							</motion.div>
						);
					})}
				</div>

				{/* Charts */}
				<div className={s.chartsGrid}>
					{analytics.responses_over_time && analytics.responses_over_time.length > 0 && (
						<motion.div
							className={s.chartCard}
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
						>
							<h3>Responses Over Time</h3>
							<ResponsiveContainer width="100%" height={250}>
								<LineChart data={analytics.responses_over_time}>
									<CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
									<XAxis dataKey="date" stroke="#9ca3af" />
									<YAxis stroke="#9ca3af" />
									<Tooltip />
									<Line type="monotone" dataKey="count" stroke={PALETTE[0]} strokeWidth={2} />
								</LineChart>
							</ResponsiveContainer>
						</motion.div>
					)}
				</div>

				{/* Questions breakdown */}
				{analytics.questions && analytics.questions.length > 0 && (
					<motion.div
						className={s.questionsSection}
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
					>
						<h3>Questions Breakdown</h3>
						<div className={s.questionsList}>
							{analytics.questions.map((q, i) => (
								<div key={q.question_id} className={s.questionItem}>
									<div className={s.questionHeader}>
										<span className={s.questionNumber}>{i + 1}.</span>
										<span className={s.questionText}>{q.question_text}</span>
										<span className={s.questionStats}>
											{q.response_count} answered, {q.skip_count} skipped
										</span>
									</div>
									{q.options && q.options.length > 0 && (
										<div className={s.optionsList}>
											{q.options.map((opt, oi) => (
												<div key={oi} className={s.optionItem}>
													<span>{opt.option}</span>
													<span className={s.optionCount}>
														{opt.count} ({opt.percentage}%)
													</span>
												</div>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					</motion.div>
				)}
			</div>

			{/* AI Chat Sidebar */}
			<div className={s.sidebar}>
				<div className={s.sidebarHeader}>
					<h3>
						<Sparkles size={18} /> AI Insights
					</h3>
				</div>

				<div className={s.chatMessages}>
					<AnimatePresence>
						{chatMessages.length === 0 ? (
							<div className={s.chatPlaceholder}>
								<p>Ask questions about your survey responses</p>
								<p className={s.examples}>Examples:</p>
								<ul>
									<li>"What's the completion rate?"</li>
									<li>"Which question was skipped most?"</li>
									<li>"Summarize the responses"</li>
								</ul>
							</div>
						) : (
							chatMessages.map((msg, i) => (
								<motion.div
									key={i}
									className={`${s.message} ${s[msg.role]}`}
									initial={{ opacity: 0, y: 10 }}
									animate={{ opacity: 1, y: 0 }}
								>
									<div className={s.messageContent}>{msg.content}</div>
								</motion.div>
							))
						)}
					</AnimatePresence>
					<div ref={chatEndRef} />
				</div>

				<form onSubmit={handleAIChat} className={s.chatForm}>
					<input
						type="text"
						placeholder="Ask a question..."
						value={chatInput}
						onChange={(e) => setChatInput(e.target.value)}
						disabled={chatLoading}
					/>
					<button type="submit" disabled={chatLoading || !chatInput.trim()}>
						{chatLoading ? <Loader size={18} /> : <Send size={18} />}
					</button>
				</form>
			</div>

			{/* Export buttons */}
			<div className={s.exportButtons}>
				<button onClick={() => handleExport('csv')} className={s.btn}>
					<Download size={18} /> CSV
				</button>
				<button onClick={() => handleExport('ai-summary')} className={s.btn}>
					<Sparkles size={18} /> AI Summary
				</button>
				<button onClick={() => window.location.reload()} className={s.btn}>
					<RotateCcw size={18} /> Refresh
				</button>
			</div>
		</div>
	);
}
