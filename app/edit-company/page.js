'use client';

import { useEffect } from 'react';

export default function EditCompanyPage() {
	useEffect(() => {
		// Load sidebar component script
		const sidebarScript = document.createElement('script');
		sidebarScript.type = 'module';
		sidebarScript.src = '/shared/dashboard-sidebar.js';
		document.head.appendChild(sidebarScript);

		// Dynamically load the edit-company.js script
		const editScript = document.createElement('script');
		editScript.type = 'module';
		editScript.src = '/edit-company.js';
		document.body.appendChild(editScript);

		return () => {
			if (document.head.contains(sidebarScript)) {
				document.head.removeChild(sidebarScript);
			}
			if (document.body.contains(editScript)) {
				document.body.removeChild(editScript);
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
								<p className="dash-topbar__sub">Edit company details</p>
							</div>
						</div>
						<div className="dash-topbar__right">
							<a className="dash-topbar-btn" href="/companies">
								Back to companies
							</a>
						</div>
					</div>

					<div className="dash-page">
						<div className="dash-page-header">
							<div>
								<h1>Edit Company</h1>
								<p>Update company details and branding.</p>
							</div>
						</div>

						<div id="loading-container" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
							<div className="dsi-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div>
						</div>

						<div
							id="form-container"
							className="company-form-card"
							style={{
								background: 'var(--bg-card)',
								border: '1px solid var(--border)',
								borderRadius: 'var(--radius)',
								padding: '1.75rem 2rem',
								boxShadow: 'var(--shadow-sm)',
								maxWidth: '600px',
								animation: 'dsiFadeUp 0.45s ease both',
								display: 'none',
							}}
						>
							<form id="company-form" noValidate>
								{/* Form content will be inserted by edit-company.js */}
							</form>
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
			<div
				id="loader"
				hidden
				style={{
					position: 'fixed',
					inset: 0,
					background: 'rgba(245,247,255,0.7)',
					backdropFilter: 'blur(3px)',
					zIndex: 300,
					display: 'grid',
					placeItems: 'center',
				}}
				aria-busy="true"
			>
				<div className="dsi-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }}></div>
			</div>

			<style jsx global>{`
				@import '/dash-shell.css';
				@import '/style.css';
			`}</style>
		</>
	);
}
