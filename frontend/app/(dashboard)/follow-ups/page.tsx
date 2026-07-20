'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, BellRing, Phone, Calendar, ClipboardList, Pencil, Check, AlertTriangle, FileText, Target, Search, Loader2, Trash2, CheckCircle2, ChevronLeft, ChevronRight, Users, BarChart2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useFollowUpStore, FollowUp } from '@/stores/followUpStore'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/hooks/use-toast'
import { format, isBefore, addDays, startOfDay, isSameDay } from 'date-fns'
import { useConfirm } from '@/components/ui/confirm-provider'
import RichTextEditor from '@/components/RichTextEditor'
import DOMPurify from 'dompurify'
import { useQuery } from '@tanstack/react-query'
import { followUpsAPI } from '@/lib/api'

const isValidName = (name: string) => {
    if (!name) return false
    const trimmed = name.trim()
    if (trimmed.length <= 1) return false
    if (/\d/.test(trimmed)) return false
    return true
}

const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/)
    if (words.length > 1) {
        return (words[0][0] + words[words.length - 1][0]).toUpperCase()
    }
    const single = words[0].replace(/[^a-zA-Z]/g, '')
    return single.length > 0 ? single.slice(0, 2).toUpperCase() : '?'
}

const getUrgency = (dateString: string) => {
    const date = startOfDay(new Date(dateString))
    const today = startOfDay(new Date())
    if (isBefore(date, today)) return 'overdue'
    if (isSameDay(date, today)) return 'today'
    return 'future'
}

const getUrgencyStyles = (urgency: string) => {
    if (urgency === 'overdue') return 'bg-red-500 text-white border-red-600 shadow-sm'
    if (urgency === 'today') return 'bg-amber-500 text-white border-amber-600 shadow-sm'
    return 'bg-muted/50 text-muted-foreground border-border'
}

const stripHtml = (html: string) => {
    if (!html) return ''
    return html.replace(/<[^>]*>?/gm, '')
}

