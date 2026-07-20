'use client'

import { useQuery } from '@tanstack/react-query'
import { followUpsAPI } from '@/lib/api'
import { format, isBefore, addDays, startOfDay } from 'date-fns'
import { BellRing, Phone, Users, ChevronRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import DOMPurify from 'dompurify'

function stripHtml(html: string) {
    if (!html) return ''
    return html.replace(/<[^>]*>?/gm, '')
}

interface FollowUpEntry {
    id: string
    name: string
    number: string
    description: string
    followupDate: string
    status: string
    createdBy?: { id: number; fullName: string }
}

interface UserGroup {
    userId: number
    fullName: string
    entries: FollowUpEntry[]
    overdueCount: number
    todayCount: number
}

export function TeamFollowUpsWidget() {
    const { data, isLoading } = useQuery({
        queryKey: ['follow-ups-team-today'],
        queryFn: async () => {
            const res = await followUpsAPI.getTeamToday()
            return res.data.data as FollowUpEntry[]
        },
        staleTime: 60_000,
    })

    const { data: statsData, isLoading: statsLoading } = useQuery({
        queryKey: ['follow-ups-stats'],
        queryFn: async () => {
            const res = await followUpsAPI.getStats()
            return res.data.data as Array<{
                user: { id: number; fullName: string }
                pending: number
                completed: number
            }>
        },
        staleTime: 60_000,
    })

    // Group today's data by user
    const userGroups: UserGroup[] = []
    if (data) {
        const now = new Date()
        const todayEnd = addDays(startOfDay(now), 1)
        const map: Record<number, UserGroup> = {}

        for (const f of data) {
            const uid = f.createdBy?.id ?? 0
            if (!map[uid]) {
                map[uid] = {
                    userId: uid,
                    fullName: f.createdBy?.fullName ?? 'Unknown',
                    entries: [],
                    overdueCount: 0,
                    todayCount: 0,
                }
            }
            const fDate = new Date(f.followupDate)
            if (isBefore(fDate, now)) map[uid].overdueCount++
            else map[uid].todayCount++
            map[uid].entries.push(f)
        }
        userGroups.push(...Object.values(map).sort((a, b) => (b.overdueCount + b.todayCount) - (a.overdueCount + a.todayCount)))
    }

    const totalPending = data?.length ?? 0

    return (
        <div className="rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4 md:p-6 shadow-lg dark:shadow-none">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <BellRing className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-foreground">Team Follow-ups</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {isLoading ? '…' : `${totalPending} pending across all members`}
                        </p>
                    </div>
                </div>
                <Link
                    href="/follow-ups"
                    className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all border border-white/5 flex items-center gap-1"
                >
                    View All <ChevronRight className="w-3 h-3" />
                </Link>
            </div>

            {/* Performance Summary Bar */}
            {statsLoading ? (
                <div className="space-y-2 mb-5">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
                </div>
            ) : statsData && statsData.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                    {statsData.slice(0, 6).map((s) => {
                        const total = s.pending + s.completed
                        const pct = total > 0 ? Math.round((s.completed / total) * 100) : 0
                        return (
                            <Link
                                key={s.user.id}
                                href={`/follow-ups?userId=${s.user.id}`}
                                className="relative group rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 px-3 py-2.5 hover:border-amber-500/30 transition-all"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[10px] font-bold text-amber-600 dark:text-amber-400 shrink-0">
                                        {s.user.fullName.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                                        {s.user.fullName.split(' ')[0]}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] mb-1.5">
                                    <span className="text-amber-600 dark:text-amber-400 font-bold">{s.pending} pending</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">{pct}%</span>
                                </div>
                                <div className="h-1 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-700"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            ) : null}

            {/* Today's Urgent Follow-ups by User */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
            ) : userGroups.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500/50" />
                    <p className="text-sm font-medium">All caught up!</p>
                    <p className="text-xs mt-1">No pending follow-ups for today.</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-none pr-1">
                    {userGroups.map((group) => (
                        <div
                            key={group.userId}
                            className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 overflow-hidden"
                        >
                            {/* User header row */}
                            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200/60 dark:border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                        {group.fullName.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{group.fullName}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {group.overdueCount > 0 && (
                                        <span className="text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-md border border-red-500/20">
                                            {group.overdueCount} overdue
                                        </span>
                                    )}
                                    {group.todayCount > 0 && (
                                        <span className="text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-500/20">
                                            {group.todayCount} today
                                        </span>
                                    )}
                                </div>
                            </div>
                            {/* Top 3 entries */}
                            <div className="divide-y divide-slate-100 dark:divide-white/5">
                                {group.entries.slice(0, 3).map((f) => {
                                    const isOverdue = isBefore(new Date(f.followupDate), new Date())
                                    return (
                                        <div
                                            key={f.id}
                                            className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-100 dark:hover:bg-white/[0.03] transition-colors"
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-amber-500'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">{f.name}</span>
                                                    <span className="text-[11px] text-primary font-mono shrink-0">{f.number}</span>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                    {stripHtml(f.description)}
                                                </p>
                                            </div>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${isOverdue ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}>
                                                {format(new Date(f.followupDate), 'MMM dd')}
                                            </span>
                                        </div>
                                    )
                                })}
                                {group.entries.length > 3 && (
                                    <div className="px-3.5 py-2 text-center">
                                        <Link
                                            href={`/follow-ups?userId=${group.userId}`}
                                            className="text-[11px] font-medium text-primary hover:underline"
                                        >
                                            +{group.entries.length - 3} more
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
