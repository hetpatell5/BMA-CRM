'use client'

import { useQuery } from '@tanstack/react-query'
import {
    User, Mail, Shield, BookOpen, GraduationCap, Calendar, Clock, BadgeCheck, Wallet, FileText, Layers, Banknote, CheckCircle2
} from 'lucide-react'
import api, { teamAPI } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { getInitials, formatDateTime } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/button'

function getBaseUrl() {
    if (typeof window !== 'undefined') {
        try {
            const parsed = new URL(process.env.NEXT_PUBLIC_API_URL!)
            return parsed.origin
        } catch (e) {
            return process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || ''
        }
    }
    return ''
}

function InfoItem({ icon: Icon, label, value, highlight = false }: { icon: any, label: string, value: string, highlight?: boolean }) {
    return (
        <div className="flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${highlight ? 'bg-primary/20 text-primary' : 'bg-white/10 text-muted-foreground'}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground mb-0.5">{label}</p>
                <p className={`font-semibold truncate ${highlight ? 'text-primary text-lg' : 'text-foreground'}`}>
                    {value || '-'}
                </p>
            </div>
        </div>
    )
}

function getRoleLabel(roleId: string) {
    if (!roleId) return 'Not Assigned'
    if (roleId === 'GUIDE') return 'Guide'
    if (roleId === 'EXPERT') return 'Expert'
    if (roleId === 'BOTH') return 'Guide & Expert'
    return roleId
}

import { useState, useRef } from 'react'
import { authAPI } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Camera, Edit2, Phone } from 'lucide-react'

const DEFAULT_AVATARS = [
    'https://api.dicebear.com/7.x/shapes/svg?seed=Felix&backgroundColor=00897b',
    'https://api.dicebear.com/7.x/shapes/svg?seed=Oliver&backgroundColor=00acc1',
    'https://api.dicebear.com/7.x/shapes/svg?seed=Mimi&backgroundColor=039be5',
    'https://api.dicebear.com/7.x/shapes/svg?seed=Jack&backgroundColor=1e88e5',
    'https://api.dicebear.com/7.x/shapes/svg?seed=Chloe&backgroundColor=3949ab',
    'https://api.dicebear.com/7.x/shapes/svg?seed=Leo&backgroundColor=43a047',
]

