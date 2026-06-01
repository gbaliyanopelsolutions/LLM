'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
	BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
	XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
	LayoutDashboard, WrenchIcon, FileText, Building2, BarChart2,
	Users, HelpCircle, MessageSquare, CheckCircle, TrendingUp,
	Search, Download, ChevronLeft, ChevronRight, ArrowUpDown,
	Send, Sparkles, Database, Copy, Check, AlertCircle,
	RefreshCw, ChevronUp, ChevronDown,
} from 'lucide-react';
import s from './page.module.css';

/* ─────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────── */
const PALETTE = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#84cc16'];

const CARD_COLORS = [
	{ accent: 'linear-gradient(90deg,#6366f1,#8b5cf6)', iconBg: 'rgba(99,102,241,0.1)',  iconColor: '#6366f1' },
	{ accent: 'linear-gradient(90deg,#06b6d4,#0ea5e9)', iconBg: 'rgba(6,182,212,0.1)',   iconColor: '#06b6d4' },
	{ accent: 'linear-gradient(90deg,#10b981,#059669)', iconBg: 'rgba(16,185,129,0.1)',  iconColor: '#10b981' },
	{ accent: 'linear-gradient(90deg,#f59e0b,#d97706)', iconBg: 'rgba(245,158,11,0.1)',  iconColor: '#f59e0b' },
	{ accent: 'linear-gradient(90deg,#ec4899,#db2777)', iconBg: 'rgba(236,72,153,0.1)',  iconColor: '#ec4899' },
	{ accent: 'linear-gradient(90deg,#22c55e,#16a34a)', iconBg: 'rgba(34,197,94,0.1)',   iconColor: '#22c55e' },
];

const STAT_DEFS = [
	{ key: 'total_companies',   label: 'Companies',       Icon: Building2    },
	{ key: 'total_surveys',     label: 'Total Surveys',   Icon: FileText     },
	{ key: 'total_questions',   label: 'Questions',       Icon: HelpCircle   },
	{ key: 'total_responses',   label: 'Responses',       Icon: MessageSquare},
	{ key: 'total_respondents', label: 'Respondents',     Icon: Users        },
	{ key: 'active_surveys',    label: 'Active Surveys',  Icon: CheckCircle  },
];

const TABLES = ['companies','surveys','questions','responses','respondents'];

const SUGGESTED = [
	'Which company has the most surveys?',
	'Total questions in each survey',
	'Average responses per survey',
	'Latest survey submissions',
	'Questions grouped by type',
	'Top active companies by surveys',
	'Surveys created this month',
	'Total responses per company',
];

const NAV = [
	{ href: '/dashboard', label: 'Dashboard',    Icon: LayoutDashboard, group: 'Overview' },
	{ href: '/index',     label: 'Form Builder', Icon: WrenchIcon,      group: 'Build', badge: 'AI' },
	{ href: '/forms',     label: 'Forms',        Icon: FileText,        group: 'Manage' },
	{ href: '/survey',    label: 'My Surveys',   Icon: FileText,        group: 'Manage' },
	{ href: '/add-company', label: 'Companies',  Icon: Building2,       group: 'Manage' },
	{ href: '/analytics', label: 'Analytics',    Icon: BarChart2,       group: 'Manage', badge: 'New' },
];

