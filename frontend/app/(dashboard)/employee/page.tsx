'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { studentsAPI } from '@/lib/api'
import {
    CheckCircle, Coffee, Pause, AlertCircle, Play, Target, Users, LayoutDashboard, ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'

const STATUS_OPTIONS = [
    { value: 'AVAILABLE', label: 'Available', icon: CheckCircle, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    { value: 'BUSY', label: 'Busy', icon: AlertCircle, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    { value: 'ON_BREAK', label: 'On Break', icon: Coffee, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    { value: 'SHORT_LEAVE', label: 'Short Leave', icon: Pause, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
]

export default function EmployeeDashboardPage() {
    const { user, _hasHydrated } = useAuthStore()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const router = require('next/navigation').useRouter()
    const [currentStatus, setCurrentStatus] = useState('AVAILABLE')

    useEffect(() => {
        if (_hasHydrated && user) {
            const isTelecaller = user.role === 'STAFF' && user.staffRole === 'TELECALLER'
            if (user.role === 'STAFF' && !isTelecaller) {
                router.push('/dashboard')
            }
        }
    }, [user, _hasHydrated, router])

    // Fetch my tasks (using raw api call as we just need basic stats here)
    const { data: tasksData, isLoading: tasksLoading } = useQuery({
        queryKey: ['my-tasks'],
        queryFn: async () => (await api.get('/tasks')).data
    })

    // Fetch my students
    const { data: studentsData, isLoading: studentsLoading } = useQuery({
        queryKey: ['my-students'],
        queryFn: async () => (await studentsAPI.getAll({ page: 1, limit: 1 })).data.data
    })

    // Fetch my current status
    const { data: statusData } = useQuery({
        queryKey: ['my-status'],
        queryFn: async () => (await api.get('/availability/me')).data
    })

    useEffect(() => {
        if (statusData?.data?.status) {
            setCurrentStatus(statusData.data.status)
        }
    }, [statusData])

    // Update status mutation
    const updateStatus = useMutation({
        mutationFn: async (newStatus: string) => {
            await api.put('/availability/status', { status: newStatus })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-status'] })
            toast({ title: 'Status Display Updated', description: 'Your team can now see your latest availability.', variant: 'success' })
        }
    })

    const tasks = tasksData?.data || []
    const pendingTasks = tasks.filter((t: any) => t.status !== 'COMPLETED')
    const totalStudents = studentsData?.pagination?.total || 0

    return (
        <div className="space-y-8 animate-fade-in pb-10 max-w-5xl mx-auto">
            {/* Header & Status Card */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-6 sm:p-8 rounded-2xl border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -z-10 translate-x-1/2 -translate-y-1/2" />
                
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, <span className="text-primary">{user?.fullName?.split(' ')[0] || 'Team Member'}</span>
                    </h1>
                    <p className="text-muted-foreground mt-1.5 text-[15px]">Here's what is happening in your workspace today.</p>
                </div>

                <div className="glass-dropdown p-2 rounded-[14px] border border-white/5 shadow-2xl shrink-0">
                    <div className="flex items-center gap-1.5 flex-wrap justify-center">
                        {STATUS_OPTIONS.map(opt => {
                            const Icon = opt.icon
                            const isActive = currentStatus === opt.value
                            return (
                                <button
                                    key={opt.value}
                                    onClick={() => { setCurrentStatus(opt.value); updateStatus.mutate(opt.value) }}
                                    className={`relative flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-[13px] font-semibold transition-all duration-200 ${
                                        isActive 
                                            ? `${opt.color} border shadow-inner` 
                                            : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    <Icon className={`w-4 h-4 ${isActive ? '' : 'opacity-70'}`} />
                                    {isActive ? opt.label : <span className="hidden sm:inline">{opt.label}</span>}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Quick Actions / Shortcuts */}
            <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-blue-400" /> Platform Shortcuts
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Link href="/orders" className="group">
                        <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all flex items-center justify-between shadow-sm hover:shadow-xl hover:border-blue-500/20">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h3 className="font-semibold text-[15px] group-hover:text-blue-400 transition-colors">My Assigned Students</h3>
                                    <p className="text-[13px] text-muted-foreground mt-0.5">View & manage student requirements</p>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </div>
                    </Link>

                    <Link href="/tasks" className="group">
                        <div className="p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all flex items-center justify-between shadow-sm hover:shadow-xl hover:border-purple-500/20">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                                    <LayoutDashboard className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col justify-center">
                                    <h3 className="font-semibold text-[15px] group-hover:text-purple-400 transition-colors">Task Board</h3>
                                    <p className="text-[13px] text-muted-foreground mt-0.5">Manage priorities and status updates</p>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </div>
                    </Link>
                </div>
            </div>

            {/* Important Info Overview */}
            <div>
                 <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Play className="w-5 h-5 text-emerald-400" /> Current Workload
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="glass border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:bg-white/[0.05] transition-colors">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">Total Assigned Students</p>
                                    {studentsLoading ? (
                                        <div className="h-10 w-16 bg-white/10 rounded animate-pulse" />
                                    ) : (
                                        <h3 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                                            {totalStudents}
                                        </h3>
                                    )}
                                </div>
                                <div className="p-3.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400 shadow-lg shadow-blue-500/10">
                                    <Users className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="glass border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:bg-white/[0.05] transition-colors">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground mb-2">Active & Pending Tasks</p>
                                    {tasksLoading ? (
                                        <div className="h-10 w-16 bg-white/10 rounded animate-pulse" />
                                    ) : (
                                        <h3 className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                                            {pendingTasks.length}
                                        </h3>
                                    )}
                                </div>
                                <div className="p-3.5 bg-purple-500/10 rounded-xl border border-purple-500/20 text-purple-400 shadow-lg shadow-purple-500/10">
                                    <Target className="w-6 h-6" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <div className="flex justify-center mt-6">
                 <Link href="/tasks">
                     <Button variant="outline" className="rounded-full px-8 opacity-70 hover:opacity-100 hover:bg-white/10">
                         View Complete Task Board
                     </Button>
                 </Link>
            </div>
        </div>
    )
}

