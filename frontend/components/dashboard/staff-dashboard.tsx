'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
    ClipboardList, Clock, FileText, IndianRupee, Phone, Target, ArrowRight, TrendingUp, Users
} from 'lucide-react'
import api, { leadsAPI, studentsAPI } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/authStore'
import { formatDateTime, formatNumber, getPriorityColor, getStageColor } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function cfGet(customFields: Record<string, any> | null | undefined, ...keywords: string[]) {
    if (!customFields || typeof customFields !== 'object') return ''

    const lowerKeywords = keywords.map(keyword => keyword.toLowerCase())
    for (const [key, value] of Object.entries(customFields)) {
        const lowerKey = key.toLowerCase()
        if (lowerKeywords.some(keyword => lowerKey.includes(keyword))) {
            if (Array.isArray(value)) return value.join(', ')
            return String(value ?? '').trim()
        }
    }

    return ''
}

function formatPrice(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return '-'

    const normalized = String(value).trim()
    if (!normalized) return '-'

    const numeric = Number(normalized.replace(/,/g, ''))
    if (!Number.isNaN(numeric)) {
        return `Rs ${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    }

    return normalized
}

function parsePrice(value: string | null | undefined) {
    if (!value) return 0
    const numeric = Number(String(value).replace(/[^\d.]/g, ''))
    return Number.isNaN(numeric) ? 0 : numeric
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

export function StaffDashboard() {
    const { _hasHydrated, isAuthenticated, user } = useAuthStore()

    const { data: leadsData, isLoading: leadsLoading } = useQuery({
        queryKey: ['staff-dashboard-leads', user?.id],
        queryFn: async () => {
            const response = await leadsAPI.getAll({ page: 1, limit: 100, assignedTo: user?.id })
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated && !!user?.id,
        staleTime: 30000,
    })

    const { data: studentsData, isLoading: studentsLoading } = useQuery({
        queryKey: ['staff-dashboard-students'],
        queryFn: async () => {
            const response = await studentsAPI.getAll({ page: 1, limit: 100 })
            return response.data.data
        },
        enabled: _hasHydrated && isAuthenticated,
        staleTime: 30000,
    })

    const { data: tasks, isLoading: tasksLoading } = useQuery({
        queryKey: ['staff-dashboard-tasks'],
        queryFn: async () => {
            const response = await api.get('/tasks')
            return response.data.data || []
        },
        enabled: _hasHydrated && isAuthenticated,
        staleTime: 30000,
    })

    const assignedLeads = leadsData?.leads || []
    const assignedStudents = studentsData?.students || []
    const openTasks = (tasks || []).filter((task: any) => task.status !== 'COMPLETED')
    const followUpsToday = assignedLeads.filter((lead: any) => isToday(lead.nextFollowUp)).length
    const totalDecidedPrice = assignedStudents.reduce((sum: number, student: any) => {
        return sum + parsePrice(cfGet(student.customFields, 'decided price'))
    }, 0)
    const isLoading = leadsLoading || studentsLoading || tasksLoading

    return (
        <div className="space-y-8 animate-fade-in pb-10 max-w-7xl mx-auto">
             {/* Header */}
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-6 sm:p-8 rounded-2xl border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2" />
                
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Welcome back, <span className="text-primary">{user?.fullName?.split(' ')[0] || 'Team Member'}</span>
                    </h1>
                    <p className="text-muted-foreground mt-1.5 text-[15px]">Here is the status of the leads and requirements assigned to you.</p>
                </div>
                
                <div className="flex items-center gap-3 shrink-0">
                    <Link href="/orders">
                        <Button className="rounded-full shadow-lg shadow-primary/20 gap-2 gradient-primary 
                                     text-white border-0 hover:opacity-90 transition-opacity px-6">
                            <FileText className="w-4 h-4" /> Go to Responses
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {/* Metric 1 */}
                <Card className="glass border-slate-200 dark:border-white/5 bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Target className="w-20 h-20 text-blue-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground mb-2">Assigned Leads</p>
                            {isLoading ? <div className="h-10 w-16 bg-white/10 rounded animate-pulse" /> : 
                                <h3 className="text-4xl font-bold text-slate-900 dark:text-white">{formatNumber(assignedLeads.length)}</h3>
                            }
                        </div>
                    </CardContent>
                </Card>

                 {/* Metric 2 */}
                 <Card className="glass border-slate-200 dark:border-white/5 bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Clock className="w-20 h-20 text-orange-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground mb-2">Follow-ups Today</p>
                            {isLoading ? <div className="h-10 w-16 bg-white/10 rounded animate-pulse" /> : 
                                <h3 className="text-4xl font-bold text-orange-400">{formatNumber(followUpsToday)}</h3>
                            }
                        </div>
                    </CardContent>
                </Card>

                 {/* Metric 3 */}
                 <Card className="glass border-slate-200 dark:border-white/5 bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <FileText className="w-20 h-20 text-violet-400 -mr-6 -mt-6" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground mb-2">Assigned Responses</p>
                            {isLoading ? <div className="h-10 w-16 bg-white/10 rounded animate-pulse" /> : 
                                <h3 className="text-4xl font-bold text-violet-300">{formatNumber(assignedStudents.length)}</h3>
                            }
                        </div>
                    </CardContent>
                </Card>

                 {/* Metric 4 */}
                 <Card className="glass border-slate-200 dark:border-white/5 bg-white dark:bg-gradient-to-br dark:from-white/[0.03] dark:to-transparent hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors relative overflow-hidden group shadow-md dark:shadow-none">
                    <CardContent className="p-6">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <IndianRupee className="w-20 h-20 text-emerald-400 -mr-4 -mt-4" />
                        </div>
                        <div className="relative z-10">
                            <p className="text-sm font-medium text-muted-foreground mb-2">Total Managed Price</p>
                            {isLoading ? <div className="h-10 w-24 bg-white/10 rounded animate-pulse" /> : 
                                <h3 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent truncate pt-1">{formatPrice(totalDecidedPrice)}</h3>
                            }
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Quick Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Assigned Responses Stream */}
                 <div className="glass rounded-2xl p-6 border border-white/5">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Users className="w-5 h-5 text-violet-400"/>
                                Latest Requirements
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">Recently assigned to you</p>
                        </div>
                        <Link href="/orders" className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                            See all <ArrowRight className="w-3.5 h-3.5"/>
                        </Link>
                    </div>

                    <div className="space-y-3 max-h-[460px] overflow-y-auto scrollbar-thin pr-2">
                        {isLoading ? (
                            [1, 2, 3].map(index => <Skeleton key={index} className="h-24 w-full rounded-xl bg-white/5" />)
                        ) : assignedStudents.length === 0 ? (
                            <div className="text-center py-16 text-muted-foreground glass rounded-xl border border-white/5 border-dashed">
                                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                                <p>No requirements assigned yet</p>
                            </div>
                        ) : (
                            assignedStudents.slice(0, 6).map((student: any) => {
                                const requirement = cfGet(student.customFields, 'requirement of...', 'requirement')
                                const decidedPrice = cfGet(student.customFields, 'decided price')
                                const programme = student.programme || student.course || 'Unspecified Course'
                                const semester = cfGet(student.customFields, 'present semester', 'semester', 'year')

                                return (
                                    <Link key={student.id} href={`/orders/${student.id}`} className="group block">
                                        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 group-hover:bg-white/[0.05] group-hover:border-white/10 transition-all">
                                             <div className="flex justify-between items-start mb-2 gap-4">
                                                 <div className="min-w-0">
                                                    <p className="font-semibold text-[15px] truncate group-hover:text-violet-300 transition-colors">{student.fullName}</p>
                                                    <p className="text-xs text-muted-foreground truncate font-medium mt-0.5">{programme}{semester ? ` · ${semester}` : ''}</p>
                                                 </div>
                                                 {decidedPrice && (
                                                     <div className="shrink-0 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                                                        {formatPrice(decidedPrice)}
                                                     </div>
                                                 )}
                                             </div>
                                             <div className="p-3 rounded-lg bg-black/20 text-sm text-white/70 line-clamp-2 leading-relaxed">
                                                {requirement || 'No specific requirement text added for this assignment.'}
                                             </div>
                                        </div>
                                    </Link>
                                )
                            })
                        )}
                    </div>
                </div>

                 {/* Assigned Leads & Followups Stream */}
                 <div className="space-y-6">
                    <div className="glass rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Target className="w-5 h-5 text-blue-400"/>
                                    Active Follow-ups
                                </h2>
                                <p className="text-sm text-muted-foreground mt-1">Leads requiring your attention</p>
                            </div>
                            <Link href="/leads" className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                                Open Queue <ArrowRight className="w-3.5 h-3.5"/>
                            </Link>
                        </div>
                        
                        <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-thin pr-2">
                            {isLoading ? (
                                [1, 2, 3].map(index => <Skeleton key={index} className="h-20 w-full rounded-xl bg-white/5" />)
                            ) : assignedLeads.length === 0 ? (
                                <div className="text-center py-10 text-muted-foreground glass rounded-xl border border-white/5 border-dashed">
                                    <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p>Your lead queue is completely clear.</p>
                                </div>
                            ) : (
                                assignedLeads.slice(0, 5).map((lead: any) => {
                                    const today = isToday(lead.nextFollowUp)
                                    return (
                                        <div key={lead.id} className={`rounded-xl border p-4 transition-all ${today ? 'bg-orange-500/10 border-orange-500/20 shadow-lg shadow-orange-500/5' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'}`}>
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-[15px] truncate">{lead.fullName}</p>
                                                        {today && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500 text-white uppercase tracking-wider">Due Today</span>}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.interestedCourse || 'General Inquiry'}</p>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide uppercase ${getStageColor(lead.stage)}`}>
                                                    {lead.stage}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>

                    {/* Tiny Task Snapshot (Commented out as Task Board is removed) */}
                    {/*
                    <div className="glass rounded-2xl p-5 border border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-semibold flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4 text-purple-400"/>
                                    Pending Tasks
                                </h2>
                                <Link href="/employee" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                                    View Board <ArrowRight className="w-3 h-3"/>
                                </Link>
                            </div>
                            
                            <div className="space-y-2">
                                {isLoading ? (
                                    <Skeleton className="h-12 w-full rounded-lg bg-white/5" />
                                ) : openTasks.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">No active tasks</p>
                                ) : (
                                    openTasks.slice(0, 3).map((task: any) => (
                                        <div key={task.id} className="p-3 rounded-lg border border-white/5 bg-white/[0.02] flex justify-between items-center transition-colors hover:bg-white/[0.05]">
                                            <p className="text-[13px] font-medium truncate flex-1 pr-4">{task.title}</p>
                                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{task.status.replace('_', ' ')}</span>
                                        </div>
                                    ))
                                )}
                            </div>
                    </div>
                    */}

                 </div>
            </div>
        </div>
    )
}