/* ─────────────────────────────────────────────────
   Sidebar
───────────────────────────────────────────────── */
function Sidebar() {
	const groups = [...new Set(NAV.map((n) => n.group))];
	return (
		<aside className={s.sidebar}>
			<a className={s.brand} href="/dashboard">
				<div className={s.brandIcon}>
					<BarChart2 size={18} />
				</div>
				<div>
					<span className={s.brandName}>Survey Form Builder</span>
					<span className={s.brandSub}>AI Platform</span>
				</div>
			</a>

			{groups.map((grp) => (
				<div key={grp} className={s.navSection}>
					<span className={s.navLabel}>{grp}</span>
					{NAV.filter((n) => n.group === grp).map(({ href, label, Icon, badge }) => {
						const isActive = typeof window !== 'undefined' && window.location.pathname === href;
						return (
							<a
								key={href}
								href={href}
								className={`${s.navItem} ${isActive ? s.active : ''}`}
							>
								<Icon size={16} />
								{label}
								{badge && <span className={s.navBadge}>{badge}</span>}
							</a>
						);
					})}
				</div>
			))}

			<div className={s.sidebarFooter}>
				<div className={s.userPill}>
					<div className={s.userAvatar}>SFB</div>
					<span className={s.userName}>Survey Form Builder</span>
				</div>
			</div>
		</aside>
	);
}

/* ─────────────────────────────────────────────────
   Topbar
───────────────────────────────────────────────── */
function Topbar({ onRefresh }) {
	return (
		<div className={s.topbar}>
			<div className={s.topbarLeft}>
				<p className={s.topbarTitle}>Analytics Dashboard</p>
				<p className={s.topbarSub}>Database insights &amp; AI-powered query engine</p>
			</div>
			<div className={s.topbarRight}>
				<button className={s.topbarBtn} onClick={onRefresh} title="Refresh stats">
					<RefreshCw size={13} />
					Refresh
				</button>
				<a className={s.topbarBtn} href="/survey">
					<FileText size={13} />
					My Surveys
				</a>
			</div>
		</div>
	);
}

/* ─────────────────────────────────────────────────
   Skeleton helpers
───────────────────────────────────────────────── */
function Sk({ className }) {
	return <div className={`${s.skeleton} ${className}`} />;
}

/* ─────────────────────────────────────────────────
   Stats Section
───────────────────────────────────────────────── */
function StatsSection({ stats, loading }) {
	return (
		<section>
			<div className={s.sectionHeader}>
				<div>
					<h2 className={s.sectionTitle}>Overview</h2>
					<p className={s.sectionSub}>Live counts from your survey database</p>
				</div>
			</div>
			<div className={s.statsGrid}>
				{STAT_DEFS.map(({ key, label, Icon }, i) => {
					const c = CARD_COLORS[i % CARD_COLORS.length];
					return (
						<motion.div
							key={key}
							className={s.statCard}
							style={{ '--card-accent': c.accent, '--icon-bg': c.iconBg, '--icon-color': c.iconColor }}
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: i * 0.06, duration: 0.4, ease: [0.34, 1.1, 0.64, 1] }}
						>
							<div className={s.statIconWrap}>
								{loading ? <Sk className={s.skIcon} /> : <Icon size={18} />}
							</div>
							{loading ? (
								<>
									<Sk className={s.skVal} />
									<Sk className={s.skLbl} />
								</>
							) : (
								<>
									<div className={s.statValue}>
										{(stats?.counts?.[key] ?? 0).toLocaleString()}
									</div>
									<div className={s.statLabel}>{label}</div>
								</>
							)}
						</motion.div>
					);
				})}
			</div>
		</section>
	);
}

