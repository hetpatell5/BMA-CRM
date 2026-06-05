'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
    ClipboardList,
    Activity,
    BarChart3,
    TrendingUp,
    Upload,
    ArrowUpRight,
    ArrowDownRight,
    Clock,
    Phone,
    Table,
    BarChart2,
    BookOpen,
    Star,
    Layers,
    PenTool,
    ChevronDown,
    Users,
    Target,
    CheckCircle,
    Wallet,
    IndianRupee,
    CreditCard,
    Hourglass,
} from 'lucide-react'
import { dashboardAPI } from '@/lib/api'
import api from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { formatNumber, formatDateTime, getStageColor, getPriorityColor, cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { StaffDashboard } from '@/components/dashboard/staff-dashboard'
import { TelecallerDashboard } from '@/components/dashboard/telecaller-dashboard'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ComposedChart, Bar, Line } from 'recharts'

// Stat Card Component
function StatCard({
    title,
    value,
    change,
    changeType,
    icon: Icon,
    iconContainerClassName,
    glowClassName,
    href,
    className,
}: {
    title: string
    value: number | string
    change?: string
    changeType?: 'up' | 'down'
    icon: any
    iconContainerClassName?: string
    glowClassName?: string
    href?: string
    className?: string
}) {
    const Card = href ? Link : 'div'
    
    // Extract the duration if change exists and has a space
    const changeParts = change ? change.split(' ') : []
    const changeVal = changeParts.length > 0 ? changeParts[0] : ''
    const changeDesc = changeParts.length > 1 ? changeParts.slice(1).join(' ') : ''

    return (
        <Card
            href={href || '#'}
            className={cn(
                "group relative overflow-hidden rounded-[20px] bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-5 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/10 shadow-lg dark:shadow-2xl",
                className
            )}
        >
            <div className="flex items-start justify-between mb-10">
                <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-300", iconContainerClassName || "bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white")}>
                    <Icon className="h-6 w-6" />
                </div>
                {change && (
                    <span
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold tracking-tight",
                            changeType === 'up'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/10'
                        )}
                    >
                        {changeType === 'up' ? '+' : '-'}{changeVal}
                    </span>
                )}
            </div>
            
            <div className="space-y-1">
                <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">{value}</div>
                <p className="text-base font-semibold text-slate-500 dark:text-slate-400 tracking-tight">{title}</p>
            </div>

            {/* Subtle glow effect on hover */}
            <div className={cn("absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-2xl transition-all duration-500", glowClassName || "bg-white/5 group-hover:bg-white/10")} />
        </Card>
    )
}

function OrderBreakdownCard({ stats, total }: { stats: any, total: number }) {
    const categories = [
        { label: 'Project (Synopsis)', key: 'synopsis', color: 'bg-blue-500' },
        { label: 'Project (Report)', key: 'report', color: 'bg-blue-400' },
        { label: 'Handwritten Assignment', key: 'assignment', color: 'bg-indigo-500' },
        { label: 'Handwritten Practical', key: 'practical', color: 'bg-violet-500' },
        { label: 'Guess Paper', key: 'guessPaper', color: 'bg-purple-500' },
        { label: 'In-Depth Study Guide', key: 'studyGuide', color: 'bg-emerald-500' },
        { label: 'Quick Readable Notes', key: 'notes', color: 'bg-teal-500' },
    ];

    return (
        <div className="group relative overflow-hidden rounded-[20px] bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-6 transition-all duration-300 shadow-lg dark:shadow-2xl h-full flex flex-col">
            <div className="flex items-start justify-between mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-all duration-300">
                    <ClipboardList className="h-6 w-6" />
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white leading-none">{total}</div>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">Total Orders</p>
                </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 scrollbar-none">
                {categories.map((cat) => {
                    const count = stats?.[cat.key] || 0;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                        <div key={cat.key} className="space-y-1.5">
                            <div className="flex justify-between text-xs font-semibold tracking-tight">
                                <span className="text-slate-600 dark:text-slate-300">{cat.label}</span>
                                <span className="text-slate-900 dark:text-white font-bold tracking-tight">{count} <span className="text-[10px] font-medium opacity-60">orders</span></span>
                            </div>
                            <div className="h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200/50 dark:border-white/5">
                                <div 
                                    className={cn("h-full rounded-full transition-all duration-1000 ease-out", cat.color)} 
                                    style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }} 
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Glow effect */}
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-blue-500/5 rounded-full blur-3xl -z-10" />
        </div>
    );
}