export default function FollowUpsPage() {
    const { user } = useAuthStore()
    const { 
        pendingFollowUps, completedFollowUps,
        pendingMeta, completedMeta,
        isLoadingPending, isLoadingCompleted,
        fetchPendingFollowUps, fetchCompletedFollowUps,
        addFollowUp, updateFollowUp, removeFollowUp 
    } = useFollowUpStore()
    const { toast } = useToast()
    const { confirm } = useConfirm()
    const [open, setOpen] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editDescription, setEditDescription] = useState('')
    const [editRequirement, setEditRequirement] = useState('')
    const [editFollowupDate, setEditFollowupDate] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending')
    const isAdmin = user?.role === 'ADMIN'

    // Admin: selected user filter (null = all users)
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null)

    // Fetch follow-ups from backend on mount (and re-fetch when userId filter changes)
    useEffect(() => {
        fetchPendingFollowUps(1, '', selectedUserId ?? undefined)
        fetchCompletedFollowUps(1, '', selectedUserId ?? undefined)
    }, [fetchPendingFollowUps, fetchCompletedFollowUps, selectedUserId])

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchPendingFollowUps(1, searchQuery || undefined, selectedUserId ?? undefined)
            fetchCompletedFollowUps(1, searchQuery || undefined, selectedUserId ?? undefined)
        }, 400)
        return () => clearTimeout(timer)
    }, [searchQuery, fetchPendingFollowUps, fetchCompletedFollowUps, selectedUserId])

    // Admin: fetch per-user stats for performance panel
    const { data: statsData } = useQuery({
        queryKey: ['follow-ups-stats'],
        queryFn: async () => {
            const res = await followUpsAPI.getStats()
            return res.data.data as Array<{
                user: { id: number; fullName: string }
                pending: number
                completed: number
            }>
        },
        enabled: isAdmin,
        staleTime: 60_000,
    })

    const handleNumberClick = (f: FollowUp) => {
        setSelectedFollowUp(f)
        setIsEditing(false)
        setDetailsOpen(true)
    }

    const handleStartEdit = () => {
        if (!selectedFollowUp) return
        setEditDescription(selectedFollowUp.description)
        setEditRequirement(selectedFollowUp.requirement)
        setEditFollowupDate(selectedFollowUp.followupDate ? selectedFollowUp.followupDate.split('T')[0] : '')
        setIsEditing(true)
    }

    const handleSaveEdit = async () => {
        if (!selectedFollowUp) return
        try {
            await updateFollowUp(selectedFollowUp.id, {
                description: editDescription,
                requirement: editRequirement,
                followupDate: editFollowupDate
            })
            setSelectedFollowUp({
                ...selectedFollowUp,
                description: editDescription,
                requirement: editRequirement,
                followupDate: editFollowupDate
            })
            setIsEditing(false)
            setDetailsOpen(false)
            toast({ title: 'Follow-up updated successfully' })
        } catch {
            toast({ title: 'Failed to update follow-up', variant: 'destructive' })
        }
    }

    // Form state
    const [name, setName] = useState('')
    const [number, setNumber] = useState('')
    const [description, setDescription] = useState('')
    const [followupDate, setFollowupDate] = useState('')
    const [requirement, setRequirement] = useState('')

    // Removed local filter arrays since they are managed by the store

    // Near to followup date (deadline within next 24 hours, or past due)
    const upcomingFollowUps = useMemo(() => {
        const now = new Date()
        const tomorrow = addDays(startOfDay(now), 1)
        return pendingFollowUps.filter(f => {
            const fDate = new Date(f.followupDate)
            return isBefore(fDate, tomorrow)
        })
    }, [pendingFollowUps])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            await addFollowUp({
                name,
                number,
                description,
                followupDate,
                requirement
            })
            toast({ title: 'Follow up added successfully' })
            setOpen(false)
            setName('')
            setNumber('')
            setDescription('')
            setFollowupDate('')
            setRequirement('')
        } catch {
            toast({ title: 'Failed to add follow-up', variant: 'destructive' })
        }
    }

    const handleDelete = async (id: string) => {
        if (!(await confirm({ message: "Are you sure you want to delete this follow-up?", variant: 'destructive', title: 'Delete Follow-up' }))) return;
        try {
            await removeFollowUp(id)
            toast({ title: 'Follow-up deleted' })
        } catch {
            toast({ title: 'Failed to delete follow-up', variant: 'destructive' })
        }
    }

    const handleComplete = async (id: string) => {
        if (!(await confirm("Are you sure you want to mark this follow-up as complete?"))) return;
        try {
            await updateFollowUp(id, { status: 'COMPLETED' })
            toast({ title: 'Follow-up marked as completed' })
        } catch {
            toast({ title: 'Failed to complete follow-up', variant: 'destructive' })
        }
    }

    // Role check
    const hasAccess = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.staffRole === 'TELECALLER'
    if (!hasAccess) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-6">
                    <ClipboardList className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground mt-2 max-w-sm">Only Admins, Managers, and Telecallers can access this page.</p>
            </div>
        )
    }

    return (
        <TooltipProvider delayDuration={200}>
        <div className="space-y-4 md:space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Daily Follow Ups</h1>
                    <p className="text-sm text-muted-foreground mt-1.5 font-medium">Manage and track your follow-up tasks.</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 gradient-primary text-white font-medium shadow-lg shadow-blue-500/25 hover:opacity-90 transition-opacity rounded-xl px-5">
                            <Plus className="w-4 h-4" />
                            <span>Add Follow Up</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px] max-h-[90vh] flex flex-col rounded-[20px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1117] shadow-2xl p-0 overflow-hidden">
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
                            <DialogHeader>
                                <DialogTitle className="text-lg font-bold">Add New Follow Up</DialogTitle>
                            </DialogHeader>
                        </div>
                        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 overflow-y-auto scrollbar-thin">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</Label>
                                <Input id="name" placeholder="Contact name" value={name} onChange={e => setName(e.target.value)} required className="rounded-xl h-10 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-primary" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="number" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Number</Label>
                                <Input id="number" type="tel" placeholder="Phone number" value={number} onChange={e => setNumber(e.target.value)} required className="rounded-xl h-10 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-primary" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</Label>
                                <RichTextEditor value={description} onChange={setDescription} placeholder="Brief description" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="followupDate" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Follow-up Date</Label>
                                <Input id="followupDate" type="date" value={followupDate} onChange={e => setFollowupDate(e.target.value)} required className="rounded-xl h-10 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-primary" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="requirement" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Requirement</Label>
                                <Input id="requirement" placeholder="Customer requirement" value={requirement} onChange={e => setRequirement(e.target.value)} required className="rounded-xl h-10 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-primary" />
                            </div>
                            <Button type="submit" className="w-full gradient-primary text-white font-medium rounded-xl h-11 shadow-lg shadow-blue-500/25 hover:opacity-90 transition-opacity">Save Follow Up</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>


            {/* Search Bar */}
            <div className="relative max-w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 dark:text-slate-500" />
                <Input
                    placeholder="Search by name, number, description or requirement..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 focus:border-primary text-[14px] placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm"
                />
                {(isLoadingPending || isLoadingCompleted) && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
                )}
            </div>

            {/* Admin: Team Performance Panel */}
            {isAdmin && statsData && statsData.length > 0 && (
                <div className="rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-5 shadow-sm">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                            <BarChart2 className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-foreground">Team Performance</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">Follow-up completion rate per team member</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {statsData.map(s => {
                            const total = s.pending + s.completed
                            const pct = total > 0 ? Math.round((s.completed / total) * 100) : 0
                            return (
                                <button
                                    key={s.user.id}
                                    onClick={() => setSelectedUserId(selectedUserId === s.user.id ? null : s.user.id)}
                                    className={`relative text-left rounded-xl border p-4 transition-all ${
                                        selectedUserId === s.user.id
                                            ? 'border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-sm'
                                            : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/10'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 mb-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[11px] font-bold text-purple-600 dark:text-purple-400 shrink-0">
                                            {s.user.fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-bold text-slate-800 dark:text-slate-200 truncate">{s.user.fullName}</p>
                                            <p className="text-[10px] text-muted-foreground">{total} total follow-ups</p>
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-[11px] font-semibold mb-2">
                                        <span className="text-amber-600 dark:text-amber-400">{s.pending} pending</span>
                                        <span className="text-emerald-600 dark:text-emerald-400">{s.completed} done</span>
                                    </div>
                                    <div className="h-2 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-700"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <div className="text-right mt-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                        {pct}% completion
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Admin: Team Member Filter Pills */}
            {isAdmin && statsData && statsData.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mr-1">
                        <Users className="w-3.5 h-3.5" />
                        Filter by:
                    </div>
                    <button
                        onClick={() => setSelectedUserId(null)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            selectedUserId === null
                                ? 'bg-gradient-to-b from-primary to-primary/90 text-white border-primary/50 shadow-md shadow-primary/20'
                                : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
                        }`}
                    >
                        All Members
                        <span className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] ${selectedUserId === null ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'}`}>
                            {statsData.reduce((s, u) => s + u.pending, 0)}
                        </span>
                    </button>
                    {statsData.map(s => (
                        <button
                            key={s.user.id}
                            onClick={() => setSelectedUserId(selectedUserId === s.user.id ? null : s.user.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                selectedUserId === s.user.id
                                    ? 'bg-gradient-to-b from-primary to-primary/90 text-white border-primary/50 shadow-md shadow-primary/20'
                                    : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'
                            }`}
                        >
                            {s.user.fullName.split(' ')[0]}
                            {s.pending > 0 && (
                                <span className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[10px] ${selectedUserId === s.user.id ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                                    {s.pending}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}


            {/* Alert for upcoming follow-ups */}
            {upcomingFollowUps.length > 0 && (
                <div className="rounded-[20px] bg-amber-500/10 border border-amber-500/20 p-4 md:p-6 shadow-sm">
                    <div className="flex items-start gap-4 md:gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
                            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-amber-800 dark:text-amber-400 text-lg md:text-xl mb-1 mt-0.5 tracking-tight">
                                Attention Needed
                            </h3>
                            <p className="text-amber-700/80 dark:text-amber-500/80 font-medium text-sm mb-4">
                                You have {upcomingFollowUps.length} follow-up{upcomingFollowUps.length > 1 ? 's' : ''} due soon.
                            </p>
                            <div className="flex flex-col gap-2.5">
                                {upcomingFollowUps.map(f => (
                                    <div key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-card hover:bg-accent transition-all duration-200 px-4 py-3 rounded-xl border border-border shadow-sm">
                                        <div className="flex items-center gap-3.5 mb-3 sm:mb-0 min-w-0">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isValidName(f.name) ? 'bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 border' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 border'}`}>
                                                {isValidName(f.name) ? getInitials(f.name) : <User className="w-4 h-4" />}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-foreground text-[14px] truncate max-w-[200px]">{f.name}</span>
                                                    <span onClick={() => handleNumberClick(f)} className="font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-md font-mono text-[12px] cursor-pointer transition-colors shrink-0">{f.number}</span>
                                                </div>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <div className="line-clamp-1 text-[13px] text-muted-foreground mt-0.5 cursor-default [&_*]:inline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="w-[280px] sm:w-[320px] p-3 leading-relaxed">
                                                        <div className="[&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2.5 shrink-0 pl-13 sm:pl-0">
                                            <span className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border ${getUrgencyStyles(getUrgency(f.followupDate))}`}>
                                                {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                            </span>
                                            <Button variant="ghost" size="sm" onClick={() => handleComplete(f.id)} className="h-8 px-3 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/20 hover:scale-105 active:scale-95 transition-all text-xs font-bold gap-1.5 border border-emerald-500/20 shadow-sm">
                                                <CheckCircle2 className="w-4 h-4" /> Done
                                            </Button>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)} className="h-8 w-8 rounded-lg bg-red-500/10 text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all border border-red-500/20 shadow-sm shrink-0">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Delete</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex bg-muted/50 p-1 rounded-xl w-fit border border-border/50">
                <button 
                    onClick={() => setActiveTab('pending')}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'pending' ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                >
                    Pending ({pendingFollowUps.length})
                </button>
                <button 
                    onClick={() => setActiveTab('completed')}
                    className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'completed' ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
                >
                    Completed ({completedFollowUps.length})
                </button>
            </div>

            {/* Pending List */}
            {activeTab === 'pending' && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                        <span>Contact Details & Description</span>
                        <span>Deadline & Actions</span>
                    </div>
                    {isLoadingPending && pendingFollowUps.length === 0 ? (
                        <div className="card-surface p-16 text-center">
                            <Loader2 className="w-8 h-8 mx-auto mb-4 text-primary animate-spin" />
                            <p className="text-sm text-muted-foreground">Loading follow-ups...</p>
                        </div>
                    ) : pendingFollowUps.length === 0 ? (
                        <div className="card-surface p-16 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                                <ClipboardList className="w-8 h-8 text-muted-foreground/40" />
                            </div>
                            <p className="text-base font-semibold mb-1.5 text-foreground">
                                {searchQuery ? 'No results found' : 'No pending follow-ups found'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {searchQuery ? `No follow-ups match "${searchQuery}".` : 'Start by adding a new follow-up for your daily tasks.'}
                            </p>
                        </div>
                    ) : (
                        pendingFollowUps.map((f) => {
                            const isUrgent = upcomingFollowUps.some(u => u.id === f.id)
                            return (
                                <div key={f.id} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 card-surface hover:shadow-md transition-all group overflow-hidden">
                                    {/* Urgency indicator strip */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${getUrgency(f.followupDate) === 'overdue' ? 'bg-red-500' : getUrgency(f.followupDate) === 'today' ? 'bg-amber-500' : 'bg-transparent group-hover:bg-primary/20'} transition-colors`} />
                                    
                                    <div className="flex items-start gap-4 flex-1 min-w-0 pl-1">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isValidName(f.name) ? 'bg-primary/10 border-primary/20 text-primary border' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 border'}`}>
                                            {isValidName(f.name) ? getInitials(f.name) : <User className="w-5 h-5" />}
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="font-extrabold text-foreground text-[15px] truncate max-w-[200px] sm:max-w-[300px]">{f.name}</span>
                                                <span onClick={() => handleNumberClick(f)} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-sm font-mono text-[13px] font-semibold cursor-pointer transition-all shrink-0">
                                                    <Phone className="w-3 h-3" /> {f.number}
                                                </span>
                                            </div>
                                            <div className="flex items-start gap-1.5">
                                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className="line-clamp-1 text-[13px] font-medium text-slate-700 dark:text-slate-300 cursor-default [&_*]:inline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                        </TooltipTrigger>
                                                        <TooltipContent className="w-[320px] p-3 leading-relaxed">
                                                            <div className="[&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                            {f.requirement && (
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <Target className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                    <span className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-400 truncate">
                                                        {f.requirement}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-14 sm:pl-0">
                                        <div className="flex flex-col sm:items-end gap-1">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${getUrgencyStyles(getUrgency(f.followupDate))}`}>
                                                {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                            </span>
                                            {f.createdBy && isAdmin && (
                                                <span className="text-[11px] font-medium text-muted-foreground">
                                                    by {f.createdBy.fullName.split(' ')[0]}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => handleComplete(f.id)} className="h-9 px-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 hover:bg-emerald-500/20 hover:scale-105 active:scale-95 transition-all text-xs font-bold gap-1.5 border border-emerald-500/20 shadow-sm">
                                                <CheckCircle2 className="w-4 h-4" /> Done
                                            </Button>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)} className="h-9 w-9 rounded-xl bg-red-500/10 text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all border border-red-500/20 shadow-sm shrink-0">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Delete Follow-up</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            )}

            {/* Completed List */}
            {activeTab === 'completed' && completedFollowUps.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between px-2 text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                        <span>Contact Details & Description</span>
                        <span>Completed Date & Actions</span>
                    </div>
                    {completedFollowUps.map((f) => (
                        <div key={f.id} className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 md:p-5 card-surface hover:shadow-md transition-all group overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/30" />
                            
                            <div className="flex items-start gap-4 flex-1 min-w-0 pl-1">
                                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 border border-border flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0 opacity-70">
                                    {isValidName(f.name) ? getInitials(f.name) : <User className="w-5 h-5" />}
                                </div>
                                <div className="flex flex-col flex-1 min-w-0 opacity-80">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="font-extrabold text-foreground text-[15px] truncate max-w-[200px] sm:max-w-[300px]">{f.name}</span>
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono text-[13px] font-semibold shrink-0">
                                            <Phone className="w-3 h-3" /> {f.number}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-1.5">
                                        <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                        <div className="min-w-0 flex-1">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="line-clamp-1 text-[13px] text-muted-foreground cursor-default [&_*]:inline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                </TooltipTrigger>
                                                <TooltipContent className="w-[320px] p-3 leading-relaxed">
                                                    <div className="[&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    {f.requirement && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                            <span className="text-[12px] font-medium text-muted-foreground truncate">
                                                {f.requirement}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-14 sm:pl-0">
                                <div className="flex flex-col sm:items-end gap-1">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border bg-emerald-500/5 text-emerald-600 dark:text-emerald-500 border-emerald-500/20 shadow-sm">
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                    </span>
                                    {f.createdBy && isAdmin && (
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                            by {f.createdBy.fullName.split(' ')[0]}
                                        </span>
                                    )}
                                </div>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)} className="h-9 w-9 rounded-xl bg-red-500/10 text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all border border-red-500/20 shadow-sm shrink-0">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete Follow-up</TooltipContent>
                                </Tooltip>
                            </div>
                        </div>
                    ))}
                </div>
            )}


            {/* Follow-up Details Dialog */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col rounded-[20px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1117] shadow-2xl p-0 overflow-hidden">
                    {/* Dialog Header with gradient accent */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <FileText className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />
                                </div>
                                Follow-up Details
                            </DialogTitle>
                        </DialogHeader>
                    </div>

                    {selectedFollowUp && (
                        <div className="px-6 py-5 space-y-6 overflow-y-auto scrollbar-thin">
                            {/* Contact Info Row */}
                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                                <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                                    {selectedFollowUp.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-base font-bold text-slate-900 dark:text-white truncate">{selectedFollowUp.name}</p>
                                    <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{selectedFollowUp.number}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Created</p>
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{format(new Date(selectedFollowUp.createdAt), 'MMM dd, yyyy')}</p>
                                </div>
                            </div>

                            {/* Editable Details Grid */}
                            <div className="space-y-4">
                                {/* Next Follow-up Date */}
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Calendar className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Next Follow-up Date</p>
                                    </div>
                                    {isEditing ? (
                                        <Input type="date" value={editFollowupDate} onChange={e => setEditFollowupDate(e.target.value)} className="h-9 text-sm rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-white/5" />
                                    ) : (
                                        <p className="font-semibold text-[15px] text-slate-800 dark:text-white">{format(new Date(selectedFollowUp.followupDate), 'MMM dd, yyyy')}</p>
                                    )}
                                </div>

                                {/* Description */}
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <FileText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Description</p>
                                    </div>
                                    {isEditing ? (
                                        <div className="space-y-3">
                                            <RichTextEditor value={editDescription} onChange={setEditDescription} />
                                        </div>
                                    ) : (
                                        <div className="text-[14px] leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedFollowUp.description) }} />
                                    )}
                                </div>

                                {/* Requirement */}
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/60 dark:border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Target className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Requirement</p>
                                    </div>
                                    {isEditing ? (
                                        <Input value={editRequirement} onChange={e => setEditRequirement(e.target.value)} className="h-9 text-sm rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-white/5" />
                                    ) : (
                                        <p className="text-[14px] text-slate-700 dark:text-slate-300 leading-relaxed">{selectedFollowUp.requirement}</p>
                                    )}
                                </div>

                                {/* Edit / Save Button */}
                                <div className="flex justify-end">
                                    {isEditing ? (
                                        <Button size="sm" onClick={handleSaveEdit} className="gap-2 gradient-primary text-white font-medium rounded-xl px-5 h-9 shadow-lg shadow-blue-500/25 hover:opacity-90 transition-opacity">
                                            <Check className="w-4 h-4" /> Save Changes
                                        </Button>
                                    ) : (
                                        <Button size="sm" variant="outline" onClick={handleStartEdit} className="gap-2 rounded-xl px-5 h-9 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-all font-medium">
                                            <Pencil className="w-3.5 h-3.5" /> Edit Details
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Related Follow-ups */}
                            <div className="pt-2">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                        <ClipboardList className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-white">Related Follow-ups</h3>
                                        <p className="text-[11px] text-muted-foreground">All follow-ups for this contact</p>
                                    </div>
                                </div>
                                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                                    {[...pendingFollowUps, ...completedFollowUps]
                                        .filter(f => f.number === selectedFollowUp.number)
                                        .sort((a, b) => new Date(a.followupDate).getTime() - new Date(b.followupDate).getTime())
                                        .map(f => (
                                            <div key={f.id} className={`p-3.5 rounded-xl border transition-all duration-200 ${f.id === selectedFollowUp.id ? 'border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-sm' : 'border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.04]'}`}>
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full shrink-0 ${f.id === selectedFollowUp.id ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                                        <span className="font-bold text-[13px] text-slate-800 dark:text-white">{format(new Date(f.followupDate), 'MMM dd, yyyy')}</span>
                                                    </div>
                                                    <span className="text-[10px] font-medium text-muted-foreground bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-white/5">
                                                        {format(new Date(f.createdAt), 'MMM dd')}
                                                    </span>
                                                </div>
                                                <div className="text-[13px] pl-4 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_a]:text-primary [&_a]:underline" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(f.description) }} />
                                                <p className="text-[12px] text-slate-500 dark:text-slate-500 pl-4 mt-1">
                                                    <span className="font-bold text-[10px] text-slate-400 dark:text-slate-600 uppercase tracking-wider">Req:</span> {f.requirement}
                                                </p>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
        </TooltipProvider>
    )
}
