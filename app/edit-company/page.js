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
								{/* Basic Information Section */}
								<div style={{ marginBottom: '2rem' }}>
									<h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>Basic Information</h3>
									<div className="form-grid">
										<div className="field form-grid__full">
											<label htmlFor="company-name">Company name <span className="req-label">*</span></label>
											<input className="dsi-input" type="text" id="company-name" name="name" required autoComplete="organization" placeholder="e.g. Acme Corporation" />
										</div>
										<div className="field">
											<label htmlFor="company-industry">Industry</label>
											<input className="dsi-input" type="text" id="company-industry" name="industry" list="industry-suggestions" placeholder="Type or pick a suggestion" />
											<datalist id="industry-suggestions">
												<option value="Technology" />
												<option value="Healthcare" />
												<option value="Finance" />
												<option value="Retail" />
												<option value="Manufacturing" />
												<option value="Education" />
												<option value="Government" />
												<option value="Professional services" />
											</datalist>
										</div>
										<div className="field">
											<label htmlFor="company-region">Region</label>
											<input className="dsi-input" type="text" id="company-region" name="region" list="region-suggestions" placeholder="Type or pick a suggestion" />
											<datalist id="region-suggestions">
												<option value="North America" />
												<option value="Europe" />
												<option value="Asia Pacific" />
												<option value="Middle East &amp; Africa" />
												<option value="Latin America" />
												<option value="India" />
												<option value="Global" />
											</datalist>
										</div>
										<div className="field form-grid__full">
											<label htmlFor="company-tier">Tier <span className="req-label">*</span></label>
											<select className="dsi-select" id="company-tier" name="tier" required>
												<option value="" disabled selected hidden>Select tier</option>
												<option value="Tier 1">Tier 1</option>
												<option value="Tier 2">Tier 2</option>
												<option value="Tier 3">Tier 3</option>
											</select>
										</div>
										<div className="field form-grid__full">
											<label htmlFor="company-description">Description</label>
											<textarea className="dsi-input" id="company-description" name="description" placeholder="Optional company description..." style={{ minHeight: '80px', resize: 'vertical' }}></textarea>
										</div>
									</div>
								</div>

								{/* Branding Section */}
								<div style={{ marginBottom: '2rem' }}>
									<h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--muted)' }}>Branding</h3>
									<div className="form-grid">
										<div className="field form-grid__full">
											<label htmlFor="company-logo">Logo</label>
											<div className="file-upload-wrapper">
												<input type="file" id="company-logo" className="file-input" accept="image/jpeg,image/png,image/webp" data-type="logo" />
												<button type="button" className="dsi-btn dsi-btn--ghost" id="logo-btn" style={{ width: '100%' }}>Upload Logo</button>
												<div id="logo-preview" className="file-preview"></div>
											</div>
										</div>
										<div className="field form-grid__full">
											<label htmlFor="company-banner">Banner</label>
											<div className="file-upload-wrapper">
												<input type="file" id="company-banner" className="file-input" accept="image/jpeg,image/png,image/webp" data-type="banner" />
												<button type="button" className="dsi-btn dsi-btn--ghost" id="banner-btn" style={{ width: '100%' }}>Upload Banner</button>
												<div id="banner-preview" className="file-preview"></div>
											</div>
										</div>
										<div className="field">
											<label htmlFor="bg-color">Background Color</label>
											<div className="color-input-wrapper">
												<input type="color" id="bg-color" className="color-input" defaultValue="#ffffff" data-field="background_color" />
												<span id="bg-color-text" className="color-text">#ffffff</span>
											</div>
										</div>
										<div className="field">
											<label htmlFor="text-color">Text Color</label>
											<div className="color-input-wrapper">
												<input type="color" id="text-color" className="color-input" defaultValue="#000000" data-field="text_color" />
												<span id="text-color-text" className="color-text">#000000</span>
											</div>
										</div>
										<div className="field form-grid__full">
											<label htmlFor="font-family">Font Family</label>
											<select className="dsi-select" id="font-family" data-field="font_family">
												<option value="Arial">Arial</option>
												<option value="Helvetica">Helvetica</option>
												<option value="Roboto" selected>Roboto</option>
												<option value="Poppins">Poppins</option>
												<option value="Open Sans">Open Sans</option>
												<option value="Montserrat">Montserrat</option>
											</select>
										</div>
									</div>
								</div>

								<p id="form-error" style={{ display: 'none', fontSize: '0.82rem', color: 'var(--danger)', margin: '0.5rem 0' }} role="alert"></p>

								<div className="form-actions">
									<button type="submit" className="dsi-btn dsi-btn--primary" id="save-btn">Update company</button>
									<button type="button" className="dsi-btn dsi-btn--danger" id="delete-btn">Delete company</button>
									<a className="dsi-btn dsi-btn--ghost" href="/companies">Cancel</a>
								</div>
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
