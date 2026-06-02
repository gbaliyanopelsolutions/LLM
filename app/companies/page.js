'use client';

import { useEffect } from 'react';

export default function CompaniesPage() {
	useEffect(() => {
		// Load sidebar component script
		const sidebarScript = document.createElement('script');
		sidebarScript.type = 'module';
		sidebarScript.src = '/shared/dashboard-sidebar.js';
		document.head.appendChild(sidebarScript);

		// Dynamically load the companies.js script
		const companiesScript = document.createElement('script');
		companiesScript.type = 'module';
		companiesScript.src = '/companies.js';
		document.body.appendChild(companiesScript);

		return () => {
			if (document.head.contains(sidebarScript)) {
				document.head.removeChild(sidebarScript);
			}
			if (document.body.contains(companiesScript)) {
				document.body.removeChild(companiesScript);
			}
		};
	}, []);

	return (
		<>
			<div className="dash-overlay" id="sidebarOverlay"></div>

			<div className="dash-shell">
				{/* Sidebar Component */}
				<dashboard-sidebar current-page="companies"></dashboard-sidebar>

				{/* ════════ MAIN ════════ */}
				<div className="dash-content">
					<div className="dash-topbar">
						<div className="dash-topbar__left">
							<button className="dash-hamburger" id="hamburgerBtn" aria-label="Toggle sidebar" aria-expanded="false">
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
									<line x1="3" y1="6" x2="21" y2="6" />
									<line x1="3" y1="12" x2="21" y2="12" />
									<line x1="3" y1="18" x2="21" y2="18" />
								</svg>
							</button>
							<div>
								<p className="dash-topbar__title">Companies</p>
								<p className="dash-topbar__sub">View and manage all companies</p>
							</div>
						</div>
						<div className="dash-topbar__right">
							<a className="dash-topbar-btn" href="/survey">
								View Surveys
							</a>
						</div>
					</div>

					<div className="dash-page">
						<div className="dash-page-header">
							<div>
								<h1>Manage Companies</h1>
								<p>View, edit, and manage your companies.</p>
							</div>
							<div>
								<a href="/add-company" className="dsi-btn dsi-btn--primary">
									+ Add Company
								</a>
							</div>
						</div>

						<div className="companies-page-content" style={{
							background: 'var(--bg-card)',
							border: '1px solid var(--border)',
							borderRadius: 'var(--radius)',
							padding: '1.75rem',
							boxShadow: 'var(--shadow-sm)',
							animation: 'dsiFadeUp 0.45s ease both',
						}}>
							{/* Search & Sort Toolbar */}
							<div className="companies-toolbar">
								<input type="search" id="search-input" className="dsi-input" placeholder="Search companies..." />
								<select id="sort-select" className="dsi-select">
									<option value="name-asc">Sort: Name (A-Z)</option>
									<option value="name-desc">Sort: Name (Z-A)</option>
									<option value="created-desc">Sort: Newest First</option>
									<option value="created-asc">Sort: Oldest First</option>
									<option value="tier">Sort: Tier</option>
								</select>
							</div>

							{/* Loading indicator */}
							<div id="loading" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
								<div className="dsi-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div>
							</div>

							{/* Companies Table */}
							<table className="companies-table" id="companies-table" style={{ display: 'none' }}>
								<thead>
									<tr>
										<th>Logo</th>
										<th>Company Name</th>
										<th>Tier</th>
										<th>Created</th>
										<th>Actions</th>
									</tr>
								</thead>
								<tbody id="companies-list"></tbody>
							</table>

							{/* Empty state */}
							<div id="empty-state" style={{ display: 'none', textAlign: 'center', padding: '2rem' }}>
								<p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>No companies found</p>
								<a href="/add-company" className="dsi-btn dsi-btn--primary">
									Create your first company
								</a>
							</div>

							{/* Pagination */}
							<div className="pagination" id="pagination-container" style={{ display: 'none' }}>
								<button id="prev-btn" className="dsi-btn dsi-btn--ghost">
									← Previous
								</button>
								<span id="page-info">Page 1</span>
								<button id="next-btn" className="dsi-btn dsi-btn--ghost">
									Next →
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Delete Confirmation Modal */}
			<div id="delete-modal" className="delete-modal">
				<div className="delete-modal-content">
					<h3>Delete Company</h3>
					<p id="delete-confirm-text">Are you sure you want to delete this company? This action cannot be undone.</p>
					<div className="delete-modal-actions">
						<button id="cancel-delete" className="dsi-btn dsi-btn--ghost">
							Cancel
						</button>
						<button id="confirm-delete" className="dsi-btn dsi-btn--danger">
							Delete
						</button>
					</div>
				</div>
			</div>

			<div id="toast" className="dsi-toast" hidden role="status"></div>
			<div id="loader" hidden style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(245,247,255,0.7)',
				backdropFilter: 'blur(3px)',
				zIndex: 300,
				display: 'grid',
				placeItems: 'center',
			}} aria-busy="true">
				<div className="dsi-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div>
			</div>

			<style jsx global>{`
				@import '/dash-shell.css';
				@import '/style.css';
			`}</style>
		</>
	);
}