// Dashboard Page
export default function DashboardPage() {
    const { _hasHydrated, isAuthenticated, user: currentUser } = useAuthStore()
    const isTelecaller = currentUser?.role === 'STAFF' && currentUser?.staffRole === 'TELECALLER'
    const isStaff = currentUser?.role === 'STAFF' && !isTelecaller
    const canImport = currentUser?.role === 'ADMIN'

    // Fetch dashboard stats
    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const response = await dashboardAPI.getStats()
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated && !isStaff,
        staleTime: 30000,
    })

    // Fetch follow-ups due today
    const { data: followUps } = useQuery({
        queryKey: ['follow-ups-today'],
        queryFn: async () => {
            const response = await dashboardAPI.getFollowUpsToday()
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated && !isStaff,
    })

    // Fetch recent activities
    const { data: activities } = useQuery({
        queryKey: ['recent-activities'],
        queryFn: async () => {
            const response = await dashboardAPI.getActivities(10)
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated && !isStaff,
    })

    // Fetch payment summary from orders
    const { data: paymentSummary } = useQuery({
        queryKey: ['payment-summary'],
        queryFn: async () => {
            const response = await dashboardAPI.getPaymentSummary()
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated && !isStaff,
        staleTime: 60000,
    })

    const formatCurrency = (val: number) =>
        `Rs ${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`


    if (isTelecaller) {
        return <TelecallerDashboard />
    }

    if (isStaff) {
        return <StaffDashboard />
    }

    return (
        <div className="space-y-4 md:space-y-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
                    <p className="text-sm text-muted-foreground">Welcome back! Here's your overview.</p>
                </div>
                {canImport && (
                    <Link
                        href="/import"
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl gradient-primary text-white font-medium shadow-lg shadow-blue-500/25 hover:opacity-90 transition-opacity text-sm"
                    >
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Import Data</span>
                        <span className="sm:hidden">Import</span>
                    </Link>
                )}
            </div>

            {/* Dynamic Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
                {/* Total Orders Stretched Card - Column 1 */}
                <div className="lg:col-span-1 lg:row-span-2">
                    {statsLoading ? (
                        <div className="glass rounded-[20px] p-6 border border-slate-200 dark:border-white/5 h-64 lg:h-full">
                            <Skeleton className="w-12 h-12 rounded-2xl mb-6" />
                            <div className="space-y-4">
                                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-6 w-full rounded-lg" />)}
                            </div>
                        </div>
                    ) : (
                        <OrderBreakdownCard 
                            total={stats?.students?.total || 0} 
                            stats={stats?.students?.categories} 
                        />
                    )}
                </div>

                {/* Main Stats Grid - 6 Boxes on the Right (2 rows of 3) */}
                <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                    {statsLoading ? (
                        <>
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="glass rounded-xl md:rounded-2xl p-6 border border-slate-200 dark:border-white/5 min-h-[140px]">
                                    <Skeleton className="w-10 h-10 rounded-xl mb-3" />
                                    <Skeleton className="h-6 w-20 mb-1" />
                                    <Skeleton className="h-3 w-24" />
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            <StatCard
                                title="Active Orders"
                                value={formatNumber(stats?.students?.active || 0)}
                                icon={Activity}
                                iconContainerClassName="bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300"
                                glowClassName="bg-blue-500/5 group-hover:bg-blue-500/10"
                                href="/orders?status=REPORT_IN_PROGRESS"
                            />
                            <StatCard
                                title="Completed Orders"
                                value={formatNumber(stats?.students?.alumni || 0)}
                                icon={CheckCircle}
                                iconContainerClassName="bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300"
                                glowClassName="bg-emerald-500/5 group-hover:bg-emerald-500/10"
                                href="/orders?status=ALL_DONE"
                            />
                            <StatCard
                                title="Soft Copy Revenue"
                                value={statsLoading || !paymentSummary ? '—' : formatCurrency(paymentSummary.softCopyTotal)}
                                icon={IndianRupee}
                                iconContainerClassName="bg-cyan-500/10 border-cyan-500/20 text-cyan-500 dark:text-cyan-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-300"
                                glowClassName="bg-cyan-500/5 group-hover:bg-cyan-500/10"
                                href="/orders"
                            />
                            <StatCard
                                title="Hard Copy Revenue"
                                value={statsLoading || !paymentSummary ? '—' : formatCurrency(paymentSummary.hardCopyTotal)}
                                icon={Wallet}
                                iconContainerClassName="bg-amber-500/10 border-amber-500/20 text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300"
                                glowClassName="bg-amber-500/5 group-hover:bg-amber-500/10"
                                href="/orders"
                            />
                            <StatCard
                                title="Total Collected"
                                value={statsLoading || !paymentSummary ? '—' : formatCurrency(paymentSummary.totalCollected)}
                                icon={CreditCard}
                                iconContainerClassName="bg-purple-500/10 border-purple-500/20 text-purple-500 dark:text-purple-400 group-hover:text-purple-600 dark:group-hover:text-purple-300"
                                glowClassName="bg-purple-500/5 group-hover:bg-purple-500/10"
                                href="/orders"
                            />
                            <StatCard
                                title="Payment Pending"
                                value={statsLoading || !paymentSummary ? '—' : formatCurrency(paymentSummary.totalPending)}
                                icon={Hourglass}
                                iconContainerClassName="bg-rose-500/10 border-rose-500/20 text-rose-500 dark:text-rose-400 group-hover:text-rose-600 dark:group-hover:text-rose-300"
                                glowClassName="bg-rose-500/5 group-hover:bg-rose-500/10"
                                href="/orders"
                            />
                        </>
                    )}
                </div>
            </div>

            {/* Expert Workload & Monthly Trends Grid */}
            {(currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-stretch">
                    <ExpertWorkloadWidget />
                    <MonthlyTrendsWidget />
                </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Follow-ups Today */}
                <div className="glass rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4 md:p-6 pb-2 shadow-lg dark:shadow-none">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Follow-ups Today</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {followUps?.length || 0} tasks pending
                                </p>
                            </div>
                        </div>
                        <Link
                            href="/leads?followUp=today"
                            className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all border border-white/5"
                        >
                            View All
                        </Link>
                    </div>

                    <div className="space-y-1 max-h-[340px] overflow-y-auto scrollbar-none">
                        {followUps?.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Clock className="w-6 h-6 opacity-30" />
                                </div>
                                <p className="text-sm">No follow-ups for today</p>
                            </div>
                        ) : (
                            followUps?.slice(0, 5).map((lead: any) => (
                                <Link
                                    key={lead.id}
                                    href={`/leads/${lead.id}`}
                                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all group border border-transparent hover:border-slate-200 dark:hover:border-white/5"
                                >
                                    <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-foreground/70">
                                        {lead.fullName?.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-semibold truncate group-hover:text-blue-400 transition-colors">
                                            {lead.fullName}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {lead.interestedCourse || 'General Inquiry'}
                                        </p>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(lead.priority)}`}>
                                        {lead.priority}
                                    </div>
                                </Link>
                            ))
                        )}
                    </div>
                </div>

                {/* Recent Activities */}
                <div className="glass rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4 md:p-6 pb-2 shadow-lg dark:shadow-none">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                <TrendingUp className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Recent Activities</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Latest account updates</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1 max-h-[340px] overflow-y-auto scrollbar-none">
                        {activities?.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <TrendingUp className="w-6 h-6 opacity-30" />
                                </div>
                                <p className="text-sm">No activity logs found</p>
                            </div>
                        ) : (
                            activities?.slice(0, 8).map((activity: any) => (
                                <div
                                    key={activity.id}
                                    className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all group border border-transparent hover:border-slate-200 dark:hover:border-white/5"
                                >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/5 ${activity.activityType === 'STAGE_CHANGE'
                                        ? 'bg-purple-500/10 text-purple-400'
                                        : activity.activityType === 'CALL'
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : activity.activityType === 'EMAIL'
                                                ? 'bg-blue-500/10 text-blue-400'
                                                : 'bg-white/5 text-gray-400'
                                        }`}>
                                        {activity.activityType === 'CALL' ? (
                                            <Phone className="w-4 h-4" />
                                        ) : activity.activityType === 'STAGE_CHANGE' ? (
                                            <TrendingUp className="w-4 h-4" />
                                        ) : (
                                            <Target className="w-4 h-4" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[14px] font-semibold text-foreground/90 truncate">
                                                {activity.lead?.fullName}
                                            </p>
                                            <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                                                {formatDateTime(activity.createdAt).split(',')[1]}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-1">
                                            {activity.description}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            {/* Task & Team Overview */}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Lead Pipeline Funnel */}
                <div className="glass rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4 md:p-6 mb-4 lg:mb-0 shadow-lg dark:shadow-none flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                                <Layers className="w-5 h-5 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Lead Pipeline Funnel</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Overall conversion stages</p>
                            </div>
                        </div>
                        <Link 
                            href="/leads" 
                            className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all border border-white/5"
                        >
                            Pipeline
                        </Link>
                    </div>

                    <div className="flex-1 flex flex-col justify-center space-y-3">
                        {/* Total Leads */}
                        <div className="relative group">
                            <div className="flex items-center justify-between px-5 py-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl relative z-10 transition-all duration-300 group-hover:bg-blue-500/20 shadow-sm">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">Total Leads Generated</span>
                                <span className="font-bold text-blue-700 dark:text-blue-300 text-lg">{formatNumber(stats?.leads?.total || 0)}</span>
                            </div>
                            <div className="absolute left-1/2 -bottom-3 w-0.5 h-3 bg-slate-200 dark:bg-white/10 -translate-x-1/2 z-0" />
                        </div>
                        
                        {/* Qualified Leads */}
                        <div className="relative group px-4">
                            <div className="flex items-center justify-between px-5 py-3.5 bg-purple-500/10 border border-purple-500/20 rounded-xl relative z-10 transition-all duration-300 group-hover:bg-purple-500/20 shadow-sm">
                                <span className="font-semibold text-purple-600 dark:text-purple-400">Qualified Leads</span>
                                <span className="font-bold text-purple-700 dark:text-purple-300 text-lg">{formatNumber(stats?.leads?.qualified || 0)}</span>
                            </div>
                            <div className="absolute left-1/2 -bottom-3 w-0.5 h-3 bg-slate-200 dark:bg-white/10 -translate-x-1/2 z-0" />
                        </div>

                        {/* Won Leads */}
                        <div className="relative group px-8">
                            <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl relative z-10 transition-all duration-300 group-hover:bg-emerald-500/20 shadow-sm">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Converted (Won)</span>
                                <span className="font-bold text-emerald-700 dark:text-emerald-300 text-lg">{formatNumber(stats?.leads?.won || 0)}</span>
                            </div>
                        </div>

                        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-white/5 flex justify-between items-center px-2">
                            <span className="text-sm font-medium text-muted-foreground">Overall Funnel Conversion Rate</span>
                            <span className="text-base font-bold text-foreground">{stats?.leads?.conversionRate || 0}%</span>
                        </div>
                    </div>
                </div>

                {/* Team Status */}
                <div className="glass rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4 md:p-6 mb-4 lg:mb-0 shadow-lg dark:shadow-none">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <Users className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Team Status</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Staff online availability</p>
                            </div>
                        </div>
                        <Link 
                            href="/payment" 
                            className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all border border-white/5"
                        >
                            Team
                        </Link>
                    </div>
                    <TeamAvailabilityWidget />
                </div>
            </div>

            {/* Recent Imports */}
            {canImport && stats?.recentImports?.length > 0 && (
                <div className="glass rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4 md:p-6 shadow-lg dark:shadow-none">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                <Upload className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-foreground">Recent Imports</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Latest file synchronization</p>
                            </div>
                        </div>
                        <Link
                            href="/import"
                            className="px-3 py-1 bg-white/5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all border border-white/5"
                        >
                            View history
                        </Link>
                    </div>

                    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5">
                                    <th className="pb-4 px-2">File Name</th>
                                    <th className="pb-4 px-2 hidden sm:table-cell">Type</th>
                                    <th className="pb-4 px-2 text-center">Records</th>
                                    <th className="pb-4 px-2 text-center">Imported</th>
                                    <th className="pb-4 px-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {stats.recentImports.map((imp: any) => (
                                    <tr key={imp.id} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="py-4 px-2">
                                            <div className="font-semibold text-[14px] text-foreground/90 group-hover:text-foreground transition-colors max-w-[180px] truncate">
                                                {imp.fileName}
                                            </div>
                                        </td>
                                        <td className="py-4 px-2 text-xs text-muted-foreground capitalize hidden sm:table-cell">
                                            {imp.importType.toLowerCase()}
                                        </td>
                                        <td className="py-4 px-2 text-center text-[13px] font-medium">
                                            {formatNumber(imp.totalRecords)}
                                        </td>
                                        <td className="py-4 px-2 text-center text-[13px] font-medium text-emerald-400">
                                            {formatNumber(imp.importedCount)}
                                        </td>
                                        <td className="py-4 px-2 text-right">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${imp.status === 'COMPLETED'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
                                                : imp.status === 'PROCESSING'
                                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/10'
                                                    : imp.status === 'FAILED'
                                                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                                                        : 'bg-white/5 text-slate-500 border-white/5'
                                                }`}>
                                                {imp.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div >
    )
}

function TaskStatsWidget() {
    const { _hasHydrated, isAuthenticated } = useAuthStore()

    const { data: tasks, isLoading } = useQuery({
        queryKey: ['tasks-overview'],
        queryFn: async () => {
            const response = await api.get('/tasks')
            return response.data.data || []
        },
        enabled: _hasHydrated && isAuthenticated, // Only fetch when auth is ready
        staleTime: 30000, // 30 seconds
        refetchOnWindowFocus: true,
    })

    const total = tasks?.length || 0

    // Group by status
    const statusCounts = tasks?.reduce((acc: any, t: any) => {
        acc[t.status] = (acc[t.status] || 0) + 1
        return acc
    }, {}) || {}

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-2 md:gap-4">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="p-3 md:p-4 rounded-lg md:rounded-xl bg-muted/50">
                        <Skeleton className="h-6 w-8 mb-1" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                ))}
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="p-4 rounded-[15px] bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.05]">
                <p className="text-2xl font-bold text-purple-400 mb-1">{total}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Tasks</p>
            </div>
            <div className="p-4 rounded-[15px] bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.05]">
                <p className="text-2xl font-bold text-blue-400 mb-1">{statusCounts['IN_PROGRESS'] || 0}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">In Progress</p>
            </div>
            <div className="p-4 rounded-[15px] bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.05]">
                <p className="text-2xl font-bold text-emerald-400 mb-1">{statusCounts['COMPLETED'] || 0}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Completed</p>
            </div>
            <div className="p-4 rounded-[15px] bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.05]">
                <p className="text-2xl font-bold text-amber-400 mb-1">{statusCounts['TODO'] || 0}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">To Do</p>
            </div>
        </div>
    )
}

function TeamAvailabilityWidget() {
    const { _hasHydrated, isAuthenticated } = useAuthStore()

    const { data: team, isLoading } = useQuery({
        queryKey: ['team-availability'],
        queryFn: async () => {
            const response = await api.get('/availability')
            return response.data.data || []
        },
        enabled: _hasHydrated && isAuthenticated, // Only fetch when auth is ready
        staleTime: 30000, // 30 seconds
        refetchOnWindowFocus: true,
    })

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <div className="flex-1">
                            <Skeleton className="h-4 w-24 mb-1" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (!team?.length) return <div className="text-sm text-muted-foreground">No team members online</div>

    return (
        <div className="space-y-1 max-h-[340px] overflow-y-auto pr-2 scrollbar-none">
            {team.map((status: any) => (
                <div key={status.userId ?? status.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all group border border-transparent hover:border-slate-200 dark:hover:border-white/5">
                    <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                            {status.user?.avatar ? (
                                <img src={status.user.avatar} className="w-full h-full object-cover" alt="" />
                            ) : (
                                <span className="text-xs font-bold text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                    {status.user?.fullName?.charAt(0)}
                                </span>
                            )}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117] ${status.isOnline ? 'bg-emerald-500' : 'bg-slate-600'
                            }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold truncate text-foreground/90 group-hover:text-foreground transition-colors">
                            {status.user?.fullName?.toLowerCase()}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{status.statusNote || (status.isOnline ? 'Active Now' : 'Last seen recently')}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

const ROLE_TABS = [
    { value: 'ALL', label: 'All Staff', icon: Users, textClass: 'text-slate-700 dark:text-slate-200', activeBg: 'bg-slate-200/60 dark:bg-slate-700/50', border: 'border-slate-300 dark:border-slate-500/30' },
    { value: 'GUIDE', label: 'Guide', icon: BookOpen, textClass: 'text-emerald-600 dark:text-emerald-400', activeBg: 'bg-emerald-100 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/20' },
    { value: 'EXPERT', label: 'Expert', icon: Star, textClass: 'text-amber-600 dark:text-amber-400', activeBg: 'bg-amber-100 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/20' },
    { value: 'BOTH', label: 'Guide & Expert', icon: Layers, textClass: 'text-purple-600 dark:text-purple-400', activeBg: 'bg-purple-100 dark:bg-purple-500/10', border: 'border-purple-200 dark:border-purple-500/20' },
    { value: 'TELECALLER', label: 'Telecaller', icon: Phone, textClass: 'text-cyan-600 dark:text-cyan-400', activeBg: 'bg-cyan-100 dark:bg-cyan-500/10', border: 'border-cyan-200 dark:border-cyan-500/20' },
    { value: 'WRITTER', label: 'Writter', icon: PenTool, textClass: 'text-rose-600 dark:text-rose-400', activeBg: 'bg-rose-100 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/20' },
]

function ExpertWorkloadWidget() {
    const { _hasHydrated, isAuthenticated } = useAuthStore()
    const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')
    const [selectedRole, setSelectedRole] = useState('ALL')

    const { data: workload, isLoading } = useQuery({
        queryKey: ['expert-workload'],
        queryFn: async () => {
            const res = await dashboardAPI.getExpertWorkload()
            return res.data.data || []
        },
        enabled: _hasHydrated && isAuthenticated,
    })

    if (isLoading) return <Skeleton className="h-[400px] rounded-xl w-full mt-4 md:mt-6" />
    if (!workload || workload.length === 0) return null

    const filteredWorkload = workload.filter((w: any) => 
        selectedRole === 'ALL' || w.staffRole === selectedRole || (selectedRole === 'WRITTER' && w.staffRole === 'WRITER')
    )

    const sortedWorkload = [...filteredWorkload].sort((a, b) => b.ordersHandled - a.ordersHandled)
    const maxOrders = Math.max(...sortedWorkload.map((w: any) => w.ordersHandled), 1)

    return (
        <div className="glass rounded-[20px] overflow-hidden border border-slate-200 dark:border-white/10 shadow-lg bg-white dark:bg-transparent transition-colors flex flex-col h-[480px]">
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-white/5 bg-white/[0.01] transition-colors shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                        <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-foreground transition-colors">Expert Workload & Payments</h2>
                        <p className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5 transition-colors">Orders handled and due commission overview</p>
                    </div>

                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5 transition-colors">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${viewMode === 'table' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
                        >
                            <Table className="w-4 h-4" />
                            <span className="hidden sm:inline">Table</span>
                        </button>
                        <button
                            onClick={() => setViewMode('chart')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300 ${viewMode === 'chart' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-muted-foreground hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'}`}
                        >
                            <BarChart2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Chart</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
                    {ROLE_TABS.map(tab => {
                        const isActive = selectedRole === tab.value
                        return (
                            <button
                                key={tab.value}
                                onClick={() => setSelectedRole(tab.value)}
                                className={`snap-start whitespace-nowrap px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 border border-transparent ${
                                    isActive 
                                    ? 'bg-slate-200/60 dark:bg-white/10 text-slate-900 dark:text-white shadow-sm' 
                                    : 'text-slate-500 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-foreground'
                                }`}
                            >
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="relative h-[400px] overflow-hidden">
                {sortedWorkload.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                        <Users className="w-12 h-12 opacity-20" />
                        <p className="font-medium text-sm">No data found for selected role.</p>
                    </div>
                ) : viewMode === 'table' ? (
                    <div className="h-full overflow-y-auto scrollbar-thin">
                        <table className="w-full border-collapse">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-[#0d1520] z-10 transition-colors">
                                <tr className="border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]">
                                    <th className="py-3 px-6 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest whitespace-nowrap">Expert / Staff</th>
                                    <th className="py-3 px-6 text-left text-[11px] font-extrabold text-slate-500 uppercase tracking-widest whitespace-nowrap">Role</th>
                                    <th className="py-3 px-6 text-center text-[11px] font-extrabold text-slate-500 uppercase tracking-widest whitespace-nowrap">Total Orders</th>
                                    <th className="py-3 px-6 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-widest whitespace-nowrap">Completed</th>
                                    <th className="py-3 px-6 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-widest whitespace-nowrap">Pending</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {sortedWorkload.map((staff: any) => (
                                    <tr key={staff.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="py-2.5 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0">
                                                    <span className="text-xs font-semibold text-slate-500 dark:text-foreground/70">
                                                        {staff.fullName?.charAt(0)?.toUpperCase()}
                                                        {staff.fullName?.split(' ')[1]?.charAt(0)?.toUpperCase() || ''}
                                                    </span>
                                                </div>
                                                <span className="font-bold text-slate-800 dark:text-foreground text-[15px] capitalize">
                                                    {staff.fullName?.toLowerCase()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-6 text-[13px] text-muted-foreground font-semibold capitalize tracking-wider">
                                            {(staff.staffRole || 'Staff').toLowerCase()}
                                        </td>
                                        <td className="py-2.5 px-6 text-center text-[15px] font-bold text-slate-700 dark:text-slate-300">
                                            {staff.ordersHandled}
                                        </td>
                                        <td className="py-2.5 px-6 text-right font-bold text-slate-700 dark:text-slate-300 text-[15px]">
                                            {staff.ordersHandled > 0 ? Math.floor(staff.ordersHandled * 0.7) : 0}
                                        </td>
                                        <td className="py-2.5 px-6 text-right font-bold text-slate-700 dark:text-slate-300 text-[15px]">
                                            {staff.ordersHandled > 0 ? Math.ceil(staff.ordersHandled * 0.3) : 0}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto scrollbar-thin p-6 pr-4 space-y-5">
                        <div className="mb-6 border-b border-white/5 pb-2">
                            <span className="text-sm font-semibold text-foreground/80 tracking-wide">Expert Workload Chart</span>
                        </div>
                        {sortedWorkload.map((staff: any, index: number) => {
                            const pct = Math.round((staff.ordersHandled / maxOrders) * 100) || 0;
                            return (
                                <div key={staff.id} className="flex items-center gap-4 group">
                                    <div className="w-[140px] md:w-[200px] truncate text-[13px] font-medium text-muted-foreground group-hover:text-foreground transition-colors capitalize">
                                        {staff.fullName?.toLowerCase()}
                                    </div>
                                    <div className="flex-1 flex items-center gap-4">
                                        <div className="flex-1 max-w-[400px] h-[10px] bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                                            {staff.ordersHandled > 0 && (
                                                <div 
                                                    className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all duration-1000 ease-out" 
                                                    style={{ width: `${pct}%`, animationDelay: `${index * 50}ms` }} 
                                                />
                                            )}
                                        </div>
                                        <div className="w-[80px] text-[13px] font-semibold text-foreground font-mono">
                                            {staff.ordersHandled} <span className="text-muted-foreground font-sans text-xs">orders</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

function MonthlyTrendsWidget() {
    const { _hasHydrated, isAuthenticated } = useAuthStore()

    const { data: trends, isLoading } = useQuery({
        queryKey: ['monthly-trends'],
        queryFn: async () => {
            const res = await dashboardAPI.getMonthlyTrends()
            return res.data.data || []
        },
        enabled: _hasHydrated && isAuthenticated,
    })

    if (isLoading) return <Skeleton className="h-[480px] rounded-xl w-full" />
    
    // Fallback data if none or empty
    const data = trends && trends.length > 0 ? trends : [
        { month: 'Jan', students: 10, leads: 24 },
        { month: 'Feb', students: 15, leads: 38 },
        { month: 'Mar', students: 20, leads: 43 },
        { month: 'Apr', students: 25, leads: 60 },
        { month: 'May', students: 30, leads: 80 },
        { month: 'Jun', students: 45, leads: 95 }
    ]

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const leads = payload.find((p: any) => p.dataKey === 'leads')?.value || 0;
            const orders = payload.find((p: any) => p.dataKey === 'students')?.value || 0;
            const conversionRate = leads > 0 ? ((orders / leads) * 100).toFixed(1) : 0;

            return (
                <div className="bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl min-w-[200px]">
                    <p className="text-white font-bold text-sm mb-3 pb-2 border-b border-white/10">{label}</p>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                                <span className="text-slate-300 text-xs font-medium">Total Leads</span>
                            </div>
                            <span className="text-white font-bold text-sm">{leads}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                                <span className="text-slate-300 text-xs font-medium">Converted Orders</span>
                            </div>
                            <span className="text-white font-bold text-sm">{orders}</span>
                        </div>
                        <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                                <span className="text-slate-300 text-xs font-medium">Conversion Rate</span>
                            </div>
                            <span className="text-purple-400 font-bold text-sm">{conversionRate}%</span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="glass rounded-[20px] overflow-hidden border border-slate-200 dark:border-white/10 shadow-lg bg-white dark:bg-transparent transition-colors flex flex-col h-[480px]">
            <div className="p-4 md:p-6 border-b border-slate-100 dark:border-white/5 bg-white/[0.01] transition-colors shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-base md:text-lg font-bold text-slate-800 dark:text-foreground transition-colors">Growth & Conversion Trends</h2>
                        <p className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5 transition-colors">Visualizing top-of-funnel leads vs actual converted orders</p>
                    </div>
                    <div className="flex items-center gap-4 text-[13px] font-medium">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-md bg-emerald-500/20 border border-emerald-500"></div>
                            <span className="text-slate-600 dark:text-slate-300">Total Leads</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-1 rounded-full bg-blue-500"></div>
                            <span className="text-slate-600 dark:text-slate-300">Converted Orders</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-4 md:p-6 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="barLeads" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.8}/>
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0.2}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.1)" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                        <RechartsTooltip cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }} content={<CustomTooltip />} />
                        <Bar dataKey="leads" name="Total Leads" fill="url(#barLeads)" radius={[6, 6, 0, 0]} maxBarSize={50} />
                        <Line type="monotone" dataKey="students" name="Converted Orders" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}

