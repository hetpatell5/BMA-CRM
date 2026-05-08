'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    Users, Plus, Edit, Trash2, Loader2,
    Crown, UserCog, AlertTriangle, RefreshCw, Mail, Clock,
    ChevronDown, BookOpen, Star, Layers, PhoneCall, PenTool, IndianRupee, Eye, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { teamAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'

const STAFF_ROLE_OPTIONS = [
    {
        value: 'GUIDE',
        label: 'Guide',
        icon: BookOpen,
        menuClass: 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10',
        badgeClass: 'from-emerald-100 to-green-100 dark:from-emerald-500/20 dark:to-green-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
        requiresDegree: true,
    },
    {
        value: 'EXPERT',
        label: 'Expert',
        icon: Star,
        menuClass: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/10',
        badgeClass: 'from-amber-100 to-orange-100 dark:from-amber-500/20 dark:to-orange-500/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
        requiresDegree: true,
    },
    {
        value: 'BOTH',
        label: 'Guide & Expert',
        icon: Layers,
        menuClass: 'text-violet-600 dark:text-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:hover:bg-violet-500/10',
        badgeClass: 'from-violet-100 to-indigo-100 dark:from-violet-500/20 dark:to-indigo-500/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
        requiresDegree: true,
    },
    {
        value: 'TELECALLER',
        label: 'Telecaller',
        icon: PhoneCall,
        menuClass: 'text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-500/10',
        badgeClass: 'from-cyan-100 to-sky-100 dark:from-cyan-500/20 dark:to-sky-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-500/30',
        requiresDegree: false,
    },
    {
        value: 'WRITER',
        label: 'Writer',
        icon: PenTool,
        menuClass: 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10',
        badgeClass: 'from-rose-100 to-pink-100 dark:from-rose-500/20 dark:to-pink-500/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
        requiresDegree: true,
    },
] as const

const DEGREE_BASED_STAFF_ROLES = new Set<string>(
    STAFF_ROLE_OPTIONS
        .filter(option => option.requiresDegree)
        .map(option => option.value)
)

const getStaffRoleOption = (staffRole?: string | null) => STAFF_ROLE_OPTIONS.find(option => (
    option.value === staffRole || (option.value === 'WRITER' && staffRole === 'WRITTER')
))

export default function SettingsPage() {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { user: currentUser } = useAuthStore()
    const canAccessTeamManagement = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'
    const canCreateMembers = currentUser?.role === 'ADMIN'

    const [showAddModal, setShowAddModal]         = useState(false)
    const [showEditModal, setShowEditModal]       = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showAssignMenu, setShowAssignMenu]     = useState<number | null>(null)
    const [deleteTarget, setDeleteTarget]         = useState<any>(null)
    const [selectedUser, setSelectedUser]         = useState<any>(null)

    // Role filter for team table
    const [roleFilter, setRoleFilter]             = useState<string>('ALL')

    // Assign modal state
    const [showAssignModal, setShowAssignModal]   = useState(false)
    const [assignTarget, setAssignTarget]         = useState<any>(null)   // the member being assigned
    const [assignData, setAssignData]             = useState({ staffRole: '', degree: '' })

    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentTarget, setPaymentTarget]       = useState<any>(null)
    const [paymentData, setPaymentData]           = useState({ bankName: '', bankAccName: '', bankAccNo: '', ifscCode: '', upiId: '', bankBranch: '' })

    const [showViewModal, setShowViewModal]       = useState(false)
    const [viewTarget, setViewTarget]             = useState<any>(null)
    const [viewPaymentData, setViewPaymentData]   = useState<any>(null)
    const [isLoadingPayment, setIsLoadingPayment] = useState(false)

    const [formData, setFormData] = useState({
        email:    '',
        password: '',
        fullName: '',
        role:     'STAFF',   // ADMIN | MANAGER | STAFF
    })

    const resetForm = () => setFormData({ email: '', password: '', fullName: '', role: 'STAFF' })

    // ── Queries ──────────────────────────────────────────────────────────────
    const { data: teamResponse, isLoading } = useQuery({
        queryKey: ['team'],
        queryFn: async () => (await teamAPI.getAll()).data.data,
        enabled: canAccessTeamManagement,
    })

    // ── Mutations ─────────────────────────────────────────────────────────────
    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['team'] })
        queryClient.invalidateQueries({ queryKey: ['managers'] })
        queryClient.invalidateQueries({ queryKey: ['my-team'] })
    }

    const createMutation = useMutation({
        mutationFn: (data: any) => teamAPI.create(data),
        onSuccess: () => {
            invalidate()
            setShowAddModal(false)
            resetForm()
            toast({ title: 'Success!', description: 'Team member added successfully', variant: 'success' })
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message || 'Failed to create user', variant: 'destructive' }),
    })

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) => teamAPI.update(id, data),
        onSuccess: () => {
            invalidate()
            setShowEditModal(false)
            setSelectedUser(null)
            toast({ title: 'Updated!', description: 'Team member updated successfully', variant: 'success' })
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message || 'Failed to update user', variant: 'destructive' }),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: number) => teamAPI.delete(id),
        onSuccess: () => {
            invalidate()
            setShowDeleteConfirm(false)
            setDeleteTarget(null)
            toast({ title: 'Deleted!', description: 'Team member permanently removed', variant: 'success' })
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message || 'Failed to delete user', variant: 'destructive' }),
    })

    const closeAssignModal = () => {
        setShowAssignMenu(null)
        setShowAssignModal(false)
        setAssignTarget(null)
        setAssignData({ staffRole: '', degree: '' })
    }

    // Assign staff role + optional degree to a STAFF member
    const assignMutation = useMutation({
        mutationFn: ({ id, staffRole, degree }: { id: number; staffRole: string; degree: string }) =>
            teamAPI.update(id, {
                staffRole,
                degree: DEGREE_BASED_STAFF_ROLES.has(staffRole) ? (degree.trim() || null) : null,
            }),
        onSuccess: (_, { staffRole }) => {
            invalidate()
            closeAssignModal()
            const label = getStaffRoleOption(staffRole)?.label || 'Staff'
            toast({ title: 'Assigned!', description: `Member assigned as ${label}`, variant: 'success' })
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message || 'Failed to assign', variant: 'destructive' }),
    })

    const openAssignModal = (member: any, staffRole: string) => {
        setAssignTarget(member)
        setAssignData({
            staffRole,
            degree: DEGREE_BASED_STAFF_ROLES.has(staffRole) ? member.degree || '' : '',
        })
        setShowAssignMenu(null)
        setShowAssignModal(true)
    }

    const handleAssign = (e: React.FormEvent) => {
        e.preventDefault()
        if (!assignTarget) return

        if (DEGREE_BASED_STAFF_ROLES.has(assignData.staffRole) && !assignData.degree.trim()) {
            toast({ title: 'Degree required', description: 'Please specify a degree for guide or expert assignments.', variant: 'destructive' })
            return
        }

        assignMutation.mutate({ id: assignTarget.id, staffRole: assignData.staffRole, degree: assignData.degree })
    }

    const paymentMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: any }) => teamAPI.updatePaymentDetails(id, data),
        onSuccess: () => {
            setShowPaymentModal(false)
            setPaymentTarget(null)
            toast({ title: 'Saved!', description: 'Payment details updated successfully', variant: 'success' })
        },
        onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message || 'Failed to update payment details', variant: 'destructive' }),
    })

    const openPaymentModal = async (member: any) => {
        setPaymentTarget(member)
        try {
            const res = await teamAPI.getPaymentDetails(member.id)
            const pd = res.data.data
            setPaymentData({
                bankName: pd.bankName || '',
                bankAccName: pd.bankAccName || '',
                bankAccNo: pd.bankAccNo || '',
                ifscCode: pd.ifscCode || '',
                upiId: pd.upiId || '',
                bankBranch: pd.bankBranch || '',
            })
            setShowPaymentModal(true)
        } catch (e: any) {
            toast({ title: 'Error', description: 'Could not fetch payment details', variant: 'destructive' })
        }
    }

    const handlePaymentSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!paymentTarget) return
        paymentMutation.mutate({ id: paymentTarget.id, data: paymentData })
    }

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault()
        createMutation.mutate({
            email:     formData.email,
            password:  formData.password,
            fullName:  formData.fullName,
            role:      formData.role,
            staffRole: null,
        })
    }

    const openEditModal = (user: any) => {
        setSelectedUser(user)
        setFormData({
            email:    user.email,
            password: '',
            fullName: user.fullName,
            role:     user.role,
        })
        setShowEditModal(true)
    }

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedUser) return
        updateMutation.mutate({
            id: selectedUser.id,
            data: { 
                fullName: formData.fullName, 
                email: formData.email,
                role: formData.role 
            },
        })
    }

    const canEditMember = (member: any) => (
        currentUser?.role === 'ADMIN' || (currentUser?.role === 'MANAGER' && member.role === 'STAFF')
    )

    const canAssignStaffRole = (member: any) => (
        member.role === 'STAFF' && canEditMember(member)
    )

    // ── Badge helpers ─────────────────────────────────────────────────────────
    const getRoleBadge = (role: string, staffRole?: string) => {
        if (role === 'ADMIN') return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-500/20 dark:to-pink-500/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30 shadow-sm">
                <Crown className="w-3.5 h-3.5" />Admin
            </span>
        )
        if (role === 'MANAGER') return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-gradient-to-r from-blue-100 to-cyan-100 dark:from-blue-500/20 dark:to-cyan-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 shadow-sm">
                <UserCog className="w-3.5 h-3.5" />Leader
            </span>
        )

        const staffRoleOption = getStaffRoleOption(staffRole)
        if (staffRoleOption) {
            const RoleIcon = staffRoleOption.icon

            return (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-gradient-to-r shadow-sm ${staffRoleOption.badgeClass}`}>
                    <RoleIcon className="w-3.5 h-3.5" />
                    {staffRoleOption.label}
                </span>
            )
        }

        // STAFF with no staffRole yet
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border bg-gradient-to-r from-slate-100 to-gray-100 dark:from-slate-500/20 dark:to-gray-500/20 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-500/30 shadow-sm">
                <Users className="w-3.5 h-3.5" />Staff
            </span>
        )
    }

    const getStatusBadge = (status: string) => status === 'ACTIVE' ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Active
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20">
            <div className="w-2 h-2 rounded-full bg-red-500" />Inactive
        </span>
    )

    if (!canAccessTeamManagement) return (
        <div className="glass rounded-2xl border border-white/10 p-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h2 className="text-lg font-semibold mb-2">Team Management</h2>
            <p className="text-sm text-muted-foreground">Only admins and leaders can access this page.</p>
        </div>
    )

    // ─── Loading ──────────────────────────────────────────────────────────────
    if (isLoading) return (
        <div className="space-y-6">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
        </div>
    )

    const team = teamResponse || []

    // Filtered team based on role tab
    const filteredTeam = team.filter((m: any) => {
        if (roleFilter === 'ALL') return true
        if (roleFilter === 'GUIDE') return m.staffRole === 'GUIDE'
        if (roleFilter === 'EXPERT') return m.staffRole === 'EXPERT'
        if (roleFilter === 'BOTH') return m.staffRole === 'BOTH'
        if (roleFilter === 'TELECALLER') return m.staffRole === 'TELECALLER'
        if (roleFilter === 'WRITTER') return m.staffRole === 'WRITTER' || m.staffRole === 'WRITER'
        return true
    })

    return (
        <div className="space-y-6" onClick={() => showAssignMenu !== null && setShowAssignMenu(null)}>
            {/* Header */}
            <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-2xl p-4 sm:p-5">
                <div className="px-2">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Team Management</h1>
                </div>
                <div className="flex items-center gap-3">
                    {canCreateMembers && (
                        <Button onClick={() => { resetForm(); setShowAddModal(true) }} className="gap-2">
                            <Plus className="w-4 h-4" /> Add Member
                        </Button>
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total Guides',          count: team.filter((m: any) => m.staffRole === 'GUIDE').length,            tag: 'Guides' },
                    { label: 'Total Experts',         count: team.filter((m: any) => m.staffRole === 'EXPERT').length,           tag: 'Experts' },
                    { label: 'Total Telecallers',     count: team.filter((m: any) => m.staffRole === 'TELECALLER').length,       tag: 'Telecallers' },
                    { label: 'Total Writters',        count: team.filter((m: any) => m.staffRole === 'WRITTER' || m.staffRole === 'WRITER').length, tag: 'Writters' },
                ].map(({ label, count, tag }) => (
                    <div key={label} className="bg-transparent border border-white/10 rounded-xl p-5 hover:bg-white/[0.02] transition-colors">
                        <p className="text-sm text-muted-foreground mb-4">{label}</p>
                        <div className="flex items-center gap-3">
                            <h3 className="text-3xl font-bold text-foreground">{count}</h3>
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground">{tag}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Role Filter Tabs */}
            <div className="flex flex-wrap gap-2">
                {[
                    { value: 'ALL',       label: 'All Staff' },
                    { value: 'GUIDE',     label: 'Guide' },
                    { value: 'EXPERT',    label: 'Expert' },
                    { value: 'BOTH',      label: 'Guide & Expert' },
                    { value: 'TELECALLER',label: 'Telecaller' },
                    { value: 'WRITTER',   label: 'Writter' },
                ].map(({ value, label }) => (
                    <button
                        key={value}
                        onClick={() => setRoleFilter(value)}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 border ${
                            roleFilter === value
                                ? 'bg-white/10 border-transparent text-foreground shadow-sm'
                                : 'bg-transparent border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Team Table */}
            <div className="glass rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="text-left py-4 px-5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Member</th>
                                <th className="text-left py-4 px-5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Role</th>
                                <th className="text-left py-4 px-5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Degree</th>
                                <th className="text-left py-4 px-5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Status</th>
                                <th className="text-left py-4 px-5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Last Login</th>
                                <th className="text-right py-4 px-5 text-[13px] font-medium text-muted-foreground whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredTeam.map((member: any) => {
                                const canEditThisMember = canEditMember(member)
                                const canAssignThisMember = canAssignStaffRole(member)

                                return (
                                    <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                                        {/* Member */}
                                        <td className="py-4 px-5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-sm">
                                                    {member.avatar ? (
                                                        <img src={member.avatar} alt={member.fullName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <span className="text-sm font-medium text-foreground/80">
                                                            {member.fullName?.charAt(0)?.toUpperCase()}
                                                            {member.fullName?.split(' ')[1]?.charAt(0)?.toUpperCase() || ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-foreground text-[14px] flex items-center gap-2 capitalize">
                                                        {member.fullName}
                                                        <span className="text-[11px] text-muted-foreground font-normal normal-case">#{member.id}</span>
                                                    </span>
                                                    <span className="text-[12px] text-muted-foreground mt-0.5">{member.email}</span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Role */}
                                        <td className="py-4 px-5">
                                            <span className="text-[13px] text-muted-foreground font-medium uppercase tracking-wider">
                                                {member.role === 'ADMIN' ? 'ADMIN' : member.role === 'MANAGER' ? 'LEADER' : (getStaffRoleOption(member.staffRole)?.label || member.staffRole || 'STAFF')}
                                            </span>
                                        </td>

                                        {/* Degree */}
                                        <td className="py-4 px-5">
                                            <span className="text-[13px] text-muted-foreground">
                                                {member.degree ? member.degree : '—'}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="py-4 px-5">
                                            {member.status === 'ACTIVE' ? (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border border-emerald-500/20 text-emerald-400 bg-transparent">
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border border-red-500/20 text-red-400 bg-transparent">
                                                    Inactive
                                                </span>
                                            )}
                                        </td>

                                        {/* Last Login */}
                                        <td className="py-4 px-5">
                                            <span className="text-[13px] text-muted-foreground">
                                                {member.lastLogin ? formatDateTime(member.lastLogin) : 'Never'}
                                            </span>
                                        </td>

                                        {/* Actions */}
                                        <td className="py-4 px-5">
                                            <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                                {/* View Details */}
                                                <Link href={`/team/${member.id}`}>
                                                    <button className="w-8 h-8 rounded-md border border-white/10 hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors" title="View dashboard">
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                </Link>

                                                {/* Assign button */}
                                                {canAssignThisMember && (
                                                    <div className="relative" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            className="h-8 px-2.5 rounded-md border border-white/10 hover:bg-white/5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                            onClick={() => setShowAssignMenu(showAssignMenu === member.id ? null : member.id)}
                                                            title="Assign role type"
                                                        >
                                                            <Layers className="w-3.5 h-3.5" />
                                                            Assign
                                                            <ChevronDown className="w-3 h-3" />
                                                        </button>

                                                        {showAssignMenu === member.id && (
                                                            <div className="absolute right-0 top-full mt-1 z-50 glass rounded-xl border border-white/10 shadow-2xl overflow-hidden w-52 animate-fade-in">
                                                                {STAFF_ROLE_OPTIONS.map(({ value, label, icon: Icon, menuClass }) => (
                                                                    <button
                                                                        key={value}
                                                                        onClick={() => openAssignModal(member, value)}
                                                                        className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors ${menuClass} ${member.staffRole === value || (value === 'WRITER' && member.staffRole === 'WRITTER') ? 'bg-white/5 font-semibold' : ''}`}
                                                                    >
                                                                        <Icon className="w-4 h-4 shrink-0" />
                                                                        {label}
                                                                        {(member.staffRole === value || (value === 'WRITER' && member.staffRole === 'WRITTER')) && <span className="ml-auto text-xs opacity-60">✓</span>}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Payment Details */}
                                                {currentUser?.role === 'ADMIN' && (
                                                    <button
                                                        className="w-8 h-8 rounded-md border border-white/10 hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                                        onClick={() => openPaymentModal(member)}
                                                        title="Payment details"
                                                    >
                                                        <IndianRupee className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Edit */}
                                                {canEditThisMember && (
                                                    <button
                                                        className="w-8 h-8 rounded-md border border-white/10 hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                                        onClick={() => openEditModal(member)}
                                                        title="Edit member"
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                )}

                                                {/* Delete */}
                                                {canCreateMembers && member.id !== currentUser?.id && (
                                                    <button
                                                        className="w-8 h-8 rounded-md border border-white/10 hover:bg-white/5 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors"
                                                        onClick={() => { setDeleteTarget(member); setShowDeleteConfirm(true) }}
                                                        title="Delete member permanently"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}

                            {filteredTeam.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                                        <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                        <p className="text-lg font-medium text-foreground/70 mb-1">
                                            {roleFilter === 'ALL' ? 'No team members' : `No ${roleFilter.charAt(0) + roleFilter.slice(1).toLowerCase()} members`}
                                        </p>
                                        <p className="text-sm">{canCreateMembers ? 'Click "Add Member" to get started.' : 'No staff members are available yet.'}</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── ADD MEMBER MODAL ─── */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 !mt-0">
                    <div className="glass rounded-2xl p-6 max-w-md w-full border border-white/10 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Plus className="w-5 h-5 text-blue-400" />Add Team Member
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => { setShowAddModal(false); resetForm() }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <Label htmlFor="add-fullName">Full Name *</Label>
                                <Input id="add-fullName" value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    placeholder="John Doe" required className="mt-1" />
                            </div>
                            <div>
                                <Label htmlFor="add-email">Email *</Label>
                                <Input id="add-email" type="email" value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="john@example.com" required className="mt-1" />
                            </div>
                            <div>
                                <Label htmlFor="add-password">Password *</Label>
                                <Input id="add-password" type="password" value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    placeholder="••••••••" required className="mt-1" />
                            </div>
                            <div>
                                <Label htmlFor="add-role">Role *</Label>
                                <select id="add-role" value={formData.role}
                                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    className="mt-1 w-full h-10 px-3 rounded-lg bg-background/50 border border-input text-sm"
                                >
                                    <option value="STAFF">Staff</option>
                                    <option value="MANAGER">Leader</option>
                                    <option value="ADMIN">Admin</option>
                                </select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {formData.role === 'ADMIN'   && '🔑 Full access — can manage everything'}
                                        {formData.role === 'MANAGER' && '👥 Can lead teams and view all staff'}
                                        {formData.role === 'STAFF'   && '📋 Staff member — assign Guide, Expert, Telecaller, or Writter from Actions after creation'}
                                    </p>
                                </div>
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Button type="button" variant="outline" onClick={() => { setShowAddModal(false); resetForm() }}>Cancel</Button>
                                <Button type="submit" className="gap-2 gradient-primary" disabled={createMutation.isPending}>
                                    {createMutation.isPending
                                        ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</>
                                        : <><Plus className="w-4 h-4" />Add Member</>}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── EDIT MEMBER MODAL ─── */}
            {showEditModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 !mt-0">
                    <div className="glass rounded-2xl p-6 max-w-md w-full border border-white/10 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Edit className="w-5 h-5 text-blue-400" />Edit Team Member
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => { setShowEditModal(false); setSelectedUser(null) }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div>
                                <Label htmlFor="edit-fullName">Full Name *</Label>
                                <Input id="edit-fullName" value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                    placeholder="John Doe" required className="mt-1" />
                            </div>
                             <div>
                                 <Label htmlFor="edit-email">Email Address *</Label>
                                 <Input 
                                    id="edit-email" 
                                    type="email" 
                                    value={formData.email} 
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    required
                                    className="mt-1" 
                                 />
                             </div>
                            {canCreateMembers && (
                                <div>
                                    <Label htmlFor="edit-role">Role *</Label>
                                    <select id="edit-role" value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        className="mt-1 w-full h-10 px-3 rounded-lg bg-background/50 border border-input text-sm"
                                    >
                                        <option value="STAFF">Staff</option>
                                        <option value="MANAGER">Leader</option>
                                        <option value="ADMIN">Admin</option>
                                    </select>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {formData.role === 'ADMIN'   && '🔑 Full access — can manage everything'}
                                        {formData.role === 'MANAGER' && '👥 Can lead teams and view all staff'}
                                        {formData.role === 'STAFF'   && '📋 Staff member — use Assign in Actions to set Guide, Expert, Telecaller, or Writter'}
                                    </p>
                                </div>
                            )}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Button type="button" variant="outline" onClick={() => { setShowEditModal(false); setSelectedUser(null) }}>Cancel</Button>
                                <Button type="submit" className="gap-2 gradient-primary" disabled={updateMutation.isPending}>
                                    {updateMutation.isPending
                                        ? <><Loader2 className="w-4 h-4 animate-spin" />Updating...</>
                                        : <><Edit className="w-4 h-4" />Save Changes</>}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── DELETE CONFIRMATION MODAL ─── */}
            {showDeleteConfirm && deleteTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in !mt-0">
                    <div className="glass rounded-2xl p-6 max-w-md w-full border border-red-500/20">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">Delete Member</h3>
                                    <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null) }}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                            Are you sure you want to permanently delete
                            <span className="font-medium text-white"> {deleteTarget.fullName}</span>?
                        </p>
                        <ul className="text-xs text-muted-foreground mb-6 space-y-1 pl-4 list-disc">
                            <li>The user account will be permanently removed</li>
                            <li>All their availability data will be deleted</li>
                            <li>Any team members reporting to them will be unassigned</li>
                        </ul>
                        <div className="flex items-center justify-end gap-3">
                            <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteTarget(null) }} disabled={deleteMutation.isPending}>Cancel</Button>
                            <Button variant="destructive" onClick={() => deleteMutation.mutate(deleteTarget.id)} disabled={deleteMutation.isPending} className="gap-2">
                                {deleteMutation.isPending
                                    ? <><RefreshCw className="w-4 h-4 animate-spin" />Deleting...</>
                                    : <><Trash2 className="w-4 h-4" />Yes, Delete</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* ─── ASSIGN MODAL ─── */}
            {showAssignModal && assignTarget && (() => {
                const selectedRole = getStaffRoleOption(assignData.staffRole)
                if (!selectedRole) return null

                const roleLabel = selectedRole.label
                const RoleIcon = selectedRole.icon
                const requiresDegree = selectedRole.requiresDegree

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in !mt-0">
                        <div className="glass rounded-2xl p-6 max-w-sm w-full border border-white/10">
                            <div className="flex items-start justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-violet-500/15 flex items-center justify-center">
                                        <RoleIcon className="w-5 h-5 text-violet-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-lg">Assign as {roleLabel}</h3>
                                        <p className="text-sm text-muted-foreground">{assignTarget.fullName}</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={closeAssignModal}>
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                            <form onSubmit={handleAssign} className="space-y-4">
                                {requiresDegree ? (
                                    <div>
                                        <Label htmlFor="assign-degree">Degree *</Label>
                                        <Input
                                            id="assign-degree"
                                            value={assignData.degree}
                                            onChange={e => setAssignData({ ...assignData, degree: e.target.value })}
                                            placeholder="e.g. B.Sc, M.Sc, B.Ed, BCA"
                                            required
                                            className="mt-1"
                                            autoFocus
                                        />
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Specify which degree&apos;s students they will guide or handle.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                                        No degree mapping is required for this role.
                                    </div>
                                )}
                                <div className="flex items-center justify-end gap-3 pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={closeAssignModal}
                                        disabled={assignMutation.isPending}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        className="gap-2 gradient-primary"
                                        disabled={assignMutation.isPending}
                                    >
                                        {assignMutation.isPending
                                            ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                                            : <><RoleIcon className="w-4 h-4" />Assign as {roleLabel}</>}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            })()}

            {/* ─── PAYMENT DETAILS MODAL ─── */}
            {showPaymentModal && paymentTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in !mt-0">
                    <div className="glass rounded-2xl p-6 max-w-md w-full border border-white/10">
                        <div className="flex items-start justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center">
                                    <IndianRupee className="w-5 h-5 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">Payment Details</h3>
                                    <p className="text-sm text-muted-foreground">For {paymentTarget.fullName}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowPaymentModal(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        <form onSubmit={handlePaymentSubmit} className="space-y-4">
                            <div>
                                <Label>Bank Name</Label>
                                <Input value={paymentData.bankName} onChange={e => setPaymentData({ ...paymentData, bankName: e.target.value })} placeholder="e.g. HDFC Bank" className="mt-1" />
                            </div>
                            <div>
                                <Label>Bank A/C Holder Name</Label>
                                <Input value={paymentData.bankAccName} onChange={e => setPaymentData({ ...paymentData, bankAccName: e.target.value })} placeholder="Name exactly as in bank" className="mt-1" />
                            </div>
                            <div>
                                <Label>Bank A/C Number</Label>
                                <Input value={paymentData.bankAccNo} onChange={e => setPaymentData({ ...paymentData, bankAccNo: e.target.value })} placeholder="Account Number" className="mt-1" />
                            </div>
                            <div>
                                <Label>IFSC Code</Label>
                                <Input value={paymentData.ifscCode} onChange={e => setPaymentData({ ...paymentData, ifscCode: e.target.value })} placeholder="IFSC" className="mt-1" />
                            </div>
                            <div>
                                <Label>Bank Branch</Label>
                                <Input value={paymentData.bankBranch} onChange={e => setPaymentData({ ...paymentData, bankBranch: e.target.value })} placeholder="e.g. SBI Rajkot Main Branch" className="mt-1" />
                            </div>
                            <div>
                                <Label>UPI ID</Label>
                                <Input value={paymentData.upiId} onChange={e => setPaymentData({ ...paymentData, upiId: e.target.value })} placeholder="username@bank" className="mt-1" />
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-4">
                                <Button type="button" variant="outline" onClick={() => setShowPaymentModal(false)} disabled={paymentMutation.isPending}>Cancel</Button>
                                <Button type="submit" className="gap-2 gradient-primary" disabled={paymentMutation.isPending}>
                                    {paymentMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : 'Save Configuration'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ─── VIEW MEMBER MODAL ─── */}
            {showViewModal && viewTarget && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 !mt-0">
                    <div className="glass bg-background/95 dark:bg-transparent rounded-2xl p-6 max-w-2xl w-full border border-slate-200 dark:border-white/10 animate-fade-in max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Eye className="w-5 h-5 text-emerald-400" />Member Details
                            </h3>
                            <Button variant="ghost" size="icon" onClick={() => setShowViewModal(false)}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Personal Info */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-lg text-foreground/90 border-b border-slate-200 dark:border-white/10 pb-2">Profile Information</h4>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Full Name</p>
                                        <p className="font-medium text-foreground">{viewTarget.fullName}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Email</p>
                                        <p className="font-medium text-foreground">{viewTarget.email}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Role</p>
                                        <div className="mt-1">{getRoleBadge(viewTarget.role, viewTarget.staffRole)}</div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                                        <div className="mt-1">{getStatusBadge(viewTarget.status)}</div>
                                    </div>
                                    {viewTarget.degree && (
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Degree</p>
                                            <p className="font-medium text-foreground">{viewTarget.degree}</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Login</p>
                                        <p className="font-medium text-foreground">{viewTarget.lastLogin ? formatDateTime(viewTarget.lastLogin) : 'Never'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Payment Info */}
                            <div className="space-y-4">
                                <h4 className="font-semibold text-lg text-foreground/90 border-b border-slate-200 dark:border-white/10 pb-2">Bank Details</h4>
                                {isLoadingPayment ? (
                                    <div className="flex items-center justify-center p-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : viewPaymentData ? (
                                    <div className="space-y-3 bg-slate-50 dark:bg-white/5 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Bank Name</p>
                                            <p className="font-medium text-foreground">{viewPaymentData.bankName || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Holder Name</p>
                                            <p className="font-medium text-foreground">{viewPaymentData.bankAccName || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Number</p>
                                            <p className="font-medium text-foreground font-mono">{viewPaymentData.bankAccNo || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">IFSC Code</p>
                                            <p className="font-medium text-foreground font-mono">{viewPaymentData.ifscCode || '—'}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-muted-foreground uppercase tracking-wider">UPI ID</p>
                                            <p className="font-medium text-foreground">{viewPaymentData.upiId || '—'}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/5">
                                        <AlertTriangle className="w-8 h-8 text-muted-foreground mb-2 opacity-50" />
                                        <p className="text-sm text-muted-foreground">No bank details available.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-white/10">
                            <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

