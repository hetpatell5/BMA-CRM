'use client'

import { useState, useMemo } from 'react'
import { Plus, BellRing, Phone, Calendar, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useFollowUpStore } from '@/stores/followUpStore'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/hooks/use-toast'
import { format, isBefore, addDays, startOfDay } from 'date-fns'

export default function FollowUpsPage() {
    const { user } = useAuthStore()
    const { followUps, addFollowUp, removeFollowUp } = useFollowUpStore()
    const { toast } = useToast()
    const [open, setOpen] = useState(false)

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
                <ClipboardList className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground mt-2">Only Admins, Managers, and Telecallers can access this page.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Daily Follow Ups</h1>
                </div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 gradient-primary text-white">
                            <Plus className="w-4 h-4" />
                            <span>Add Follow Up</span>
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Add New Follow Up</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input id="name" placeholder="Contact name" value={name} onChange={e => setName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="number">Number</Label>
                                <Input id="number" type="tel" placeholder="Phone number" value={number} onChange={e => setNumber(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input id="description" placeholder="Brief description" value={description} onChange={e => setDescription(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="followupDate">Follow-up Date (Deadline)</Label>
                                <Input id="followupDate" type="date" value={followupDate} onChange={e => setFollowupDate(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="requirement">Requirement</Label>
                                <Input id="requirement" placeholder="Customer requirement" value={requirement} onChange={e => setRequirement(e.target.value)} required />
                            </div>
                            <Button type="submit" className="w-full gradient-primary text-white">Save Follow Up</Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Alert for upcoming follow-ups */}
            {upcomingFollowUps.length > 0 && (
                <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/10 mb-6 transition-colors">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-1">
                            <BellRing className="w-5 h-5 text-amber-600 dark:text-amber-500 animate-pulse" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-amber-700 dark:text-amber-500 text-lg mb-2">
                                Attention Needed ({upcomingFollowUps.length})
                            </h3>
                            <div className="grid gap-2">
                                {upcomingFollowUps.map(f => (
                                    <div key={f.id} className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors p-3 rounded-lg text-sm border border-amber-500/20">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                            <span className="font-semibold text-amber-800 dark:text-amber-400 text-base">{f.name}</span>
                                            <span className="hidden sm:inline text-amber-700/40 dark:text-amber-500/40">•</span>
                                            <span className="font-semibold text-amber-800/80 dark:text-amber-400/80 font-mono text-sm">{f.number}</span>
                                            <span className="hidden sm:inline text-amber-700/40 dark:text-amber-500/40">•</span>
                                            <span className="text-amber-900/80 dark:text-amber-400/80 truncate max-w-[200px] sm:max-w-[300px]">{f.description}</span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span className="text-xs font-bold bg-amber-500/20 text-amber-800 dark:text-amber-400 px-2 py-1 rounded">
                                                {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                            </span>
                                            <Button variant="ghost" size="sm" onClick={() => removeFollowUp(f.id)} className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 transition-colors shrink-0">
                                                Complete
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px]">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Number</th>
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requirement</th>
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deadline</th>
                                <th className="p-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {followUps.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center">
                                        <ClipboardList className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                                        <p className="text-lg font-medium mb-2">No follow-ups found</p>
                                        <p className="text-muted-foreground mb-4">Start by adding a new follow-up for your daily tasks.</p>
                                    </td>
                                </tr>
                            ) : (
                                followUps.map((f) => {
                                    const isUrgent = upcomingFollowUps.some(u => u.id === f.id)
                                    return (
                                        <tr key={f.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${isUrgent ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                                    {format(new Date(f.date), 'MMM dd, yyyy')}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm font-medium">{f.name}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-mono">{f.number}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm max-w-[200px] truncate">{f.description}</td>
                                            <td className="p-4 text-sm max-w-[200px] truncate">{f.requirement}</td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${isUrgent ? 'bg-amber-500/15 text-amber-600 dark:text-amber-500 border border-amber-500/30' : 'bg-white/10 text-slate-700 dark:text-white'}`}>
                                                    {format(new Date(f.followupDate), 'MMM dd, yyyy')}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <Button variant="ghost" size="sm" onClick={() => removeFollowUp(f.id)} className="text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors">
                                                    Complete
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
        </div>
    )
}
