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
    const [date, setDate] = useState('')
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
            date,
            number,
            description,
            followupDate,
            requirement
        })
        toast({ title: 'Follow up added successfully' })
        setOpen(false)
        setDate('')
        setNumber('')
        setDescription('')
        setFollowupDate('')
        setRequirement('')
    }

    // Role check
    if (user?.staffRole !== 'TELECALLER') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <ClipboardList className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <h1 className="text-2xl font-bold">Access Denied</h1>
                <p className="text-muted-foreground mt-2">Only telecallers can access this page.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Daily Follow Ups</h1>
                    <p className="text-muted-foreground text-sm">
                        Manage your independent follow-ups efficiently
                    </p>
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
                                <Label htmlFor="date">Date</Label>
                                <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
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
                <div className="glass rounded-xl p-4 border border-amber-500/30 bg-amber-500/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <BellRing className="w-5 h-5 text-amber-500 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-amber-500">Upcoming Follow Ups Alert</h3>
                            <p className="text-sm text-amber-500/80">You have {upcomingFollowUps.length} follow-up(s) scheduled for today or overdue.</p>
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
                                    <td colSpan={6} className="p-12 text-center">
                                        <ClipboardList className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                                        <p className="text-lg font-medium mb-2">No follow-ups found</p>
                                        <p className="text-muted-foreground mb-4">Start by adding a new follow-up for your daily tasks.</p>
                                    </td>
                                </tr>
                            ) : (
                                followUps.map((f) => {
                                    const isUrgent = upcomingFollowUps.some(u => u.id === f.id)
                                    return (
                                        <tr key={f.id} className={`border-b border-white/5 hover:bg-white/[0.04] transition-colors ${isUrgent ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                                    {format(new Date(f.date), 'MMM dd, yyyy')}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-1.5 text-sm">
                                                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-mono">{f.number}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm max-w-[200px] truncate">{f.description}</td>
                                            <td className="p-4 text-sm max-w-[200px] truncate">{f.requirement}</td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${isUrgent ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30' : 'bg-white/10 text-white'}`}>
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
