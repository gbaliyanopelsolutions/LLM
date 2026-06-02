/**
 * Shared Dashboard Sidebar Web Component
 * Eliminates duplicate sidebar HTML across all pages (dashboard, forms, index, survey, add-company)
 * Renders sidebar HTML directly into light DOM so existing CSS (dash-shell.css) applies
 * Accepts current-page attribute to highlight the active page
 */
class DashboardSidebar extends HTMLElement {
	constructor() {
		super();
	}

	connectedCallback() {
		const currentPage = this.getAttribute('current-page') || 'dashboard';
		this.render(currentPage);
		this.setupMobileToggle();
	}

	render(currentPage) {
		let navItems = [
			{ href: '/dashboard', label: 'Dashboard', page: 'dashboard', section: 'Overview', icon: 'dashboard' },
			{ href: '/index', label: 'Form Builder', page: 'index', section: 'Build', icon: 'builder', badge: 'AI' },
			{ href: '/forms', label: 'Forms', page: 'forms', section: 'Manage', icon: 'forms' },
			{ href: '/survey', label: 'My Surveys', page: 'survey', section: 'Manage', icon: 'surveys' },
			{ href: '/companies', label: 'Companies', page: 'companies', section: 'Manage', icon: 'companies' },
			{ href: '/analytics', label: 'Analytics', page: 'analytics', section: 'Manage', icon: 'analytics', badge: 'New' },
		];

		// Hide Companies nav item on add-company page
		if (currentPage === 'add-company') {
			navItems = navItems.filter(item => item.page !== 'companies');
		}

		const icons = {
			dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
			builder: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>',
			forms: '<path d="M9 11H7a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-2m0-4H7a2 2 0 00-2 2v3m11-4V7a2 2 0 00-2-2h-2.5a2 2 0 00-1 .27M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M9 11h6v2H9z"/><path d="M9 15h6v2H9z"/>',
			surveys: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
			companies: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
			analytics: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
		};

		const sections = {};
		navItems.forEach(item => {
			if (!sections[item.section]) {
				sections[item.section] = [];
			}
			sections[item.section].push(item);
		});

		const sectionsHtml = Object.entries(sections).map(([sectionName, items]) => `
			<div class="dash-nav-section">
				<span class="dash-nav-label">${sectionName}</span>
				<nav class="dash-nav">
					${items.map(item => {
						const isActive = item.page === currentPage;
						return `
							<a class="dash-nav-item ${isActive ? 'is-active' : ''}" href="${item.href}">
								<svg class="dash-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									${icons[item.icon]}
								</svg>
								${item.label}
								${item.badge ? `<span class="dash-nav-badge">${item.badge}</span>` : ''}
							</a>
						`;
					}).join('')}
				</nav>
			</div>
		`).join('');

		this.innerHTML = `
			<aside class="dash-sidebar" id="dashSidebar" aria-label="Main navigation">
				<a class="dash-brand" href="/dashboard">
					<div class="dash-brand__icon">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
						</svg>
					</div>
					<div>
						<span class="dash-brand__name">Survey Form Builder</span>
						<span class="dash-brand__sub">Survey Builder</span>
					</div>
				</a>
				${sectionsHtml}
				<div class="dash-sidebar-footer">
					<div class="dash-user-pill">
						<div class="dash-user-avatar">AI</div>
						<span class="dash-user-name">Survey Form Builder</span>
					</div>
				</div>
			</aside>
		`;
	}

	setupMobileToggle() {
		// Defer until DOM is fully rendered to ensure hamburger button exists
		requestAnimationFrame(() => {
			const sidebar = document.getElementById('dashSidebar');
			const overlay = document.getElementById('sidebarOverlay');
			const hamburgerBtn = document.getElementById('hamburgerBtn');

			if (!sidebar || !overlay || !hamburgerBtn) return;

			const openSidebar = () => {
				sidebar.classList.add('is-open');
				overlay.classList.add('is-visible');
				hamburgerBtn.setAttribute('aria-expanded', 'true');
				document.body.style.overflow = 'hidden';
			};

			const closeSidebar = () => {
				sidebar.classList.remove('is-open');
				overlay.classList.remove('is-visible');
				hamburgerBtn.setAttribute('aria-expanded', 'false');
				document.body.style.overflow = '';
			};

			hamburgerBtn.addEventListener('click', () => {
				if (sidebar.classList.contains('is-open')) {
					closeSidebar();
				} else {
					openSidebar();
				}
			});

			overlay.addEventListener('click', closeSidebar);

			document.addEventListener('keydown', (e) => {
				if (e.key === 'Escape' && sidebar.classList.contains('is-open')) {
					closeSidebar();
				}
			});
		});
	}
}

customElements.define('dashboard-sidebar', DashboardSidebar);