function ProfileHeader({ user, refetch }: { user: any, refetch: () => void }) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false)
    const updateUser = useAuthStore(state => state.updateUser)
    const authUser = useAuthStore(state => state.user)

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        const reader = new FileReader()
        reader.onloadend = async () => {
            try {
                const base64String = reader.result as string
                const res = await authAPI.updateAvatar(base64String)
                if (authUser) {
                    updateUser({ ...authUser, avatar: res.data.data.avatar })
                }
                refetch()
                setIsAvatarModalOpen(false)
            } catch (error) {
                console.error('Failed to upload image', error)
            } finally {
                setIsUploading(false)
            }
        }
        reader.readAsDataURL(file)
    }

    const handleSelectDefault = async (url: string) => {
        setIsUploading(true)
        try {
            const res = await authAPI.updateAvatar(url)
            if (authUser) {
                updateUser({ ...authUser, avatar: res.data.data.avatar })
            }
            refetch()
            setIsAvatarModalOpen(false)
        } catch (error) {
            console.error('Failed to set default avatar', error)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <div className="glass bg-white dark:bg-[#1C1C1E] border border-black/5 dark:border-white/5 rounded-2xl p-8 mb-8 flex flex-col md:flex-row items-start md:items-center gap-8 shadow-sm">
            {/* Avatar Section */}
            <div className="relative group shrink-0">
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white dark:border-[#2A2A2D] bg-white dark:bg-[#2A2A2D] flex items-center justify-center relative shadow-sm">
                    {(authUser?.avatar || user.avatar) ? (
                        <img src={authUser?.avatar || user.avatar} alt={user.fullName} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full gradient-primary flex items-center justify-center text-4xl font-bold text-white">
                            {getInitials(user.fullName)}
                        </div>
                    )}

                    {/* Camera Overlay */}
                    <Dialog open={isAvatarModalOpen} onOpenChange={setIsAvatarModalOpen}>
                        <DialogTrigger asChild>
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-sm">
                                <Camera className="w-8 h-8 text-white/90" />
                            </div>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md bg-white dark:bg-[#1C1C1E] border-border text-foreground">
                            <DialogHeader>
                                <DialogTitle>Update Profile Picture</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                                <div>
                                    <h4 className="text-sm font-medium text-muted-foreground mb-3">Upload from computer</h4>
                                    <Button 
                                        variant="outline" 
                                        className="w-full h-12"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isUploading}
                                    >
                                        <Camera className="w-4 h-4 mr-2" />
                                        {isUploading ? 'Uploading...' : 'Select Image'}
                                    </Button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        onChange={handleFileSelect} 
                                        accept="image/*" 
                                        className="hidden" 
                                    />
                                </div>
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-white dark:bg-[#1C1C1E] px-2 text-muted-foreground">Or choose default</span></div>
                                </div>
                                <div>
                                    <div className="grid grid-cols-3 gap-4">
                                        {DEFAULT_AVATARS.map((url, i) => (
                                            <button
                                                key={i}
                                                onClick={() => handleSelectDefault(url)}
                                                disabled={isUploading}
                                                className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-blue-500 transition-colors focus:outline-none shadow-sm"
                                            >
                                                <img src={url} alt={`Default ${i+1}`} className="w-full h-full object-cover" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* User Info Section */}
            <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                        {user.fullName}
                    </h1>
                    <span className="px-3 py-1 rounded-full border border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-semibold uppercase tracking-wider">
                        {user.role === 'ADMIN' ? 'Administrator' : user.role === 'MANAGER' ? 'Leader' : user.staffRole || 'Staff'}
                    </span>
                </div>
                
                <div className="text-muted-foreground font-medium mb-4 capitalize">
                    {user.degree ? user.degree : (user.staffRole ? user.staffRole.toLowerCase() : 'System Account')}
                </div>

                <div className="flex items-center gap-6 text-sm text-foreground/70">
                    <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                        {user.email}
                    </div>
                    <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                        {user.phone || 'Not Provided'}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function ProfilePage() {
    const authStoreUser = useAuthStore(state => state.user)

    const { data: user, isLoading, refetch } = useQuery({
        queryKey: ['my-profile', authStoreUser?.id],
        queryFn: async () => {
            if (!authStoreUser?.id) return null
            // Use teamAPI if user is STAFF so we get all relations, else fallback to standard
            if (authStoreUser.role === 'STAFF') {
                const res = await teamAPI.getMemberDashboard(authStoreUser.id)
                return res.data.data
            } else {
                const res = await api.get('/auth/me')
                return res.data.data
            }
        },
        enabled: !!authStoreUser?.id
    })

    if (isLoading) {
        return (
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
                 <Skeleton className="h-[250px] w-full rounded-2xl" />
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                     <Skeleton className="h-24 w-full rounded-xl" />
                     <Skeleton className="h-24 w-full rounded-xl" />
                     <Skeleton className="h-24 w-full rounded-xl" />
                 </div>
            </div>
        )
    }

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <User className="w-12 h-12 mb-4 opacity-50" />
                <p>Failed to load profile information.</p>
            </div>
        )
    }

    const isStaff = user.role === 'STAFF'
    const joinDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' }) : 'Unknown'

    // Calculate payable amounts
    let totalMatchedAmount = 0
    let totalPaidOut = 0
    const paidStudentIds = new Set(user.paymentRecords?.flatMap((p: any) => p.studentIds) || [])

    const completedOrders: any[] = []
    const pendingOrders: any[] = []

    if (isStaff) {
        if (user.assignedStudents && user.pricing) {
            user.assignedStudents.forEach((o: any) => {
                const isCompleted = o.status === 'ALL_DONE' || o.status === 'SHIPPED'

                let requirement = ''
                if (o.customFields && typeof o.customFields === 'object') {
                    const cw = Object.keys(o.customFields).find(k => k.toLowerCase().includes('requirement'))
                    if (cw) {
                        const val = o.customFields[cw]
                        requirement = Array.isArray(val) ? val.join(' ') : String(val || '')
                    }
                }

                let amountStr = '—'
                let amountNum = 0
                
                if (requirement) {
                    const reqLower = requirement.toLowerCase()
                    const match = user.pricing.find((p:any) => reqLower.includes(p.label.toLowerCase()) || p.label.toLowerCase().includes(reqLower))
                    if (match) {
                        amountNum = Number(match.price)
                        if (paidStudentIds.has(o.id)) {
                            amountStr = 'Paid'
                        } else {
                            amountStr = `Rs ${amountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                        }
                    }
                }

                const enrichedOrder = { ...o, requirement, amount: amountStr }

                if (isCompleted) {
                    completedOrders.push(enrichedOrder)
                    if (amountStr !== 'Paid' && amountStr !== '—') {
                        totalMatchedAmount += amountNum
                    }
                } else {
                    pendingOrders.push(enrichedOrder)
                }
            })
        }
        if (user.paymentRecords) {
            user.paymentRecords.forEach((p: any) => {
                totalPaidOut += Number(p.amount)
            })
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-10">
            {/* Banner & Header */}
            <ProfileHeader user={user} refetch={refetch} />

            {/* Sub-Header stats for STAFF */}
            {isStaff && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass rounded-xl p-5 border border-white/5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center shrink-0">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Pending Payment Amount</p>
                            <p className="text-2xl font-bold tracking-tight text-foreground">Rs {totalMatchedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                    <div className="glass rounded-xl p-5 border border-white/5 bg-white/5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                            <Banknote className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">Total Paid Out</p>
                            <p className="text-2xl font-bold tracking-tight text-foreground">Rs {totalPaidOut.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Content Details */}
            <div>
                 <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                     <User className="w-5 h-5 text-primary" /> Profile Information
                 </h2>
                 <Card className="glass border-white/5 overflow-hidden">
                     <CardContent className="p-0">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-[1px] bg-white/5">
                            {/* We use bg-background and gap gap-[1px] on parent to create native 1px borders */}
                            <div className="bg-background p-2">
                                <InfoItem icon={Mail} label="Email Address" value={user.email} />
                            </div>
                            <div className="bg-background p-2">
                                <InfoItem icon={Calendar} label="Joined Date" value={joinDate} />
                            </div>
                            
                            {/* Role specialized info */}
                            {isStaff ? (
                                <>
                                    <div className="bg-background p-2">
                                        <InfoItem icon={BookOpen} label="Assigned Team Role" value={getRoleLabel(user.staffRole)} highlight />
                                    </div>
                                    <div className="bg-background p-2">
                                        <InfoItem icon={GraduationCap} label="Educational Degree" value={user.degree || 'Not Provided'} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bg-background p-2 md:col-span-2">
                                        <InfoItem icon={Shield} label="Administrative Privileges" value="Full System Access" highlight />
                                    </div>
                                </>
                            )}
                         </div>
                     </CardContent>
                 </Card>
            </div>

            {/* My Work Record & Payments for STAFF */}
            {isStaff && (
                <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
                    {/* Work Record Tab */}
                    <div className="glass rounded-2xl border border-white/5 flex flex-col min-h-[300px]">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2 text-lg">
                                <Calendar className="w-5 h-5 text-blue-400" />
                                My Work Record
                            </h3>
                        </div>
                        <div className="p-0 overflow-x-auto max-h-[400px]">
                            {/* Completed Orders Table (Payable) */}
                            <div className="bg-emerald-500/5 px-6 py-3 border-b border-emerald-500/10 shadow-inner">
                                <h4 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" /> Completed Work (Payable)
                                </h4>
                            </div>
                            <table className="w-full">
                                <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-xl">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student / Order</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {completedOrders.length > 0 ? (
                                        completedOrders.map((o: any) => (
                                            <tr key={o.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                                                    {formatDateTime(o.createdAt).split(',')[0]}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-foreground">{o.fullName}</div>
                                                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{o.requirement || '—'}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap border ${o.status === 'ALL_DONE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 border-white/10 text-muted-foreground'}`}>
                                                        {o.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-right font-semibold whitespace-nowrap">
                                                    {o.amount === 'Paid' ? (
                                                        <span className="text-emerald-500/70 bg-emerald-500/10 px-2 py-1 rounded text-xs border border-emerald-500/20">PAID</span>
                                                    ) : (
                                                        <span className="text-emerald-400">{o.amount}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                                No completed orders yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            {/* Pending Orders Table (WIP) */}
                            <div className="bg-blue-500/5 px-6 py-3 border-t border-b border-blue-500/10 shadow-inner mt-4">
                                <h4 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Pending Work (In Progress)
                                </h4>
                            </div>
                            <table className="w-full">
                                <thead className="bg-white/5 border-b border-white/10 sticky top-[42px] z-10 backdrop-blur-xl">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Student / Order</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Est. Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {pendingOrders.length > 0 ? (
                                        pendingOrders.map((o: any) => (
                                            <tr key={o.id} className="hover:bg-white/5 transition-colors opacity-70 hover:opacity-100">
                                                <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                                                    {formatDateTime(o.createdAt).split(',')[0]}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm font-medium text-foreground">{o.fullName}</div>
                                                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">{o.requirement || '—'}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap border bg-blue-500/10 text-blue-400 border-blue-500/20">
                                                        {o.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-right text-muted-foreground whitespace-nowrap">
                                                    {o.amount === 'Paid' ? (
                                                        <span className="text-emerald-500/70">PAID</span>
                                                    ) : o.amount !== '—' ? (
                                                        <span className="opacity-70">{o.amount}</span>
                                                    ) : (
                                                        <span>—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground text-sm">
                                                No pending orders.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Payment History Tab */}
                    <div className="glass rounded-2xl border border-white/5 flex flex-col min-h-[300px]">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2 text-lg">
                                <Wallet className="w-5 h-5 text-emerald-400" />
                                Payment History & Invoices
                            </h3>
                        </div>
                        <div className="p-0 overflow-x-auto max-h-[400px]">
                            <table className="w-full">
                                <thead className="bg-white/5 border-b border-white/10 sticky top-0 z-10 backdrop-blur-xl">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date Paid</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                                        <th className="px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {user.paymentRecords?.length > 0 ? (
                                        user.paymentRecords.map((p: any) => (
                                            <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4 text-sm font-medium text-foreground whitespace-nowrap">
                                                    {formatDateTime(p.paidAt).split(',')[0]}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-muted-foreground truncate max-w-[200px]">
                                                    {p.note || '—'}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-right font-bold text-emerald-400 whitespace-nowrap">
                                                    Rs {Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {p.invoiceUrl && (
                                                        <Button size="sm" variant="outline" className="h-8 gap-2 bg-white/5 border-white/10 hover:bg-white/10" onClick={() => window.open(getBaseUrl() + p.invoiceUrl, '_blank')}>
                                                            <FileText className="w-3.5 h-3.5" /> View
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                                                No payments received yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Simple Account security tip */}
            <div className="glass rounded-xl p-5 border border-white/5 flex items-start gap-4">
                <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                    <Clock className="w-5 h-5" />
                </div>
                <div>
                     <p className="font-semibold text-sm">Account Secure</p>
                     <p className="text-xs text-muted-foreground mt-1">
                         Your account settings and password can be customized via the <a href="/settings" className="text-blue-400 font-medium hover:underline">Settings Panel</a>. Keep your credentials safe.
                     </p>
                </div>
            </div>
        </div>
    )
}

