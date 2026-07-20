'use client'

import Link from 'next/link'
import { Manrope } from 'next/font/google'
import { usePathname } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    UserPlus,
    Upload,
    FileSearch,
    FileBarChart,
    Settings,
    Target,
    ClipboardList,
    X,
    Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useAuthStore } from '@/stores/authStore'

const supportFont = Manrope({ subsets: ['latin'], weight: ['500', '600', '700', '800'] })

function BrandMark() {
    return (
        <div className="flex h-[3rem] w-[3rem] shrink-0 items-center justify-center">
            <img 
                src="/logo.png" 
                alt="BMA CRM Logo" 
                className="w-full h-full object-contain"
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                }}
            />
        </div>
    )
}

const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Orders', href: '/orders', icon: Users, roles: ['ADMIN', 'MANAGER', 'STAFF'] },
    { name: 'Leads', href: '/leads', icon: Target, roles: ['ADMIN', 'MANAGER', 'STAFF'] },
    { name: 'Import Data', href: '/import', icon: Upload, roles: ['ADMIN', 'MANAGER'] },
    { name: 'Data', href: '/import-preview', icon: FileSearch, roles: ['ADMIN', 'MANAGER', 'STAFF'] },
    { name: 'Payments', href: '/payment', icon: Users, roles: ['ADMIN', 'MANAGER'] },
    { name: 'Team Management', href: '/team', icon: UserPlus, roles: ['ADMIN', 'MANAGER'], exact: true },
    { name: 'Form Templates', href: '/team/templates', icon: Settings, roles: ['ADMIN', 'MANAGER'], staffRoles: ['TELECALLER'] },
    { name: 'Follow Ups', href: '/follow-ups', icon: ClipboardList, roles: ['ADMIN', 'MANAGER'], staffRoles: ['TELECALLER'] },
    { name: 'Settings', href: '/settings', icon: Settings2, roles: ['ADMIN'], exact: true },
]

export function Sidebar() {
    const pathname = usePathname()
    const { isOpen, toggle, close } = useSidebarStore()
    const { user } = useAuthStore()
    const userRole = user?.role || 'STAFF'

    const filteredNav = navigation.filter(item => {
        if (!item.roles && !item.staffRoles) return true
        if (item.roles?.includes(userRole)) return true
        if (item.staffRoles && user?.staffRole && item.staffRoles.includes(user.staffRole)) return true
        return false
    })

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm"
                    onClick={close}
                />
            )}

            <aside
                className={cn(
                    "fixed left-0 top-0 h-full bg-background border-r border-border flex flex-col z-40 transition-all duration-300 ease-in-out",
                    "w-72 max-lg:translate-x-[-100%]",
                    isOpen && "max-lg:translate-x-0",
                    "lg:translate-x-0",
                    isOpen ? "lg:w-[240px]" : "lg:w-[68px]"
                )}
            >
                {/* Brand header */}
                <div className={cn(
                    "h-16 flex items-center border-b border-border transition-all duration-300",
                    isOpen ? "gap-3 px-5 justify-between" : "lg:justify-center lg:px-0 px-5 gap-0"
                )}>
                    <div className={cn("flex items-center min-w-0", isOpen ? "gap-2" : "lg:justify-center w-full")}>
                        <BrandMark />
                        <div className={cn("overflow-hidden min-w-0 transition-opacity duration-300", !isOpen && "lg:opacity-0 lg:w-0 lg:hidden")}>
                            <div className="flex items-center whitespace-nowrap">
                                <span className={cn("text-[1.3rem] font-bold tracking-tight text-foreground leading-none", supportFont.className)}>BMA</span>
                                <span className={cn("text-[1.3rem] font-bold tracking-tight text-muted-foreground leading-none ml-1.5", supportFont.className)}>CRM</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={close}
                        className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className={cn(
                    "flex-1 space-y-0.5 overflow-y-auto scrollbar-thin transition-all duration-300",
                    isOpen ? "p-3" : "lg:p-2 p-3"
                )}>
                    {filteredNav.map((item) => {
                        const isActive = item.exact
                            ? pathname === item.href
                            : pathname === item.href || pathname.startsWith(item.href + '/')

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                prefetch={true}
                                onClick={() => {
                                    if (window.innerWidth < 1024) close()
                                }}
                                title={!isOpen ? item.name : undefined}
                                className={cn(
                                    'relative flex items-center rounded-lg text-sm font-medium transition-all duration-200 group',
                                    isOpen ? 'gap-3 px-3 py-2.5' : 'lg:justify-center lg:p-3 gap-3 px-3 py-2.5',
                                    isActive
                                        ? 'bg-primary/10 text-primary'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                )}
                            >
                                {/* Left accent bar for active state */}
                                {isActive && (
                                    <span className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-full bg-primary" />
                                )}

                                <item.icon className={cn(
                                    'w-[18px] h-[18px] transition-colors flex-shrink-0',
                                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                                )} />
                                <span className={cn(
                                    "flex-1 truncate text-left font-medium",
                                    !isOpen && "lg:hidden"
                                )}>
                                    {item.name}
                                </span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Quick Import card */}
                {(userRole === 'ADMIN' || userRole === 'MANAGER') && (
                    <div className={cn(
                        "border-t border-border transition-all duration-300",
                        isOpen ? "p-3" : "lg:p-2 p-3"
                    )}>
                        <div className={cn(
                            "rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:border-primary/20",
                            !isOpen && "lg:hidden"
                        )}
                            style={{ boxShadow: 'var(--shadow-card)' }}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 icon-badge-success border border-emerald-500/20">
                                    <UserPlus className="w-4.5 h-4.5" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-foreground">Quick Import</p>
                                    <p className="text-xs text-muted-foreground">Upload Excel file</p>
                                </div>
                            </div>
                            <Link
                                href="/import"
                                onClick={() => {
                                    if (window.innerWidth < 1024) close()
                                }}
                                className="block w-full py-2 text-center text-xs font-semibold rounded-md bg-primary/10 text-primary hover:bg-primary/15 transition-colors border border-primary/20"
                            >
                                Import Now →
                            </Link>
                        </div>
                        {!isOpen && (
                            <Link
                                href="/import"
                                title="Quick Import"
                                className="hidden lg:flex items-center justify-center p-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-200"
                            >
                                <UserPlus className="w-5 h-5" />
                            </Link>
                        )}
                    </div>
                )}
            </aside>
        </>
    )
}
