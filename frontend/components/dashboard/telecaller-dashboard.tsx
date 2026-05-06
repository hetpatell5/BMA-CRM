'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
    Activity, Clock, IndianRupee, Target, ArrowRight,
    TrendingUp, Phone, ChevronRight, AlertCircle, Calendar, CheckCircle2, TrendingDown,
    Award, User
} from 'lucide-react'
import { dashboardAPI } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime, getStageColor, getPriorityColor, formatNumber, getStatusColor } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function formatPrice(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return '-'
    const numeric = Number(value)
    if (Number.isNaN(numeric)) return value
    return `₹${numeric.toLocaleString('en-IN')}`
}

function isOverdue(dateValue: string | null | undefined) {
    if (!dateValue) return false
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return false

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
}

function isToday(dateValue: string | null | undefined) {
    if (!dateValue) return false
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return false

    const now = new Date()
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate()
}

export function TelecallerDashboard() {
    const { _hasHydrated, isAuthenticated, user } = useAuthStore()

    const { data: statsData, isLoading } = useQuery({
        queryKey: ['telecaller-dashboard-stats', user?.id],
        queryFn: async () => {
            const response = await dashboardAPI.getTelecallerStats()
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated && !!user?.id,
        staleTime: 30000,
    })

    const currentDate = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    })

    const firstName = user?.fullName?.split(' ')[0] || 'Telecaller'

    // KPI Defaults
    const totalOrders = statsData?.orders?.total || 0;
    const ordersToday = statsData?.orders?.today || 0;
    const createdOrders = statsData?.orders?.createdCount || 0;
    const totalRevenue = statsData?.revenue?.total || 0;
    const pendingPayment = statsData?.revenue?.pending || 0;

    const conversionRate = statsData?.leads?.conversionRate || 0;
    const followUpsToday = statsData?.leads?.followUpsToday || 0;
    const overdueFollowUps = statsData?.leads?.overdue || 0;
    const newLeads = statsData?.leads?.new || 0;
    const wonLeads = statsData?.leads?.won || 0;

    const followUpList = statsData?.leads?.followUpList || [];
    const recentOrders = statsData?.orders?.recentList || [];
    const pipeline = statsData?.pipeline || { NEW: 0, CONTACTED: 0, QUALIFIED: 0, WON: 0, LOST: 0 };
    const maxStageCount = Math.max(...Object.values(pipeline) as number[], 1);

    return (
        <div className="space-y-6 md:space-y-8 animate-fade-in pb-10 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-6 sm:p-8 rounded-2xl border border-border relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2" />

                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold bg-muted text-foreground/80 border border-border">
                            Telecaller
                        </span>
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> {currentDate}
                        </span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Hello, <span className="text-primary">{firstName}</span>
                    </h1>
                    <p className="text-muted-foreground mt-1.5 text-[15px]">Here’s what’s happening with your pipeline and sales today.</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <Link href="/leads">
                        <Button className="rounded-full shadow-lg shadow-blue-500/20 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400
                                     text-white border-0 hover:opacity-90 transition-opacity px-6">
                            <Phone className="w-4 h-4 mr-2" /> Make Calls
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Primary Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                <Card className="glass border-slate-200 dark:border-border bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-[0.15] dark:group-hover:opacity-20 transition-opacity">
                            <Award className="w-20 h-20 text-blue-600 dark:text-blue-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <p className="text-sm font-medium text-muted-foreground mb-4">Total Orders</p>
                            {isLoading ? <div className="h-10 w-16 bg-muted rounded animate-pulse" /> :
                                <div className="flex items-end gap-3">
                                    <h3 className="text-4xl font-bold text-foreground leading-none">{formatNumber(totalOrders)}</h3>
                                    {ordersToday > 0 && <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium pb-1 flex items-center"><TrendingUp className="w-3 h-3 mr-1" />{ordersToday} today</span>}
                                </div>
                            }
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass border-slate-200 dark:border-border bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-[0.15] dark:group-hover:opacity-20 transition-opacity">
                            <User className="w-20 h-20 text-indigo-600 dark:text-indigo-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10 flex flex-col h-full justify-between">
                            <p className="text-sm font-medium text-muted-foreground mb-4">Orders Created</p>
                            {isLoading ? <div className="h-10 w-16 bg-muted rounded animate-pulse" /> :
                                <div className="flex items-end gap-3">
                                    <h3 className="text-4xl font-bold text-foreground leading-none">{formatNumber(createdOrders)}</h3>
                                </div>
                            }
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass border-slate-200 dark:border-border bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-[0.15] dark:group-hover:opacity-20 transition-opacity">
                            <IndianRupee className="w-20 h-20 text-emerald-600 dark:text-emerald-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground mb-4">Total Revenue Generated</p>
                            {isLoading ? <div className="h-10 w-24 bg-muted rounded animate-pulse" /> :
                                <h3 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent truncate">{formatPrice(totalRevenue)}</h3>
                            }
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass border-slate-200 dark:border-border bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-[0.15] dark:group-hover:opacity-20 transition-opacity">
                            <Clock className="w-20 h-20 text-amber-600 dark:text-amber-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground mb-4">Pending Payment Gap</p>
                            {isLoading ? <div className="h-10 w-24 bg-muted rounded animate-pulse" /> :
                                <h3 className={`text-3xl font-bold ${pendingPayment > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'} truncate`}>{formatPrice(pendingPayment)}</h3>
                            }
                        </div>
                    </CardContent>
                </Card>

                <Card className="glass border-slate-200 dark:border-border bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-[0.15] dark:group-hover:opacity-20 transition-opacity">
                            <Target className="w-20 h-20 text-purple-600 dark:text-purple-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10 hidden sm:flex flex-col h-full sm:justify-between">
                            <p className="text-sm font-medium text-muted-foreground mb-4">Lead Conversion</p>
                            {isLoading ? <div className="h-10 w-16 bg-muted rounded animate-pulse" /> :
                                <h3 className="text-4xl font-bold text-purple-600 dark:text-purple-300 leading-none">{conversionRate}%</h3>
                            }
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Secondary Metrics Row (Follow ups, Leads) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-2">
                <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-center relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${overdueFollowUps > 0 ? 'bg-red-500' : 'bg-orange-500'}`} />
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Follow-ups Today</p>
                    <div className="flex items-center gap-2">
                        {isLoading ? <span className="h-8 w-12 bg-muted rounded animate-pulse" /> : <p className="text-3xl font-bold text-foreground">{followUpsToday}</p>}
                        {!isLoading && overdueFollowUps > 0 && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400">{overdueFollowUps} Overdue</span>}
                    </div>
                </div>
                <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Total Leads</p>
                    <div className="flex items-center gap-2">
                        {isLoading ? <span className="h-8 w-12 bg-muted rounded animate-pulse" /> : <p className="text-3xl font-bold text-foreground">{statsData?.leads?.total || 0}</p>}
                    </div>
                </div>
                <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">New Leads</p>
                    <div className="flex items-center gap-2">
                        {isLoading ? <span className="h-8 w-12 bg-muted rounded animate-pulse" /> : <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{newLeads}</p>}
                    </div>
                </div>
                <div className="glass p-5 rounded-2xl border border-border flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Won Leads</p>
                    <div className="flex items-center gap-2">
                        {isLoading ? <span className="h-8 w-12 bg-muted rounded animate-pulse" /> : <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{wonLeads}</p>}
                    </div>
                </div>
            </div>

            {/* Main Middle Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Assigned Leads & Followups Stream */}
                <div className="glass rounded-2xl p-6 border border-border flex flex-col h-[400px]">
                    <div className="flex items-center justify-between mb-6 shrink-0">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                <AlertCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
                                Immediate Priorities
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">Pending follow-ups & overdue calls</p>
                        </div>
                        <Link href="/leads?followUp=today" className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                            Go to Queue <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                    </div>

                    <div className="space-y-3 overflow-y-auto scrollbar-thin pr-2 flex-grow">
                        {isLoading ? (
                            [1, 2, 3].map(index => <Skeleton key={index} className="h-16 w-full rounded-xl bg-muted" />)
                        ) : followUpList.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center pb-8 text-muted-foreground">
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-500" />
                                <p>You're all caught up!<br /><span className="text-sm opacity-70">No pending follow-ups.</span></p>
                            </div>
                        ) : (
                            followUpList.map((lead: any) => {
                                const pastDue = isOverdue(lead.nextFollowUp)
                                const today = isToday(lead.nextFollowUp)

                                return (
                                    <Link key={lead.id} href={`/leads/${lead.id}`} className="block">
                                        <div className={`rounded-xl border p-3.5 transition-all flex items-center gap-4 ${pastDue ? 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10' : today ? 'bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10' : 'bg-muted/10 border-border hover:bg-muted/30'}`}>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-semibold text-sm truncate text-foreground">{lead.fullName}</p>
                                                    {pastDue && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500 text-white uppercase tracking-wider flex-shrink-0 animate-pulse">Overdue</span>}
                                                    {today && !pastDue && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500 text-white uppercase tracking-wider flex-shrink-0">Due Today</span>}
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">{lead.interestedCourse || 'General Inquiry'}</p>
                                            </div>

                                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold text-center w-full ${getPriorityColor(lead.priority)}`}>
                                                    {lead.priority || 'NORMAL'}
                                                </span>
                                                <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                                                    <Clock className="w-3 h-3" />
                                                    {lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                </div>
                                            </div>

                                            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50 shrink-0" />
                                        </div>
                                    </Link>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Pipeline Visualization */}
                <div className="glass rounded-2xl p-6 border border-border flex flex-col h-[400px]">
                    <div className="flex items-center justify-between mb-8 shrink-0">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                Pipeline Health
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">Lead stage distribution</p>
                        </div>
                    </div>

                    <div className="flex-grow flex flex-col justify-center space-y-5 px-2">
                        {isLoading ? (
                            [1, 2, 3, 4, 5].map(i => <div key={i} className="flex gap-4 items-center"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-full" /></div>)
                        ) : (
                            [
                                { stage: 'NEW', count: pipeline.NEW, color: 'bg-blue-500' },
                                { stage: 'CONTACTED', count: pipeline.CONTACTED, color: 'bg-indigo-500' },
                                { stage: 'QUALIFIED', count: pipeline.QUALIFIED, color: 'bg-violet-500' },
                                { stage: 'WON', count: pipeline.WON, color: 'bg-emerald-500' },
                                { stage: 'LOST', count: pipeline.LOST, color: 'bg-slate-500' },
                            ].map(item => {
                                const percent = maxStageCount > 0 ? (item.count / maxStageCount) * 100 : 0;
                                return (
                                    <div key={item.stage} className="flex items-center gap-4 group">
                                        <div className="w-[85px] text-[11px] font-bold text-muted-foreground uppercase tracking-wider text-right">
                                            {item.stage}
                                        </div>
                                        <div className="flex-1 h-3.5 bg-muted rounded-full overflow-hidden shadow-inner flex items-center group-hover:opacity-80 transition-opacity">
                                            <div
                                                className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out flex items-center justify-end px-2`}
                                                style={{ width: `${Math.max(percent, 0)}%`, minWidth: item.count > 0 ? '24px' : '0' }}
                                            />
                                        </div>
                                        <div className="w-[30px] text-sm font-semibold text-foreground tabular-nums">
                                            {item.count}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Row: Recent Orders Table */}
            <div className="glass rounded-2xl p-6 border border-border pt-5 pb-5 overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            My Recent Orders
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5">Orders successfully generated by you</p>
                    </div>
                    <Link href="/orders" className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                        View All <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>

                <div className="overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0 mt-4">
                    <table className="w-full text-sm min-w-[1000px] border-separate border-spacing-y-1">
                        <thead>
                            <tr className="text-left">
                                <th className="pb-3 px-3 font-medium text-muted-foreground text-xs tracking-wider uppercase">Student Info</th>
                                <th className="pb-3 px-3 font-medium text-muted-foreground text-xs tracking-wider uppercase">Contact Details</th>
                                <th className="pb-3 px-3 font-medium text-muted-foreground text-xs tracking-wider uppercase">Course & Sem/Year</th>
                                <th className="pb-3 px-3 font-medium text-muted-foreground text-xs tracking-wider uppercase">Postal Address</th>
                                <th className="pb-3 px-3 font-medium text-muted-foreground text-xs tracking-wider uppercase">Status & Date</th>
                                <th className="pb-3 px-3 font-bold text-xs tracking-wider uppercase text-right text-emerald-600 dark:text-emerald-400">Decided Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                [1, 2, 3].map((i) => (
                                    <tr key={i}>
                                        <td colSpan={6} className="py-2"><Skeleton className="h-14 w-full rounded-lg bg-muted" /></td>
                                    </tr>
                                ))
                            ) : recentOrders.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-muted-foreground border-y border-border">
                                        No orders found. Ensure orders are created or imported correctly!
                                    </td>
                                </tr>
                            ) : (
                                recentOrders.map((order: any) => {
                                    const priceStr = order.customFields?.['Decided Price'] || order.customFields?.['Total Order Amount'];
                                    const addressLine = [order.address, order.city, order.state].filter(Boolean).join(', ');

                                    return (
                                        <tr key={order.id} className="group transition-colors">
                                            {/* Student Info */}
                                            <td className="py-3 px-3 bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] border-y border-l border-border rounded-l-lg transition-colors">
                                                <Link href={`/orders/${order.id}`} className="font-semibold text-[15px] group-hover:text-primary transition-colors hover:underline text-foreground block truncate max-w-[180px]">
                                                    {order.fullName}
                                                </Link>
                                                <span className="text-xs text-muted-foreground block truncate max-w-[180px] mt-0.5">{order.email || 'No Email'}</span>
                                            </td>

                                            {/* Contact Details */}
                                            <td className="py-3 px-3 bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] border-y border-border transition-colors">
                                                <div className="text-[13px] text-foreground font-mono flex items-center gap-1.5">
                                                    <Phone className="w-3.5 h-3.5 text-muted-foreground" /> {order.phone || 'No Phone'}
                                                </div>
                                                {order.alternatePhone && (
                                                    <div className="text-[12px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                                                        <span className="opacity-70">Alt:</span> {order.alternatePhone}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Course & Sem/Year */}
                                            <td className="py-3 px-3 bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] border-y border-border transition-colors text-muted-foreground text-[13px] truncate max-w-[150px]">
                                                <div className="font-medium text-foreground">{order.programme || order.course || 'N/A'}</div>
                                                {(order.semester || order.batchYear) && (
                                                    <div className="text-[11px] mt-0.5 opacity-80">
                                                        {order.semester ? `Sem ${order.semester}` : ''}
                                                        {order.semester && order.batchYear ? ' • ' : ''}
                                                        {order.batchYear ? `Year ${order.batchYear}` : ''}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Postal Address */}
                                            <td className="py-3 px-3 bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] border-y border-border transition-colors text-muted-foreground text-[13px] truncate max-w-[160px]">
                                                {addressLine || '-'}
                                                {order.pincode && <span className="block text-[11px] opacity-70 mt-0.5">PIN: {order.pincode}</span>}
                                            </td>

                                            {/* Status & Date */}
                                            <td className="py-3 px-3 bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] border-y border-border transition-colors">
                                                <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getStatusColor(order.status).replace('border', '')}`}>
                                                    {order.status.replace(/_/g, ' ')}
                                                </span>
                                                <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" /> {formatDateTime(order.createdAt).split(',')[0]}
                                                </div>
                                            </td>

                                            {/* Decided Price */}
                                            <td className="py-3 px-3 bg-black/[0.02] dark:bg-white/[0.02] group-hover:bg-black/[0.04] dark:group-hover:bg-white/[0.04] border-y border-r border-border rounded-r-lg text-right transition-colors align-middle">
                                                <span className="font-mono text-foreground font-bold text-[15px]">{formatPrice(priceStr)}</span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    )
}