/* ─────────────────────────────────────────────────
   Custom Tooltip
───────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
	if (!active || !payload?.length) return null;
	return (
		<div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'0.6rem 0.85rem', boxShadow:'0 4px 16px rgba(0,0,0,0.08)', fontSize:'0.78rem' }}>
			<p style={{ margin:'0 0 0.25rem', fontWeight:700, color:'#111827' }}>{label}</p>
			{payload.map((p) => (
				<p key={p.name} style={{ margin:0, color: p.color ?? '#6366f1' }}>
					{p.name}: <strong>{(p.value ?? 0).toLocaleString()}</strong>
				</p>
			))}
		</div>
	);
}

/* ─────────────────────────────────────────────────
   Charts Section
───────────────────────────────────────────────── */
function ChartsSection({ stats, loading }) {
	if (loading) {
		return (
			<section>
				<div className={s.sectionHeader}>
					<div>
						<h2 className={s.sectionTitle}>Analytics Charts</h2>
						<p className={s.sectionSub}>Visual breakdown of your survey data</p>
					</div>
				</div>
				<div className={s.chartsGrid}>
					{[0,1,2,3].map((i) => (
						<div key={i} className={s.chartCard}>
							<Sk className={s.skLbl} />
							<div style={{ height: 240, marginTop: '1rem' }}><Sk className={s.skFull} /></div>
						</div>
					))}
				</div>
			</section>
		);
	}

	const truncate = (str, n = 14) => str?.length > n ? str.slice(0, n) + '…' : str;

	return (
		<section>
			<div className={s.sectionHeader}>
				<div>
					<h2 className={s.sectionTitle}>Analytics Charts</h2>
					<p className={s.sectionSub}>Visual breakdown of your survey data</p>
				</div>
			</div>
			<div className={s.chartsGrid}>

				{/* Surveys per Company */}
				<motion.div className={s.chartCard} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.1 }}>
					<p className={s.chartTitle}>Surveys per Company</p>
					<p className={s.chartSub}>Top companies by survey count</p>
					<div className={s.chartWrap} style={{ height: 240 }}>
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={stats?.surveysPerCompany ?? []} margin={{ top:4, right:8, left:-16, bottom:0 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
								<XAxis dataKey="name" tick={{ fontSize:10, fill:'#9ca3af' }} tickFormatter={(v) => truncate(v)} />
								<YAxis tick={{ fontSize:10, fill:'#9ca3af' }} allowDecimals={false} />
								<Tooltip content={<ChartTooltip />} />
								<Bar dataKey="count" name="Surveys" radius={[6,6,0,0]} fill="#6366f1" />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</motion.div>

				{/* Responses per Survey */}
				<motion.div className={s.chartCard} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.18 }}>
					<p className={s.chartTitle}>Responses per Survey</p>
					<p className={s.chartSub}>Top surveys by response count</p>
					<div className={s.chartWrap} style={{ height: 240 }}>
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={stats?.responsesPerSurvey ?? []} margin={{ top:4, right:8, left:-16, bottom:0 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
								<XAxis dataKey="name" tick={{ fontSize:10, fill:'#9ca3af' }} tickFormatter={(v) => truncate(v)} />
								<YAxis tick={{ fontSize:10, fill:'#9ca3af' }} allowDecimals={false} />
								<Tooltip content={<ChartTooltip />} />
								<Bar dataKey="count" name="Responses" radius={[6,6,0,0]} fill="#06b6d4" />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</motion.div>

				{/* Questions by Type */}
				<motion.div className={s.chartCard} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.26 }}>
					<p className={s.chartTitle}>Questions by Type</p>
					<p className={s.chartSub}>Distribution of question field types</p>
					<div className={s.chartWrap} style={{ height: 240 }}>
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie
									data={stats?.questionsByType ?? []}
									dataKey="count"
									nameKey="type"
									cx="50%"
									cy="50%"
									outerRadius={90}
									innerRadius={45}
									paddingAngle={3}
									label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}
									labelLine={{ stroke: '#e5e7eb', strokeWidth: 1 }}
								>
									{(stats?.questionsByType ?? []).map((_, i) => (
										<Cell key={i} fill={PALETTE[i % PALETTE.length]} />
									))}
								</Pie>
								<Tooltip formatter={(v, n) => [v, n]} />
							</PieChart>
						</ResponsiveContainer>
					</div>
				</motion.div>

				{/* Monthly Trend */}
				<motion.div className={s.chartCard} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.34 }}>
					<p className={s.chartTitle}>Monthly Response Trend</p>
					<p className={s.chartSub}>Submissions over the last 6 months</p>
					<div className={s.chartWrap} style={{ height: 240 }}>
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={stats?.monthlyTrend ?? []} margin={{ top:4, right:8, left:-16, bottom:0 }}>
								<CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
								<XAxis dataKey="month" tick={{ fontSize:10, fill:'#9ca3af' }} />
								<YAxis tick={{ fontSize:10, fill:'#9ca3af' }} allowDecimals={false} />
								<Tooltip content={<ChartTooltip />} />
								<Line
									type="monotone"
									dataKey="count"
									name="Responses"
									stroke="#8b5cf6"
									strokeWidth={2.5}
									dot={{ r:4, fill:'#8b5cf6', strokeWidth:0 }}
									activeDot={{ r:6, fill:'#6366f1' }}
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				</motion.div>

			</div>
		</section>
	);
}

