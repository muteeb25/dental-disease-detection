'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, Info, LayoutDashboard, LogOut, ScanLine, Users } from 'lucide-react';
import ThemeToggle from '@/app/theme-toggle';
import { logout } from '@/lib/api';

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/detect', label: 'Analyze', icon: ScanLine },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/about', label: 'About', icon: Info },
];

export default function Navbar() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(Boolean(localStorage.getItem('token'))), [pathname]);
  return <header className="topbar">
    <Link className="brand" href="/dashboard"><span className="brand-mark"><Activity size={20}/></span><span>Dental<span className="brand-light">Review</span></span></Link>
    <nav className="main-nav" aria-label="Main navigation">{links.map(({ href, label, icon: Icon }) => {
      const active = pathname === href || (href === '/patients' && (pathname.startsWith('/patients/') || pathname.startsWith('/scans/')));
      return <Link key={href} href={href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}><Icon size={16}/><span>{label}</span></Link>;
    })}</nav>
    <div className="nav-actions"><ThemeToggle/>{signedIn && <button className="signout-button" onClick={logout}><LogOut size={16}/><span>Sign out</span></button>}</div>
  </header>;
}
