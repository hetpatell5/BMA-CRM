'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import {
    Bell,
    Search,
    ChevronDown,
    LogOut,
    User,
    Settings,
    Moon,
    Sun,
    Menu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/authStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useThemeStore } from '@/stores/themeStore'
import { getInitials, cn } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/notification-bell'

export function Header() {
    const router = useRouter()
    const { user, logout, updateUser } = useAuthStore()
    const { isOpen, toggle: toggleSidebar } = useSidebarStore()
    const { theme, toggle: toggleTheme } = useThemeStore()
    const [showUserMenu, setShowUserMenu] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [showSearch, setShowSearch] = useState(false)
    const isLight = theme === 'light'

    // Ensure we have full user details (like staffRole) which might be missing from legacy caches
    const { data: profileData } = useQuery({
        queryKey: ['header-auth-sync'],
        queryFn: async () => (await api.get('/auth/me')).data.data,
        staleTime: 5 * 60 * 1000 // 5 minutes
    })

    useEffect(() => {
        if (profileData && (
            profileData.staffRole !== user?.staffRole || 
            profileData.avatar !== user?.avatar || 
            profileData.fullName !== user?.fullName
        )) {
            updateUser(profileData)
        }
    }, [profileData, user?.staffRole, user?.avatar, user?.fullName, updateUser])

    const handleLogout = () => {
        logout()
        window.location.href = '/login'
    }

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (searchQuery.trim()) {
            router.push(`/orders?search=${encodeURIComponent(searchQuery)}`)
            setShowSearch(false)
        }
    }

    const menuItemClass = isLight
        ? 'w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-black/[0.05] active:bg-black/[0.08] transition-all duration-150'
        : 'w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl hover:bg-white/[0.08] active:bg-white/[0.12] transition-all duration-150'

    const dividerClass = isLight
        ? 'my-1.5 h-px bg-black/[0.07] mx-1'
        : 'my-1.5 h-px bg-white/[0.08] mx-1'

    const topInfoClass = isLight
        ? 'px-3 py-2.5 mb-1 rounded-xl bg-black/[0.05]'
        : 'px-3 py-2.5 mb-1 rounded-xl bg-white/[0.06]'

    return (
        <header className="h-16 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between px-0 md:pr-6 sticky top-0 z-30">
            {/* Left side - Hamburger + Search */}
            <div className="flex items-center flex-1 transition-all duration-300 gap-4">
                {/* Hamburger Menu */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className={cn(
                        "hover:bg-black/5 dark:hover:bg-white/10 flex-shrink-0 transition-all duration-300",
                        isOpen ? "-ml-4" : "-ml-1"
                    )}
                >
                    <Menu className="w-5 h-5" />
                </Button>

                {/* Search – Desktop */}
                <form onSubmit={handleSearch} className="hidden md:block flex-1 max-w-md">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Search orders, leads..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 w-full"
                        />
                    </div>
                </form>

                {/* Search Toggle – Mobile */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowSearch(!showSearch)}
                    className="md:hidden"
                >
                    <Search className="w-5 h-5" />
                </Button>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-1 md:gap-2">

                {/* ── Theme Toggle ─────────────────────────────── */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
                    className="relative group rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                >
                    {/* Sun (shown in dark mode to invite switching to light) */}
                    <Sun
                        className={`w-[18px] h-[18px] absolute transition-all duration-300 text-amber-400 ${isLight
                                ? 'opacity-0 rotate-90 scale-50'
                                : 'opacity-100 rotate-0 scale-100'
                            }`}
                    />
                    {/* Moon (shown in light mode to invite switching to dark) */}
                    <Moon
                        className={`w-[18px] h-[18px] absolute transition-all duration-300 text-indigo-400 ${isLight
                                ? 'opacity-100 rotate-0 scale-100'
                                : 'opacity-0 -rotate-90 scale-50'
                            }`}
                    />
                    <span className="sr-only">Toggle theme</span>
                </Button>

                {/* Notifications */}
                <NotificationBell />

                {/* User menu */}
                <div className="relative">
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className={`flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 rounded-xl transition-colors ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                            }`}
                    >
                        <div className="w-9 h-9 rounded-full overflow-hidden gradient-primary flex items-center justify-center text-sm font-bold text-white border border-black/5 dark:border-white/5 shrink-0">
                            {user?.avatar ? (
                                <img src={user.avatar} alt={user.fullName || 'User'} className="w-full h-full object-cover" />
                            ) : (
                                user ? getInitials(user.fullName) : 'U'
                            )}
                        </div>
                        <div className="text-left hidden sm:block">
                            <p className="text-sm font-medium truncate max-w-[120px]">{user?.fullName || 'User'}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                                {user?.role === 'STAFF' && user?.staffRole
                                    ? (user.staffRole === 'BOTH' ? 'Guide & Expert' : user.staffRole.toLowerCase())
                                    : user?.role?.toLowerCase()}
                            </p>
                        </div>
                        <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block" />
                    </button>

                    {/* Dropdown */}
                    {showUserMenu && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowUserMenu(false)}
                            />
                            <div className="absolute right-0 top-full mt-2 w-56 glass-dropdown rounded-2xl p-2 z-[100] animate-fade-in overflow-hidden shadow-2xl">
                                {/* Top user info */}
                                <div className={topInfoClass}>
                                    <p className="text-sm font-semibold truncate">{user?.fullName}</p>
                                    <p className="text-xs text-muted-foreground/80 truncate">{user?.email}</p>
                                </div>

                                <div className={dividerClass} />

                                <Link
                                    href="/profile"
                                    onClick={() => setShowUserMenu(false)}
                                    className={menuItemClass}
                                >
                                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                                        <User className="w-3.5 h-3.5 text-blue-500" />
                                    </div>
                                    <span>Profile</span>
                                </Link>

                                <Link
                                    href="/settings"
                                    onClick={() => setShowUserMenu(false)}
                                    className={menuItemClass}
                                >
                                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                                        <Settings className="w-3.5 h-3.5 text-purple-500" />
                                    </div>
                                    <span>Settings</span>
                                </Link>

                                {/* Theme toggle inside menu too */}
                                <button
                                    onClick={() => { toggleTheme(); setShowUserMenu(false) }}
                                    className={menuItemClass}
                                >
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                        {isLight
                                            ? <Moon className="w-3.5 h-3.5 text-indigo-500" />
                                            : <Sun className="w-3.5 h-3.5 text-amber-500" />
                                        }
                                    </div>
                                    <span>{isLight ? 'Dark mode' : 'Light mode'}</span>
                                </button>

                                <div className={dividerClass} />

                                <button
                                    onClick={handleLogout}
                                    className={`${menuItemClass} text-red-500`}
                                >
                                    <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                                        <LogOut className="w-3.5 h-3.5 text-red-500" />
                                    </div>
                                    <span>Sign out</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Mobile Search Bar */}
            {showSearch && (
                <div className="absolute left-0 right-0 top-full bg-background/95 backdrop-blur-xl border-b border-border p-4 md:hidden animate-fade-in">
                    <form onSubmit={handleSearch}>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Search orders, leads..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 w-full"
                                autoFocus
                            />
                        </div>
                    </form>
                </div>
            )}
        </header>
    )
}

