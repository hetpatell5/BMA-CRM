'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Bell, X, CheckCheck, Trash2,
    Users, FileSpreadsheet, UserCheck,
    ClipboardList, ArrowUpRight, Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationStore, Notification } from '@/stores/notificationStore'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'

// ── Icon per notification type ────────────────────────────────────────────────
function NotifIcon({ type }: { type: string }) {
    const map: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
        NEW_LEAD:        { icon: Users,          color: 'text-blue-500',   bg: 'bg-blue-500/10' },
        LEAD_ASSIGNED:   { icon: UserCheck,      color: 'text-purple-500', bg: 'bg-purple-500/10' },
        STUDENT_ASSIGNED:{ icon: UserCheck,      color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
        IMPORT_DONE:     { icon: FileSpreadsheet,color: 'text-emerald-500',bg: 'bg-emerald-500/10' },
        TASK_ASSIGNED:   { icon: ClipboardList,  color: 'text-amber-500',  bg: 'bg-amber-500/10' },
        TASK_UPDATED:    { icon: ClipboardList,  color: 'text-orange-500', bg: 'bg-orange-500/10' },
        NEW_ORDER:       { icon: Package,        color: 'text-teal-500',   bg: 'bg-teal-500/10' },
    }
    const m = map[type] || { icon: Bell, color: 'text-gray-500', bg: 'bg-gray-500/10' }
    return (
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', m.bg)}>
            <m.icon className={cn('w-4 h-4', m.color)} />
        </div>
    )
}

// ── Time-ago helper ───────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
    if (diff < 60)  return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
}

// ── Single notification row ───────────────────────────────────────────────────
function NotifRow({
    n,
    onRead,
    onDelete,
    onNavigate,
}: {
    n: Notification
    onRead: (ids: string[]) => void
    onDelete: (id: string) => void
    onNavigate: (n: Notification) => void
}) {
    return (
        <div
            className={cn(
                'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-all duration-150',
                'hover:bg-black/[0.04] dark:hover:bg-white/[0.05]',
                !n.isRead && 'bg-primary/[0.04] dark:bg-primary/[0.06]'
            )}
            onClick={() => {
                if (!n.isRead) onRead([n.id])
                if (n.link) onNavigate(n)
            }}
        >
            <NotifIcon type={n.type} />

            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className={cn('text-sm leading-snug', n.isRead ? 'font-normal text-foreground/80' : 'font-semibold text-foreground')}>
                        {n.title}
                    </p>
                    {!n.isRead && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {n.message}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1 font-medium">
                    {timeAgo(n.createdAt)}
                </p>
            </div>

            {/* Delete on hover */}
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(n.id) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 flex-shrink-0 mt-0.5"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}

// ── Main Bell Component ───────────────────────────────────────────────────────
export function NotificationBell() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const { notifications, unreadCount } = useNotificationStore()
    const { markRead, markAllRead, deleteNotification } = useNotifications()

    // Close when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleNavigate = (n: Notification) => {
        setOpen(false)
        if (n.link) router.push(n.link)
    }

    return (
        <div ref={ref} className="relative">
            {/* Bell button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen((v) => !v)}
                className="relative rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Notifications"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className={cn(
                        'absolute top-1 right-1 min-w-[18px] h-[18px] rounded-full',
                        'bg-red-500 text-white text-[10px] font-bold',
                        'flex items-center justify-center px-1',
                        'ring-2 ring-background',
                        unreadCount > 0 && 'animate-[pulse_2s_ease-in-out_3]'
                    )}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </Button>

            {/* Dropdown panel */}
            {open && (
                <>
                    {/* Backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

                    <div className={cn(
                        'absolute right-0 top-full mt-2 z-50 animate-fade-in',
                        'w-[360px] max-w-[calc(100vw-1rem)]',
                        'glass-dropdown rounded-2xl shadow-2xl overflow-hidden',
                        'border border-black/[0.08] dark:border-white/[0.08]'
                    )}>
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                            <div className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-primary" />
                                <h3 className="font-semibold text-sm">Notifications</h3>
                                {unreadCount > 0 && (
                                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">
                                        {unreadCount} new
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={() => markAllRead()}
                                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
                                    >
                                        <CheckCheck className="w-3.5 h-3.5" />
                                        Mark all read
                                    </button>
                                )}
                                <button
                                    onClick={() => setOpen(false)}
                                    className="p-1.5 rounded-lg hover:bg-black/[0.06] dark:hover:bg-white/[0.06] text-muted-foreground transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="max-h-[420px] overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                            {notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                    <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                                        <Bell className="w-7 h-7 text-muted-foreground/40" />
                                    </div>
                                    <p className="text-sm text-muted-foreground font-medium">All caught up!</p>
                                    <p className="text-xs text-muted-foreground/60">No notifications yet.</p>
                                </div>
                            ) : (
                                notifications.map((n) => (
                                    <NotifRow
                                        key={n.id}
                                        n={n}
                                        onRead={markRead}
                                        onDelete={deleteNotification}
                                        onNavigate={handleNavigate}
                                    />
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        {notifications.length > 0 && (
                            <div className="border-t border-black/[0.06] dark:border-white/[0.06] px-4 py-2.5">
                                <button
                                    onClick={() => { setOpen(false); router.push('/notifications') }}
                                    className="w-full flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium py-1 rounded-lg hover:bg-primary/5 transition-colors"
                                >
                                    View all notifications <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}