/* ─────────────────────────────────────────────────
   Database Explorer
───────────────────────────────────────────────── */
function DbExplorer() {
	const [table,    setTable]    = useState('companies');
	const [data,     setData]     = useState({ columns:[], rows:[], total:0, page:1, pageSize:20 });
	const [loading,  setLoading]  = useState(false);
	const [search,   setSearch]   = useState('');
	const [sort,     setSort]     = useState({ col:'', dir:'asc' });
	const [page,     setPage]     = useState(1);
	const searchRef = useRef(null);

	const fetchTable = useCallback(async (tbl, pg, q, srt) => {
		setLoading(true);
		try {
			const params = new URLSearchParams({
				table:    tbl,
				page:     String(pg),
				pageSize: '20',
				q:        q,
				sort:     srt.col,
				dir:      srt.dir,
			});
			const res  = await fetch(`/api/analytics/table?${params}`);
			const json = await res.json();
			setData(json);
		} catch {
			/* ignore */
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { fetchTable(table, page, search, sort); }, [table, page, sort, fetchTable]);

	// Debounced search
	useEffect(() => {
		const t = setTimeout(() => {
			setPage(1);
			fetchTable(table, 1, search, sort);
		}, 350);
		return () => clearTimeout(t);
	}, [search]);

	function handleSort(col) {
		setSort((prev) => ({
			col,
			dir: prev.col === col && prev.dir === 'asc' ? 'desc' : 'asc',
		}));
		setPage(1);
	}

	function exportCsv() {
		if (!data.rows.length) return;
		const header = data.columns.join(',');
		const rows   = data.rows.map((r) =>
			data.columns.map((c) => {
				const v = r[c] ?? '';
				const s = String(v).replace(/"/g, '""');
				return s.includes(',') || s.includes('\n') ? `"${s}"` : s;
			}).join(',')
		);
		const csv  = [header, ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url  = URL.createObjectURL(blob);
		const a    = document.createElement('a');
		a.href = url; a.download = `${table}.csv`; a.click();
		URL.revokeObjectURL(url);
	}

	const totalPages = Math.max(1, Math.ceil(data.total / (data.pageSize || 20)));
	const pageNums   = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
		const start = Math.max(1, Math.min(page - 2, totalPages - 4));
		return start + i;
	}).filter((n) => n >= 1 && n <= totalPages);

	function fmtCell(v) {
		if (v === null || v === undefined) return <span style={{ color:'#9ca3af' }}>—</span>;
		const s = String(v);
		if (s.length > 60) return s.slice(0, 60) + '…';
		return s;
	}

	return (
		<section>
			<div className={s.sectionHeader}>
				<div>
					<h2 className={s.sectionTitle}>Database Explorer</h2>
					<p className={s.sectionSub}>Browse, search and export your database tables</p>
				</div>
			</div>

			<motion.div className={s.dbCard} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}>
				<div className={s.dbHeader}>
					<div className={s.tableTabs}>
						{TABLES.map((t) => (
							<button
								key={t}
								className={`${s.tableTab} ${table === t ? s.tableTabActive : ''}`}
								onClick={() => { setTable(t); setPage(1); setSearch(''); setSort({ col:'', dir:'asc' }); }}
							>
								{t}
							</button>
						))}
					</div>

					<div className={s.dbActions}>
						<div className={s.searchBox}>
							<Search size={13} color="#9ca3af" />
							<input
								ref={searchRef}
								className={s.searchInput}
								placeholder="Search…"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<button className={s.exportBtn} onClick={exportCsv} disabled={!data.rows.length}>
							<Download size={13} />
							Export CSV
						</button>
					</div>
				</div>

				{loading ? (
					<div style={{ padding:'2rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
						{[0,1,2,3,4].map((i) => <Sk key={i} className={s.skLbl} style={{ height:'2rem' }} />)}
					</div>
				) : data.columns.length === 0 ? (
					<div className={s.emptyState}>
						<Database size={32} style={{ margin:'0 auto 0.5rem', opacity:0.25 }} />
						<p>No data found{search ? ` for "${search}"` : ''}.</p>
					</div>
				) : (
					<>
						<div className={s.tableWrapper}>
							<table className={s.dataTable}>
								<thead>
									<tr>
										{data.columns.map((col) => (
											<th key={col} onClick={() => handleSort(col)}>
												<div className={s.thInner}>
													{col}
													{sort.col === col
														? sort.dir === 'asc'
															? <ChevronUp size={11} />
															: <ChevronDown size={11} />
														: <ArrowUpDown size={11} style={{ opacity:0.3 }} />
													}
												</div>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									<AnimatePresence mode="wait">
										{data.rows.map((row, ri) => (
											<motion.tr
												key={ri}
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ delay: ri * 0.02 }}
											>
												{data.columns.map((col) => (
													<td key={col} title={String(row[col] ?? '')}>
														{fmtCell(row[col])}
													</td>
												))}
											</motion.tr>
										))}
									</AnimatePresence>
								</tbody>
							</table>
						</div>

						<div className={s.pagination}>
							<span className={s.pageInfo}>
								{data.total.toLocaleString()} row{data.total !== 1 ? 's' : ''}
								{search ? ` matching "${search}"` : ''}
								&nbsp;·&nbsp; page {page} of {totalPages}
							</span>
							<div className={s.pageButtons}>
								<button className={s.pageBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
									<ChevronLeft size={13} />
								</button>
								{pageNums.map((n) => (
									<button
										key={n}
										className={`${s.pageBtn} ${n === page ? s.pageBtnActive : ''}`}
										onClick={() => setPage(n)}
									>
										{n}
									</button>
								))}
								<button className={s.pageBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
									<ChevronRight size={13} />
								</button>
							</div>
						</div>
					</>
				)}
			</motion.div>
		</section>
	);
}

/* ─────────────────────────────────────────────────
   AI Chat Section
───────────────────────────────────────────────── */
function AiChat() {
	const [messages,    setMessages]    = useState([]);
	const [input,       setInput]       = useState('');
	const [loading,     setLoading]     = useState(false);
	const [activeIdx,   setActiveIdx]   = useState(null);
	const [copied,      setCopied]      = useState(false);
	const textareaRef = useRef(null);
	const responsePanelRef = useRef(null);

	const activeMsg = activeIdx !== null ? messages[activeIdx] : null;

	async function sendMessage(text) {
		const q = text.trim();
		if (!q || loading) return;
		setInput('');
		setLoading(true);

		const newMsg = { question: q, timestamp: new Date(), loading: true, result: null };
		setMessages((prev) => {
			const next = [...prev, newMsg];
			setActiveIdx(next.length - 1);
			return next;
		});

		try {
			const res  = await fetch('/api/analytics/chat', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ message: q }),
			});
			const data = await res.json();
			setMessages((prev) =>
				prev.map((m, i) =>
					i === prev.length - 1 ? { ...m, loading: false, result: data } : m
				)
			);
		} catch (err) {
			setMessages((prev) =>
				prev.map((m, i) =>
					i === prev.length - 1
						? { ...m, loading: false, result: { error: err.message } }
						: m
				)
			);
		} finally {
			setLoading(false);
		}
	}

	function copySql(sql) {
		navigator.clipboard.writeText(sql).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		});
	}

	function downloadResults(result) {
		if (!result?.rows?.length) return;
		const header = result.columns.join(',');
		const rows   = result.rows.map((r) =>
			result.columns.map((c) => {
				const v = String(r[c] ?? '').replace(/"/g, '""');
				return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
			}).join(',')
		);
		const csv  = [header, ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv' });
		const url  = URL.createObjectURL(blob);
		const a    = document.createElement('a');
		a.href = url; a.download = 'query-results.csv'; a.click();
		URL.revokeObjectURL(url);
	}

	function handleKey(e) {
		if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
	}

	// Auto-resize textarea
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = Math.min(120, textareaRef.current.scrollHeight) + 'px';
		}
	}, [input]);

	return (
		<section>
			<div className={s.sectionHeader}>
				<div>
					<h2 className={s.sectionTitle}>AI Analytics Chat</h2>
					<p className={s.sectionSub}>Ask natural language questions — get live SQL + results</p>
				</div>
			</div>

			<motion.div className={s.chatCard} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }}>
				{/* Header */}
				<div className={s.chatHeader}>
					<div className={s.chatHeaderLeft}>
						<div className={s.aiDot} />
						<div>
							<p className={s.chatTitle}>
								<Sparkles size={14} style={{ display:'inline', marginRight:5, verticalAlign:-2 }} />
								Analytics AI
							</p>
							<p className={s.chatStatus}>Powered by Claude · Ready</p>
						</div>
					</div>
					{messages.length > 0 && (
						<button className={s.topbarBtn} onClick={() => { setMessages([]); setActiveIdx(null); }} style={{ fontSize:'0.72rem' }}>
							Clear history
						</button>
					)}
				</div>

				{/* Body: history | response */}
				<div className={s.chatBody}>
					{/* Left: history + suggestions */}
					<div className={s.chatHistory}>
						<div className={s.historyLabel}>Chat History</div>

						{messages.length === 0 ? (
							<div className={s.historyEmpty}>No conversations yet.<br />Ask a question below.</div>
						) : (
							messages.map((msg, i) => (
								<div
									key={i}
									className={`${s.historyItem} ${activeIdx === i ? s.historyActive : ''}`}
									onClick={() => setActiveIdx(i)}
								>
									<p className={s.historyQ}>{msg.question}</p>
									<p className={s.historyTime}>
										{msg.timestamp.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
									</p>
								</div>
							))
						)}

						<div className={s.suggestedWrap}>
							<p className={s.suggestedLabel}>Suggested</p>
							<div className={s.suggestedList}>
								{SUGGESTED.slice(0, 5).map((q) => (
									<button key={q} className={s.suggestedBtn} onClick={() => sendMessage(q)}>
										{q}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Right: response panel */}
					<div className={s.responsePanel} ref={responsePanelRef}>
						<AnimatePresence mode="wait">
							{!activeMsg ? (
								<motion.div
									key="empty"
									className={s.responseEmpty}
									initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
								>
									<Sparkles size={40} />
									<p className={s.responseEmptyTitle}>Ask anything about your data</p>
									<p className={s.responseEmptyHint}>
										Type a question below or pick a suggestion.<br />
										AI will generate SQL and show live results.
									</p>
								</motion.div>
							) : activeMsg.loading ? (
								<motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
									<div className={s.explanationBox} style={{ marginBottom:0 }}>
										<Sparkles size={14} className={s.explanationIcon} />
										<div>
											<div style={{ fontWeight:600, marginBottom:6 }}>Generating SQL…</div>
											<div className={s.typingDots}>
												<div className={s.typingDot} />
												<div className={s.typingDot} />
												<div className={s.typingDot} />
											</div>
										</div>
									</div>
								</motion.div>
							) : activeMsg.result?.error && !activeMsg.result?.sql ? (
								<motion.div key="error" initial={{ opacity:0 }} animate={{ opacity:1 }}>
									<div className={s.queryError}>
										<AlertCircle size={14} style={{ display:'inline', marginRight:6, verticalAlign:-2 }} />
										{activeMsg.result.error}
									</div>
								</motion.div>
							) : (
								<motion.div key={activeIdx} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
									{/* SQL block intentionally hidden from UI */}

									{/* Explanation */}
									{activeMsg.result?.explanation && (
										<div className={s.explanationBox}>
											<Sparkles size={14} className={s.explanationIcon} />
											<span>{activeMsg.result.explanation}</span>
										</div>
									)}

									{/* Query error */}
									{activeMsg.result?.queryError && (
										<div className={s.queryError}>
											<AlertCircle size={14} style={{ display:'inline', marginRight:6, verticalAlign:-2 }} />
											Query error: {activeMsg.result.queryError}
										</div>
									)}

									{/* Results table */}
									{activeMsg.result?.rows?.length > 0 && (
										<div className={s.resultsWrap}>
											<div className={s.resultsHeader}>
												<span className={s.resultsCount}>
													{activeMsg.result.rowCount ?? activeMsg.result.rows.length} row{activeMsg.result.rows.length !== 1 ? 's' : ''} returned
												</span>
												<button className={s.downloadBtn} onClick={() => downloadResults(activeMsg.result)}>
													<Download size={11} />
													Download CSV
												</button>
											</div>
											<div style={{ overflowX:'auto', maxHeight:320, overflowY:'auto' }}>
												<table className={s.resultsTable}>
													<thead>
														<tr>
															{activeMsg.result.columns.map((c) => (
																<th key={c}>{c}</th>
															))}
														</tr>
													</thead>
													<tbody>
														{activeMsg.result.rows.map((row, ri) => (
															<tr key={ri}>
																{activeMsg.result.columns.map((c) => (
																	<td key={c} title={String(row[c] ?? '')}>
																		{row[c] === null || row[c] === undefined
																			? <span style={{ color:'#9ca3af' }}>—</span>
																			: String(row[c])}
																	</td>
																))}
															</tr>
														))}
													</tbody>
												</table>
											</div>
										</div>
									)}

									{activeMsg.result?.rows?.length === 0 && !activeMsg.result?.queryError && (
										<div className={s.emptyState} style={{ padding:'1.5rem' }}>
											No results returned for this query.
										</div>
									)}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>

				{/* Input row */}
				<div className={s.chatInput}>
					<textarea
						ref={textareaRef}
						className={s.chatTextarea}
						rows={1}
						placeholder="Ask anything about your survey database… (Enter to send)"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKey}
						disabled={loading}
					/>
					<button
						className={s.sendBtn}
						onClick={() => sendMessage(input)}
						disabled={!input.trim() || loading}
						title="Send"
					>
						{loading ? <RefreshCw size={16} style={{ animation:'spin 1s linear infinite' }} /> : <Send size={16} />}
					</button>
				</div>
			</motion.div>
		</section>
	);
}

/* ─────────────────────────────────────────────────
   Main Page
───────────────────────────────────────────────── */
export default function AnalyticsPage() {
	const [stats,   setStats]   = useState(null);
	const [loading, setLoading] = useState(true);

	const loadStats = useCallback(async () => {
		setLoading(true);
		try {
			const res  = await fetch('/api/analytics/stats');
			const data = await res.json();
			setStats(data);
		} catch {
			setStats(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { loadStats(); }, [loadStats]);

	return (
		<div className={s.shell}>
			<Sidebar />
			<div className={s.content}>
				<Topbar onRefresh={loadStats} />
				<div className={s.page}>
					<StatsSection stats={stats} loading={loading} />
					<ChartsSection stats={stats} loading={loading} />
					<DbExplorer />
					<AiChat />
				</div>
			</div>
		</div>
	);
}
