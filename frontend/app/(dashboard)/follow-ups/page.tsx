'use client'

import { useState, useMemo } from 'react'
import { Plus, BellRing, Phone, Calendar, ClipboardList, Pencil, Check, Clock, AlertTriangle, User, FileText, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useFollowUpStore, FollowUp } from '@/stores/followUpStore'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/hooks/use-toast'
import { format, isBefore, addDays, startOfDay } from 'date-fns'

export default function FollowUpsPage() {
    const { user } = useAuthStore()
    const { followUps, addFollowUp, updateFollowUp, removeFollowUp } = useFollowUpStore()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)
    const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUp | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editDescription, setEditDescription] = useState('')
    const [editRequirement, setEditRequirement] = useState('')
    const [editFollowupDate, setEditFollowupDate] = useState('')

    const handleNumberClick = (f: FollowUp) => {
        setSelectedFollowUp(f)
        setIsEditing(false)
        setDetailsOpen(true)
    }

    const handleStartEdit = () => {
        if (!selectedFollowUp) return
        setEditDescription(selectedFollowUp.description)
        setEditRequirement(selectedFollowUp.requirement)
        setEditFollowupDate(selectedFollowUp.followupDate)
        setIsEditing(true)
    }

    const handleSaveEdit = () => {
        if (!selectedFollowUp) return
        updateFollowUp(selectedFollowUp.id, {
            description: editDescription,
            requirement: editRequirement,
            followupDate: editFollowupDate,
        })
        setSelectedFollowUp({
            ...selectedFollowUp,
            description: editDescription,
            requirement: editRequirement,
            followupDate: editFollowupDate,
        })
        setIsEditing(false)
        setDetailsOpen(false)
        toast({ title: 'Follow-up updated successfully' })
    }

    // Form state
    const [name, setName] = useState('')
    const [number, setNumber] = useState('')
    const [description, setDescription] = useState('')
    const [followupDate, setFollowupDate] = useState('')
    const [requirement, setRequirement] = useState('')

    // Near to followup date (deadline within next 24 hours, or past due)
    const upcomingFollowUps = useMemo(() => {
        const now = new Date()
        const tomorrow = addDays(startOfDay(now), 1)
        return followUps.filter(f => {
            const fDate = new Date(f.followupDate)
            return isBefore(fDate, tomorrow)
        })
    }, [followUps])

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        addFollowUp({
            name,
            date: new Date().toISOString(),
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
        <div className="space-y-4 md:space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold">Daily Follow Ups</h1>
                    <p className="text-sm text-muted-foreground">Manage and track your follow-up tasks.</p>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 gradient-primary text-white font-medium shadow-lg shadow-blue-500/25 hover:opacity-90 transition-opacity rounded-xl px-5">
                            <Plus className="w-4 h-4" />
                            <span>Add Follow Up</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[480px] rounded-[20px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1117] shadow-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-bold">Add New Follow Up</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
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
                                <Input id="description" placeholder="Brief description" value={description} onChange={e => setDescription(e.target.value)} required className="rounded-xl h-10 border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-primary" />
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

            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                <div className="group relative overflow-hidden rounded-[20px] bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-5 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/10 shadow-lg dark:shadow-2xl">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-all duration-300">
                            <ClipboardList className="h-6 w-6" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">{followUps.length}</div>
                        <p className="text-base font-semibold text-slate-500 dark:text-slate-400 tracking-tight">Total Follow-ups</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all duration-500" />
                </div>

                <div className="group relative overflow-hidden rounded-[20px] bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-5 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/10 shadow-lg dark:shadow-2xl">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-all duration-300">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        {upcomingFollowUps.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold tracking-tight bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/10">
                                Urgent
                            </span>
                        )}
                    </div>
                    <div className="space-y-1">
                        <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">{upcomingFollowUps.length}</div>
                        <p className="text-base font-semibold text-slate-500 dark:text-slate-400 tracking-tight">Attention Needed</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all duration-500" />
                </div>

                <div className="group relative overflow-hidden rounded-[20px] bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 p-5 transition-all duration-300 hover:bg-slate-50 dark:hover:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/10 shadow-lg dark:shadow-2xl">
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-all duration-300">
                            <Target className="h-6 w-6" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                            {new Set(followUps.map(f => f.number)).size}
                        </div>
                        <p className="text-base font-semibold text-slate-500 dark:text-slate-400 tracking-tight">Unique Contacts</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all duration-500" />
                </div>
            </div>

            {/* Alert for upcoming follow-ups */}
            {upcomingFollowUps.length > 0 && (
                <div className="rounded-[20px] bg-white dark:bg-white/[0.02] border border-amber-300/50 dark:border-amber-500/20 p-5 md:p-6 shadow-lg dark:shadow-none transition-colors">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                            <BellRing className="w-5 h-5 text-amber-500 dark:text-amber-400 animate-pulse" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-amber-700 dark:text-amber-400 text-base mb-3">
                                Attention Needed — {upcomingFollowUps.length} follow-up{upcomingFollowUps.length > 1 ? 's' : ''} due
                            </h3>
                            <div className="grid gap-2">
                                {upcomingFollowUps.map(f => (
                                    <div key={f.id} className="flex items-center justify-between bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all duration-200 p-3.5 rounded-xl text-sm border border-slate-200/60 dark:border-white/5">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                            <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400 shrink-0">
                                                {f.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-semibold text-slate-800 dark:text-amber-400 text-[14px]">{f.name}</span>
                                            <span className="hidden sm:inline text-slate-300 dark:text-white/10">|</span>
                                            <span onClick={() => handleNumberClick(f)} className="font-semibold text-primary hover:text-primary/80 font-mono text-sm cursor-pointer underline decoration-primary/30 underline-offset-2 transition-colors">{f.number}</span>
                                            <span className="hidden sm:inline text-slate-300 dark:text-white/10">|</span>
                                            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[200px] sm:max-w-[300px] text-[13px]">{f.description}</span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-[11px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                                {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                            </span>
                                            <Button variant="ghost" size="sm" onClick={() => removeFollowUp(f.id)} className="h-8 px-3 rounded-lg text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors shrink-0 text-xs font-bold">
                                                ✓ Complete
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="rounded-[20px] bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 overflow-hidden shadow-lg dark:shadow-none transition-colors">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse">
                        <thead>
                            <tr className="text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
                                <th className="px-5 py-4">Date</th>
                                <th className="px-5 py-4">Name</th>
                                <th className="px-5 py-4">Number</th>
                                <th className="px-5 py-4">Description</th>
                                <th className="px-5 py-4">Requirement</th>
                                <th className="px-5 py-4">Deadline</th>
                                <th className="px-5 py-4">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {followUps.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-16 text-center">
                                        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mx-auto mb-4">
                                            <ClipboardList className="w-8 h-8 text-muted-foreground/40" />
                                        </div>
                                        <p className="text-base font-semibold mb-1.5 text-slate-700 dark:text-white">No follow-ups found</p>
                                        <p className="text-sm text-muted-foreground">Start by adding a new follow-up for your daily tasks.</p>
                                    </td>
                                </tr>
                            ) : (
                                followUps.map((f) => {
                                    const isUrgent = upcomingFollowUps.some(u => u.id === f.id)
                                    return (
                                        <tr key={f.id} className={`group hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200 ${isUrgent ? 'bg-amber-50/50 dark:bg-amber-500/[0.03]' : ''}`}>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2.5 text-[13px] font-medium text-slate-600 dark:text-slate-300">
                                                    <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                                                    {format(new Date(f.date), 'MMM dd, yyyy')}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                                                        {f.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-[14px] font-semibold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{f.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <Phone className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                                                    <span onClick={() => handleNumberClick(f)} className="font-mono cursor-pointer text-primary hover:text-primary/80 hover:underline underline-offset-2 transition-colors text-[13px] font-semibold">{f.number}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-[13px] max-w-[200px] truncate text-slate-600 dark:text-slate-400">{f.description}</td>
                                            <td className="px-5 py-4 text-[13px] max-w-[200px] truncate text-slate-600 dark:text-slate-400">{f.requirement}</td>
                                            <td className="px-5 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${isUrgent ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10'}`}>
                                                    {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <Button variant="ghost" size="sm" onClick={() => removeFollowUp(f.id)} className="h-8 px-3 rounded-lg text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-500/10 transition-all text-xs font-bold">
                                                    ✓ Complete
                                                </Button>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Follow-up Details Dialog */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent className="sm:max-w-[620px] rounded-[20px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1117] shadow-2xl p-0 overflow-hidden">
                    {/* Dialog Header with gradient accent */}
                    <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
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
                        <div className="px-6 py-5 space-y-6">
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
                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{format(new Date(selectedFollowUp.date), 'MMM dd, yyyy')}</p>
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
                                        <Input value={editDescription} onChange={e => setEditDescription(e.target.value)} className="h-9 text-sm rounded-xl border-slate-200 dark:border-white/10 bg-white dark:bg-white/5" />
                                    ) : (
                                        <p className="text-[14px] text-slate-700 dark:text-slate-300 leading-relaxed">{selectedFollowUp.description}</p>
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
                                    {followUps
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
                                                        {format(new Date(f.date), 'MMM dd')}
                                                    </span>
                                                </div>
                                                <p className="text-[13px] text-slate-600 dark:text-slate-400 pl-4 leading-relaxed">{f.description}</p>
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
    )
}
