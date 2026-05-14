'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    ArrowLeft, Phone, Mail, Calendar, Target, User, Clock,
    MessageSquare, TrendingUp, Edit, Check, ChevronDown, Plus,
    RefreshCw, Trash2, UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { leadsAPI, teamAPI } from '@/lib/api'
import { formatDate, formatNumber, getPriorityColor, getInitials } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

const STAGES = [
    { key: 'NEW',         label: 'New',         color: 'from-blue-500 to-cyan-500',     badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30' },
    { key: 'CONTACTED',   label: 'Contacted',   color: 'from-yellow-500 to-amber-500',  badge: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' },
    { key: 'QUALIFIED',   label: 'Qualified',   color: 'from-purple-500 to-violet-500', badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
    { key: 'PROPOSAL',    label: 'Proposal',    color: 'from-orange-500 to-red-500',    badge: 'bg-orange-500/20 text-orange-300 border border-orange-500/30' },
    { key: 'NEGOTIATION', label: 'Negotiation', color: 'from-pink-500 to-rose-500',     badge: 'bg-pink-500/20 text-pink-300 border border-pink-500/30' },
    { key: 'WON',         label: 'Won',         color: 'from-emerald-500 to-green-500', badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
    { key: 'LOST',        label: 'Lost',        color: 'from-gray-500 to-slate-500',    badge: 'bg-gray-500/20 text-gray-400 border border-gray-500/30' },
]

const ACTIVITY_TYPES = [
    { key: 'CALL',    label: 'Call',    icon: Phone },
    { key: 'EMAIL',   label: 'Email',   icon: Mail },
    { key: 'MEETING', label: 'Meeting', icon: Calendar },
    { key: 'NOTE',    label: 'Note',    icon: MessageSquare },
    { key: 'FOLLOW_UP',label: 'Follow-up',icon: Clock },
]

const ACTIVITY_ICONS: Record<string, any> = {
    CALL: Phone, EMAIL: Mail, MEETING: Calendar, NOTE: MessageSquare, FOLLOW_UP: Clock,
}

export default function LeadDetailPage() {
    const params  = useParams()
    const router  = useRouter()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { user } = useAuthStore()

    const leadId = params.id as string
    const isStaff      = user?.role === 'STAFF'
    const hasFullAccess = user?.role === 'ADMIN' || user?.role === 'MANAGER'

    const [showActivityForm, setShowActivityForm] = useState(false)
    const [activityData, setActivityData] = useState({ type: 'NOTE', notes: '', outcome: '', nextFollowUp: '' })
    const [editingField, setEditingField] = useState<string | null>(null)
    const [editValue, setEditValue] = useState('')

    /* ── Data ──────────────────────────────────────── */
    const { data: lead, isLoading } = useQuery({
        queryKey: ['lead', leadId],
        queryFn:  async () => (await leadsAPI.getById(leadId)).data.data,
    })

    const { data: guidesData } = useQuery({
        queryKey: ['guides-available'],
        queryFn:  async () => (await teamAPI.getGuides()).data.data,
        enabled:  hasFullAccess,
    })
    const guides: any[] = guidesData || []

    const currentStage = STAGES.find(s => s.key === lead?.stage)

    /* ── Mutations ──────────────────────────────────── */
    const updateMutation = useMutation({
        mutationFn: (data: any) => leadsAPI.update(leadId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            setEditingField(null)
            toast({ title: 'Updated', variant: 'success' })
        },
        onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
    })

    const addActivityMutation = useMutation({
        mutationFn: (data: any) => leadsAPI.addActivity(leadId, {
            activityType: data.type,
            description: data.notes,
            outcome: data.outcome,
            nextFollowUp: data.nextFollowUp || null,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['lead', leadId] })
            setShowActivityForm(false)
            setActivityData({ type: 'NOTE', notes: '', outcome: '', nextFollowUp: '' })
            toast({ title: 'Activity logged', variant: 'success' })
        },
        onError: (error: any) => toast({
            title: 'Failed to log activity',
            description: error?.response?.data?.message || 'Please check the activity details and try again.',
            variant: 'destructive',
        }),
    })

    const deleteMutation = useMutation({
        mutationFn: () => leadsAPI.delete(leadId),
        onSuccess: () => {
            router.push('/leads')
            toast({ title: 'Lead deleted', variant: 'success' })
        },
    })

    /* ── Helpers ────────────────────────────────────── */
    function startEdit(field: string, value: string) {
        setEditingField(field)
        setEditValue(value || '')
    }

    function saveEdit(field: string) {
        updateMutation.mutate({ [field]: editValue })
    }

    if (isLoading) return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
            <Skeleton className="h-10 w-48" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Skeleton className="h-64 rounded-2xl" />
                    <Skeleton className="h-48 rounded-2xl" />
                </div>
                <Skeleton className="h-96 rounded-2xl" />
            </div>
        </div>
    )

    if (!lead) return (
        <div className="text-center py-20">
            <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-xl font-medium mb-2">Lead not found</p>
            <Link href="/leads"><Button variant="outline" className="mt-4">Back to Leads</Button></Link>
        </div>
    )

    const activities = lead.activities || []

    return (
        <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">

            {/* ── Back + Actions ─────────────────── */}
            <div className="flex items-center justify-between">
                <Link href="/leads">
                    <Button variant="ghost" className="gap-2">
                        <ArrowLeft className="w-4 h-4" />Back to Leads
                    </Button>
                </Link>
                {hasFullAccess && (
                    <div className="flex items-center gap-2">
                        <Link href={`/leads/${leadId}/edit`}>
                            <Button variant="outline" size="sm" className="gap-2">
                                <Edit className="w-4 h-4" />Edit
                            </Button>
                        </Link>
                        <Button
                            variant="destructive" size="sm" className="gap-2"
                            onClick={() => { if (confirm('Delete this lead?')) deleteMutation.mutate() }}
                            disabled={deleteMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4" />Delete
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── LEFT: Main Info + Activity ──── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Lead Header Card */}
                    <div className="glass rounded-2xl overflow-hidden">
                        {/* Gradient Banner */}
                        <div className={`h-24 bg-gradient-to-r ${currentStage?.color || 'from-blue-600 to-purple-600'} relative`}>
                            <div className="absolute inset-0 bg-black/20" />
                        </div>

                        <div className="p-6 -mt-12 relative">
                            <div className="flex items-end gap-4 mb-4">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white border-4 border-background shadow-xl">
                                    {lead.fullName?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className="mb-1 flex-1 min-w-0">
                                    <h1 className="text-xl font-bold truncate">{lead.fullName}</h1>
                                    <p className="text-muted-foreground text-sm">{lead.email || 'No email'}</p>
                                </div>
                                {/* Stage Badge */}
                                {hasFullAccess ? (
                                    <DropdownMenu.Root>
                                        <DropdownMenu.Trigger asChild>
                                            <button className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${currentStage?.badge || 'bg-white/10 text-white'}`}>
                                                {lead.stage} <ChevronDown className="w-3 h-3" />
                                            </button>
                                        </DropdownMenu.Trigger>
                                        <DropdownMenu.Portal>
                                            <DropdownMenu.Content align="end" sideOffset={4} className="z-[100] w-44 rounded-xl border border-white/10 glass-dropdown p-1 shadow-2xl animate-fade-in">
                                                {STAGES.map(s => (
                                                    <DropdownMenu.Item
                                                        key={s.key}
                                                        onSelect={() => updateMutation.mutate({ stage: s.key })}
                                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer outline-none data-[highlighted]:bg-white/10 ${lead.stage === s.key ? 'bg-white/10 text-white' : 'text-white/70'}`}
                                                    >
                                                        <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${s.color}`} />
                                                        {s.label}
                                                    </DropdownMenu.Item>
                                                ))}
                                            </DropdownMenu.Content>
                                        </DropdownMenu.Portal>
                                    </DropdownMenu.Root>
                                ) : (
                                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${currentStage?.badge || 'bg-white/10 text-white'}`}>
                                        {lead.stage}
                                    </span>
                                )}
                            </div>

                            {/* Quick Info Row */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div className="glass rounded-xl p-3">
                                    <p className="text-muted-foreground text-xs mb-1">Phone</p>
                                    <div className="flex items-center gap-1.5 font-mono">
                                        <Phone className="w-3.5 h-3.5 text-blue-400" />
                                        {lead.phone}
                                    </div>
                                </div>
                                <div className="glass rounded-xl p-3">
                                    <p className="text-muted-foreground text-xs mb-1">Course</p>
                                    <p className="font-medium truncate">{lead.interestedCourse || '-'}</p>
                                </div>
                                <div className="glass rounded-xl p-3">
                                    <p className="text-muted-foreground text-xs mb-1">Priority</p>
                                    <span className={`font-semibold ${getPriorityColor(lead.priority)}`}>{lead.priority}</span>
                                </div>
                                <div className="glass rounded-xl p-3">
                                    <p className="text-muted-foreground text-xs mb-1">Source</p>
                                    <p className="capitalize">{lead.source?.toLowerCase().replace(/_/g, ' ')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Details Card — editable fields */}
                    <div className="glass rounded-2xl p-6">
                        <h2 className="font-semibold mb-4 flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />Lead Details
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            {[
                                { key: 'fullName',        label: 'Full Name',      value: lead.fullName },
                                { key: 'email',           label: 'Email',          value: lead.email },
                                { key: 'phone',           label: 'Phone',          value: lead.phone },
                                { key: 'alternatePhone',  label: 'Alt. Phone',     value: lead.alternatePhone },
                                { key: 'interestedCourse',label: 'Course Interest',value: lead.interestedCourse },
                                { key: 'sourceDetails',   label: 'Source Details', value: lead.sourceDetails },
                            ].map(({ key, label, value }) => (
                                <div key={key} className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground">{label}</span>
                                    {hasFullAccess && editingField === key ? (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                autoFocus value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(key); if (e.key === 'Escape') setEditingField(null) }}
                                                className="h-7 text-sm"
                                            />
                                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveEdit(key)}>
                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => hasFullAccess ? startEdit(key, value) : undefined}
                                            className={`text-left font-medium ${hasFullAccess ? 'hover:text-primary transition-colors cursor-text' : ''} ${!value ? 'text-muted-foreground italic' : ''}`}
                                        >
                                            {value || (hasFullAccess ? 'Click to add...' : '-')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Notes */}
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <span className="text-xs text-muted-foreground">Notes</span>
                            {hasFullAccess && editingField === 'followUpNotes' ? (
                                <div className="mt-1 flex gap-2">
                                    <textarea
                                        autoFocus value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        rows={3}
                                        className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <Button size="icon" variant="ghost" className="h-7 w-7 mt-1" onClick={() => saveEdit('followUpNotes')}>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    </Button>
                                </div>
                            ) : (
                                <p
                                    onClick={() => hasFullAccess ? startEdit('followUpNotes', lead.followUpNotes) : undefined}
                                    className={`mt-1 text-sm leading-relaxed ${hasFullAccess ? 'cursor-text hover:text-primary transition-colors' : ''} ${!lead.followUpNotes ? 'text-muted-foreground italic' : ''}`}
                                >
                                    {lead.followUpNotes || (hasFullAccess ? 'Click to add notes...' : 'No notes')}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Activity Log + Add Activity */}
                    <div className="glass rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />Activity Log
                            </h2>
                            <Button onClick={() => setShowActivityForm(!showActivityForm)} size="sm" variant="outline" className="gap-2">
                                <Plus className="w-3.5 h-3.5" />Log Activity
                            </Button>
                        </div>

                        {/* Add Activity Form */}
                        {showActivityForm && (
                            <div className="mb-6 p-4 rounded-xl border border-white/10 bg-white/[0.03] space-y-3 animate-fade-in">
                                <div className="flex items-center gap-2 flex-wrap">
                                    {ACTIVITY_TYPES.map(t => (
                                        <button
                                            key={t.key}
                                            onClick={() => setActivityData({ ...activityData, type: t.key })}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activityData.type === t.key ? 'bg-primary text-white' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                                        >
                                            <t.icon className="w-3.5 h-3.5" />{t.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={activityData.notes}
                                    onChange={e => setActivityData({ ...activityData, notes: e.target.value })}
                                    placeholder="What happened? Add details about this activity..."
                                    rows={3}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs text-muted-foreground mb-1 block">Outcome</label>
                                        <Input
                                            value={activityData.outcome}
                                            onChange={e => setActivityData({ ...activityData, outcome: e.target.value })}
                                            placeholder="e.g. Interested, No answer..."
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-muted-foreground mb-1 block">Next Follow-up Date</label>
                                        <Input
                                            type="date"
                                            value={activityData.nextFollowUp}
                                            onChange={e => setActivityData({ ...activityData, nextFollowUp: e.target.value })}
                                            className="h-8 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        onClick={() => addActivityMutation.mutate(activityData)}
                                        disabled={addActivityMutation.isPending || !activityData.notes.trim()}
                                        size="sm" className="gap-2 gradient-primary text-white"
                                    >
                                        {addActivityMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        Save Activity
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => setShowActivityForm(false)}>Cancel</Button>
                                </div>
                            </div>
                        )}

                        {/* Timeline */}
                        {activities.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                <p className="text-sm">No activities yet. Log your first interaction above.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {activities.map((act: any, idx: number) => {
                                    const activityType = act.activityType || act.type
                                    const Icon = ACTIVITY_ICONS[activityType] || MessageSquare
                                    return (
                                        <div key={act.id} className="flex gap-3">
                                            <div className="flex flex-col items-center">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                    <Icon className="w-3.5 h-3.5 text-primary" />
                                                </div>
                                                {idx < activities.length - 1 && (
                                                    <div className="w-px flex-1 bg-white/10 my-2" />
                                                )}
                                            </div>
                                            <div className="flex-1 pb-2">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">{activityType?.replace(/_/g, ' ')}</span>
                                                    <span className="text-xs text-muted-foreground">• {formatDate(act.createdAt)}</span>
                                                    {act.createdBy && (
                                                        <span className="text-xs text-muted-foreground">by {act.createdBy.fullName}</span>
                                                    )}
                                                </div>
                                                <p className="text-sm">{act.description || act.notes}</p>
                                                {act.outcome && (
                                                    <p className="text-xs text-muted-foreground mt-1">Outcome: <span className="text-foreground">{act.outcome}</span></p>
                                                )}
                                                {act.nextFollowUp && (
                                                    <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-400">
                                                        <Calendar className="w-3 h-3" />Next follow-up: {formatDate(act.nextFollowUp)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── RIGHT: Sidebar Info ─────────────── */}
                <div className="space-y-4">

                    {/* Assigned To */}
                    <div className="glass rounded-2xl p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />Assigned To
                        </h3>
                        {lead.assignedTo ? (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                                    {getInitials(lead.assignedTo.fullName)}
                                </div>
                                <div>
                                    <p className="font-medium text-sm">{lead.assignedTo.fullName}</p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                        {lead.assignedTo.staffRole?.toLowerCase() || lead.assignedTo.role?.toLowerCase()}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Unassigned</p>
                        )}

                        {hasFullAccess && (
                            <DropdownMenu.Root>
                                <DropdownMenu.Trigger asChild>
                                    <Button variant="outline" size="sm" className="mt-4 w-full gap-2">
                                        <UserCheck className="w-3.5 h-3.5" />
                                        {lead.assignedTo ? 'Change Assignment' : 'Assign Staff'}
                                        <ChevronDown className="w-3 h-3 ml-auto" />
                                    </Button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                    <DropdownMenu.Content
                                        align="start" sideOffset={4}
                                        className="z-[100] w-full min-w-[200px] rounded-xl border border-white/10 glass-dropdown p-1.5 shadow-2xl animate-fade-in"
                                    >
                                        <div className="max-h-48 overflow-y-auto">
                                            {guides.map((g: any) => (
                                                <DropdownMenu.Item
                                                    key={g.id}
                                                    onSelect={() => updateMutation.mutate({ assignedToId: g.id })}
                                                    className={`flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer outline-none transition-colors ${lead.assignedTo?.id === g.id ? 'bg-white/10 text-white' : 'text-white/70 data-[highlighted]:bg-white/5 data-[highlighted]:text-white'}`}
                                                >
                                                    <span className="text-sm font-medium">{g.fullName}</span>
                                                    <span className="text-xs text-white/40 capitalize ml-2">{g.staffRole?.toLowerCase()}</span>
                                                </DropdownMenu.Item>
                                            ))}
                                        </div>
                                        {lead.assignedTo && (
                                            <>
                                                <div className="my-1 h-px bg-white/10" />
                                                <DropdownMenu.Item
                                                    onSelect={() => updateMutation.mutate({ assignedToId: null })}
                                                    className="px-3 py-2.5 rounded-md cursor-pointer outline-none text-red-400 text-sm data-[highlighted]:bg-red-500/10"
                                                >
                                                    Remove Assignment
                                                </DropdownMenu.Item>
                                            </>
                                        )}
                                    </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                        )}
                    </div>

                    {/* Timeline / Follow-up */}
                    <div className="glass rounded-2xl p-5">
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />Follow-up
                        </h3>
                        {lead.nextFollowUp ? (
                            <div className="flex items-center gap-2 text-amber-400">
                                <Calendar className="w-4 h-4" />
                                <span className="text-sm font-medium">{formatDate(lead.nextFollowUp)}</span>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No follow-up scheduled</p>
                        )}
                        {hasFullAccess && (
                            <div className="mt-3">
                                <label className="text-xs text-muted-foreground block mb-1">Update Date</label>
                                <Input
                                    type="date"
                                    defaultValue={lead.nextFollowUp?.split('T')[0]}
                                    onChange={e => updateMutation.mutate({ nextFollowUp: e.target.value || null })}
                                    className="h-8 text-sm"
                                />
                            </div>
                        )}
                    </div>

                    {/* Metadata */}
                    <div className="glass rounded-2xl p-5 space-y-3">
                        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-muted-foreground" />Lead Info
                        </h3>
                        {[
                            { label: 'Created',      value: formatDate(lead.createdAt) },
                            { label: 'Last Updated', value: formatDate(lead.updatedAt) },
                            { label: 'Activities',   value: `${activities.length} logged` },
                            { label: 'Lead ID',      value: `#${lead.id?.slice(0, 8)}` },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{label}</span>
                                <span className="font-medium">{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Priority Update */}
                    {hasFullAccess && (
                        <div className="glass rounded-2xl p-5">
                            <h3 className="text-sm font-semibold mb-3">Priority</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => updateMutation.mutate({ priority: p })}
                                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${lead.priority === p ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
