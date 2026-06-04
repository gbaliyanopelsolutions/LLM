'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	LayoutDashboard,
	Wand2,
	FileText,
	BarChart3,
	Building2,
	TrendingUp,
} from 'lucide-react';
import s from './Sidebar.module.css';

const NAV_SECTIONS = [
	{
		label: 'OVERVIEW',
		items: [
			{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
		],
	},
	{
		label: 'BUILD',
		items: [
			{ href: '/index', label: 'Form Builder', icon: Wand2, badge: 'AI' },
		],
	},
	{
		label: 'MANAGE',
		items: [
			{ href: '/forms', label: 'Forms', icon: FileText },
			{ href: '/survey', label: 'My Surveys', icon: BarChart3 },
			{ href: '/add-company', label: 'Companies', icon: Building2 },
			{ href: '/analytics', label: 'Analytics', icon: TrendingUp },
		],
	},
];

export default function Sidebar() {
	const pathname = usePathname();

	const isActive = (href) => {
		if (href === '/index') {
			return pathname === '/index';
		}
		if (href === '/dashboard') {
			return pathname === '/dashboard';
		}
		if (href === '/survey') {
			return pathname === '/survey' || pathname.startsWith('/survey/');
		}
		if (href === '/add-company') {
			return pathname === '/add-company';
		}
		return pathname.startsWith(href);
	};

	return (
		<aside className={s.sidebar}>
			{/* Brand */}
			<div className={s.brand}>
				<div className={s.brandIcon}>S</div>
				<div className={s.brandText}>
					<h2 className={s.brandName}>Survey Form Builder</h2>
					<p className={s.brandSub}>Survey Builder</p>
				</div>
			</div>

			{/* Navigation */}
			<nav className={s.nav}>
				{NAV_SECTIONS.map((section) => (
					<div key={section.label} className={s.navSection}>
						<p className={s.navLabel}>{section.label}</p>
						<div className={s.navItems}>
							{section.items.map((item) => {
								const Icon = item.icon;
								const active = isActive(item.href);
								return (
									<Link
										key={item.href}
										href={item.href}
										className={`${s.navItem} ${active ? s.isActive : ''}`}
									>
										<Icon size={17} className={s.navIcon} />
										<span>{item.label}</span>
										{item.badge && (
											<span className={s.badge}>{item.badge}</span>
										)}
									</Link>
								);
							})}
						</div>
					</div>
				))}
			</nav>

			{/* Footer */}
			<div className={s.footer}>
				<div className={s.userPill}>
					<div className={s.userAvatar}>AI</div>
					<span className={s.userName}>Survey Form Builder</span>
				</div>
			</div>
		</aside>
	);
}
