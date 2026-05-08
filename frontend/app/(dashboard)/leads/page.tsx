'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Search, Plus, LayoutGrid, List, Phone, Calendar, Target,
    ChevronLeft, ChevronRight, RefreshCw, ArrowRight, ChevronDown, UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { leadsAPI, teamAPI } from '@/lib/api'
import { formatNumber, formatDate, getPriorityColor, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

const STAGES = [
    { key: 'NEW',         label: 'New',         color: 'from-blue-500 to-cyan-500' },
    { key: 'CONTACTED',   label: 'Contacted',   color: 'from-yellow-500 to-amber-500' },
    { key: 'QUALIFIED',   label: 'Qualified',   color: 'from-purple-500 to-violet-500' },
    { key: 'PROPOSAL',    label: 'Proposal',    color: 'from-orange-500 to-red-500' },
    { key: 'NEGOTIATION', label: 'Negotiation', color: 'from-pink-500 to-rose-500' },
    { key: 'WON',         label: 'Won',         color: 'from-emerald-500 to-green-500' },
    { key: 'LOST',        label: 'Lost',        color: 'from-gray-500 to-slate-500' },
]

const STAGE_BADGE: Record<string, string> = {
    NEW:         'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30',
    CONTACTED:   'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border border-yellow-500/30',
    QUALIFIED:   'bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30',
    PROPOSAL:    'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30',
    NEGOTIATION: 'bg-pink-500/15 text-pink-700 dark:text-pink-300 border border-pink-500/30',
    WON:         'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
    LOST:        'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/30',
}

export default function LeadsPage() {
    const queryClient = useQueryClient()
    const { toast }   = useToast()
    const { user }    = useAuthStore()

    const isTelecaller  = user?.role === 'STAFF' && user?.staffRole === 'TELECALLER'
    const isStaff       = user?.role === 'STAFF' && !isTelecaller
    const hasFullAccess = user?.role === 'ADMIN' || user?.role === 'MANAGER' || isTelecaller

    const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('list')
    const [search,   setSearch]   = useState('')
    const [page,     setPage]     = useState(1)
    const [stageFilter, setStageFilter] = useState('')

    const scrollContainerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = scrollContainerRef.current
        if (!container) return
        const handleWheel = (e: WheelEvent) => {
            const target = e.target as HTMLElement
            const col = target.closest('.pipeline-column') as HTMLElement | null
            if (col) {
                const canUp   = col.scrollTop > 0
                const canDown = Math.ceil(col.scrollTop + col.clientHeight) < col.scrollHeight
                if ((e.deltaY < 0 && canUp) || (e.deltaY > 0 && canDown)) return
            }
            if (e.deltaY !== 0 && !e.shiftKey && container.scrollWidth > container.clientWidth) {
                e.preventDefault()
                container.scrollLeft += e.deltaY
            }
        }
        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => container.removeEventListener('wheel', handleWheel)
    }, [viewMode])

    /* ── Data fetching ─────────────────────────────────────────── */
    const listParams: Record<string, any> = {
        page, limit: 50, search,
        ...(stageFilter ? { stage: stageFilter } : {}),
        ...(isStaff && user?.id ? { assignedTo: user.id } : {}),
    }

    const { data: listData, isLoading: listLoading } = useQuery({
        queryKey: ['leads', 'list', listParams],
        queryFn:  async () => (await leadsAPI.getAll(listParams)).data.data,
        enabled:  viewMode === 'list' || isStaff,
    })

    const { data: pipelineData, isLoading: pipelineLoading, refetch: refetchPipeline } = useQuery({
        queryKey: ['leads', 'pipeline'],
        queryFn:  async () => (await leadsAPI.getPipeline()).data.data,
        enabled:  viewMode === 'pipeline' && hasFullAccess,
    })

    const { data: stats } = useQuery({
        queryKey: ['lead-stats'],
        queryFn:  async () => (await leadsAPI.getStats()).data.data,
        enabled:  hasFullAccess,
    })

    const { data: guidesData } = useQuery({
        queryKey: ['guides-available'],
        queryFn:  async () => (await teamAPI.getGuides()).data.data,
        enabled:  hasFullAccess,
    })
    const guides: any[] = guidesData || []

    /* ── Mutations ─────────────────────────────────────────────── */
    const updateStageMutation = useMutation({
        mutationFn: ({ id, stage }: { id: string; stage: string }) => leadsAPI.update(id, { stage }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            toast({ title: 'Stage updated', variant: 'success' })
        },
    })

    const assignMutation = useMutation({
        mutationFn: ({ leadId, userId }: { leadId: string; userId: number | null }) =>
            leadsAPI.update(leadId, { assignedToId: userId }),
        onSuccess: (_, { userId }) => {
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            toast({ title: userId ? 'Assigned!' : 'Unassigned', variant: 'success' })
        },
        onError: () => toast({ title: 'Error', description: 'Failed to update assignment', variant: 'destructive' }),
    })

    const leads      = listData?.leads      || []
    const pagination = listData?.pagination || { page: 1, totalPages: 1, total: 0 }

    return (
        <div className="space-y-6 animate-fade-in">

            {/* ── Page Header ───────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Leads</h1>
                    <p className="text-muted-foreground text-sm">
                        {isStaff
                            ? `Your assigned leads • ${formatNumber(pagination.total)} total`
                            : `Manage your sales pipeline • ${formatNumber(stats?.totalLeads || 0)} total`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm"
                        onClick={() => {
                            if (viewMode === 'pipeline') refetchPipeline()
                            else queryClient.invalidateQueries({ queryKey: ['leads', 'list'] })
                        }}
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    {hasFullAccess && (
                        <Link href="/leads/new">
                            <Button className="gap-2 gradient-primary text-white" size="sm">
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Add Lead</span>
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            {/* ── Stats (admin/manager only) ─────────────────────── */}
            {hasFullAccess && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-muted-foreground mb-1">New Leads</p>
                        <p className="text-2xl font-bold">{formatNumber(stats?.newLeads || 0)}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-muted-foreground mb-1">Qualified</p>
                        <p className="text-2xl font-bold">{formatNumber(stats?.qualifiedLeads || 0)}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-muted-foreground mb-1">Won</p>
                        <p className="text-2xl font-bold text-emerald-400">{formatNumber(stats?.wonLeads || 0)}</p>
                    </div>
                    <div className="glass rounded-xl p-4">
                        <p className="text-sm text-muted-foreground mb-1">Conversion Rate</p>
                        <p className="text-2xl font-bold text-gradient">{stats?.conversionRate || 0}%</p>
                    </div>
                </div>
            )}

            {/* ── Search + Filters + View Toggle ────────────────── */}
            <div className="glass rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search leads by name, phone, email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="flex items-center gap-3 ml-auto">
                    <select
                        value={stageFilter}
                        onChange={e => { setStageFilter(e.target.value); setPage(1) }}
                        className="h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm"
                    >
                        <option value="">All Stages</option>
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>

                    {hasFullAccess && (
                        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
                            <Button variant={viewMode === 'list'     ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('list')}     className="gap-1.5 h-7 px-3">
                                <List className="w-3.5 h-3.5" /> List
                            </Button>
                            <Button variant={viewMode === 'pipeline' ? 'secondary' : 'ghost'} size="sm" onClick={() => setViewMode('pipeline')} className="gap-1.5 h-7 px-3">
                                <LayoutGrid className="w-3.5 h-3.5" /> Pipeline
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── LIST VIEW ─────────────────────────────────────── */}
            {(viewMode === 'list' || isStaff) && (
                <div className="glass rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px]">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/5">
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead</th>
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Course</th>
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</th>
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</th>
                                    {hasFullAccess && <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order By</th>}
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Assigned</th>
                                    <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {listLoading ? (
                                    Array(10).fill(0).map((_, i) => (
                                        <tr key={i} className="border-b border-white/5">
                                            {Array(8).fill(0).map((_, j) => (
                                                <td key={j} className="p-4"><Skeleton className="h-4 w-full" /></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : leads.length === 0 ? (
                                    <tr>
                                        <td colSpan={hasFullAccess ? 9 : 8} className="p-12 text-center">
                                            <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                                            <p className="text-lg font-medium mb-2">No leads found</p>
                                            <p className="text-muted-foreground mb-4">
                                                {isStaff ? 'No leads are currently assigned to you.' : 'Start building your pipeline by adding leads.'}
                                            </p>
                                            {hasFullAccess && (
                                                <Link href="/leads/new"><Button variant="outline">Add Lead</Button></Link>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    leads.map((lead: any) => (
                                        <tr key={lead.id} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">

                                            {/* Lead Name + Email */}
                                            <td className="p-4">
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm truncate">{lead.fullName}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{lead.email || '-'}</p>
                                                </div>
                                            </td>

                                            {/* Phone */}
                                            <td className="p-4">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-mono">{lead.phone}</span>
                                                </div>
                                            </td>

                                            {/* Course */}
                                            <td className="p-4 text-sm text-muted-foreground">{lead.interestedCourse || '-'}</td>

                                            {/* Source */}
                                            <td className="p-4 text-sm text-muted-foreground capitalize">
                                                {lead.source?.toLowerCase().replace(/_/g, ' ')}
                                            </td>

                                            {/* Stage — dropdown for admin/manager, badge for staff */}
                                            <td className="p-4">
                                                {hasFullAccess ? (
                                                    <DropdownMenu.Root>
                                                        <DropdownMenu.Trigger asChild>
                                                            <button className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity ${STAGE_BADGE[lead.stage] || 'bg-white/10 text-white'}`}>
                                                                {lead.stage}
                                                                <ChevronDown className="w-3 h-3 opacity-60" />
                                                            </button>
                                                        </DropdownMenu.Trigger>
                                                        <DropdownMenu.Portal>
                                                            <DropdownMenu.Content
                                                                align="start" sideOffset={4}
                                                                className="z-[100] w-44 overflow-hidden rounded-xl border border-white/10 glass-dropdown p-1 shadow-2xl animate-fade-in"
                                                            >
                                                                {STAGES.map(s => (
                                                                    <DropdownMenu.Item
                                                                        key={s.key}
                                                                        onSelect={() => updateStageMutation.mutate({ id: lead.id, stage: s.key })}
                                                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer outline-none transition-colors data-[highlighted]:bg-white/10 ${lead.stage === s.key ? 'text-white bg-white/10' : 'text-white/70'}`}
                                                                    >
                                                                        <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${s.color} shrink-0`} />
                                                                        {s.label}
                                                                    </DropdownMenu.Item>
                                                                ))}
                                                            </DropdownMenu.Content>
                                                        </DropdownMenu.Portal>
                                                    </DropdownMenu.Root>
                                                ) : (
                                                    <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STAGE_BADGE[lead.stage] || 'bg-white/10 text-white'}`}>
                                                        {lead.stage}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Priority */}
                                            <td className="p-4">
                                                <span className={`text-sm font-semibold ${getPriorityColor(lead.priority)}`}>
                                                    {lead.priority}
                                                </span>
                                            </td>

                                            {/* Order By (telecaller who owns this lead) */}
                                            {hasFullAccess && (
                                                <td className="p-4 whitespace-nowrap">
                                                    {lead.createdBy ? (
                                                        <span className="text-[13px] font-semibold text-cyan-600 dark:text-cyan-400">
                                                            {lead.createdBy.fullName} <span className="text-muted-foreground font-normal text-[11px]">#{lead.createdBy.id}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">—</span>
                                                    )}
                                                </td>
                                            )}

                                            {/* Assigned — dropdown for admin/manager */}
                                            <td className="p-4">
                                                {hasFullAccess ? (
                                                    <DropdownMenu.Root>
                                                        <DropdownMenu.Trigger asChild>
                                                            <button className="flex items-center gap-1 group cursor-pointer">
                                                                {lead.assignedTo ? (
                                                                    <div
                                                                        title={lead.assignedTo.fullName}
                                                                        className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs text-white font-bold border-2 border-background group-hover:border-primary/40 transition-colors"
                                                                    >
                                                                        {getInitials(lead.assignedTo.fullName)}
                                                                    </div>
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center group-hover:border-primary/40 transition-colors">
                                                                        <UserCheck className="w-3.5 h-3.5 text-muted-foreground" />
                                                                    </div>
                                                                )}
                                                                <ChevronDown className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </button>
                                                        </DropdownMenu.Trigger>
                                                        <DropdownMenu.Portal>
                                                            <DropdownMenu.Content
                                                                align="end" sideOffset={4}
                                                                className="z-[100] w-52 overflow-hidden rounded-xl border border-white/10 glass-dropdown p-1.5 shadow-2xl animate-fade-in"
                                                            >
                                                                <div className="max-h-48 overflow-y-auto">
                                                                    {guides.length === 0 ? (
                                                                        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No staff available.</div>
                                                                    ) : guides.map((g: any) => (
                                                                        <DropdownMenu.Item
                                                                            key={g.id}
                                                                            onSelect={() => assignMutation.mutate({ leadId: lead.id, userId: g.id })}
                                                                            className={`flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer outline-none transition-colors ${lead.assignedTo?.id === g.id ? 'bg-white/10 text-white' : 'text-white/70 data-[highlighted]:bg-white/5 data-[highlighted]:text-white'}`}
                                                                        >
                                                                            <span className="text-sm font-medium truncate">{g.fullName}</span>
                                                                            <span className="text-[10px] text-white/40 ml-2 shrink-0 capitalize">{g.staffRole?.toLowerCase()}</span>
                                                                        </DropdownMenu.Item>
                                                                    ))}
                                                                </div>
                                                                {lead.assignedTo && (
                                                                    <>
                                                                        <div className="my-1 h-px bg-white/10" />
                                                                        <DropdownMenu.Item
                                                                            onSelect={() => assignMutation.mutate({ leadId: lead.id, userId: null })}
                                                                            className="px-3 py-2.5 rounded-md cursor-pointer outline-none text-red-400 text-sm data-[highlighted]:bg-red-500/10"
                                                                        >
                                                                            Remove Assignment
                                                                        </DropdownMenu.Item>
                                                                    </>
                                                                )}
                                                            </DropdownMenu.Content>
                                                        </DropdownMenu.Portal>
                                                    </DropdownMenu.Root>
                                                ) : lead.assignedTo ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold">
                                                            {getInitials(lead.assignedTo.fullName)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">-</span>
                                                )}
                                            </td>

                                            {/* Actions — View → */}
                                            <td className="p-4">
                                                <Link href={`/leads/${lead.id}`}>
                                                    <Button
                                                        variant="ghost" size="sm"
                                                        className="gap-1.5 text-sm font-medium hover:text-primary hover:bg-primary/10 transition-colors"
                                                    >
                                                        View <ArrowRight className="w-3.5 h-3.5" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="p-4 border-t border-white/10 flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, pagination.total)} of {formatNumber(pagination.total)}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                                    <ChevronLeft className="w-4 h-4" />Previous
                                </Button>
                                <span className="text-sm px-3">Page {page} of {pagination.totalPages}</span>
                                <Button variant="outline" size="sm" disabled={page === pagination.totalPages} onClick={() => setPage(page + 1)}>
                                    Next<ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── PIPELINE VIEW (admin/manager only) ────────────── */}
            {viewMode === 'pipeline' && hasFullAccess && (
                <div className="glass p-2 md:p-4 rounded-xl border border-white/5">
                    <div ref={scrollContainerRef} className="overflow-x-auto pb-4 scrollbar-thin">
                        <div className="flex gap-4 w-max">
                            {STAGES.map(stage => {
                                const sd     = pipelineData?.find((p: any) => p.stage === stage.key)
                                const pLeads = sd?.leads || []
                                const count  = sd?.count  || 0
                                return (
                                    <div key={stage.key} className="w-64 md:w-72 flex-shrink-0">
                                        <div className={`bg-gradient-to-r ${stage.color} rounded-t-xl p-3 flex items-center justify-between`}>
                                            <span className="font-semibold text-white">{stage.label}</span>
                                            <span className="px-2 py-0.5 bg-white/20 rounded-full text-sm text-white">{formatNumber(count)}</span>
                                        </div>
                                        <div className="pipeline-column rounded-t-none min-h-[400px] max-h-[600px] overflow-y-auto scrollbar-thin">
                                            {pipelineLoading ? (
                                                Array(3).fill(0).map((_, i) => (
                                                    <div key={i} className="glass rounded-lg p-4 mb-3">
                                                        <Skeleton className="h-5 w-3/4 mb-2" />
                                                        <Skeleton className="h-4 w-1/2 mb-3" />
                                                    </div>
                                                ))
                                            ) : pLeads.length === 0 ? (
                                                <div className="text-center py-8 text-muted-foreground">
                                                    <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                                    <p className="text-sm">No leads</p>
                                                </div>
                                            ) : (
                                                pLeads.map((lead: any) => (
                                                    <Link key={lead.id} href={`/leads/${lead.id}`} className="pipeline-card block">
                                                        <div className="flex items-start justify-between mb-2">
                                                            <h3 className="font-medium truncate flex-1">{lead.fullName}</h3>
                                                            <span className={`text-xs px-1.5 py-0.5 rounded ml-1 ${getPriorityColor(lead.priority)} bg-white/5`}>
                                                                {lead.priority}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground mb-3">{lead.interestedCourse || 'No course'}</p>
                                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                            <div className="flex items-center gap-1.5">
                                                                <Phone className="w-3 h-3" />{lead.phone}
                                                            </div>
                                                            {lead.assignedTo && (
                                                                <div className="w-5 h-5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-[10px] text-white font-bold">
                                                                    {getInitials(lead.assignedTo.fullName)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {lead.nextFollowUp && (
                                                            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1 text-xs text-amber-400">
                                                                <Calendar className="w-3 h-3" />
                                                                Follow-up: {formatDate(lead.nextFollowUp)}
                                                            </div>
                                                        )}
                                                    </Link>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

