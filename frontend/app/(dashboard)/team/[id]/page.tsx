'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamAPI } from '@/lib/api'
import {
    PhoneCall, BookOpen, Star, Layers, PenTool,
    IndianRupee, ChevronLeft, Calendar, FileText, Upload, CheckCircle2,
    ShieldCheck, Wallet, Edit, Trash2, Plus, RefreshCw, Loader2, X, ZoomIn, Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

function getStaffRoleMeta(staffRole: string | null) {
    if (staffRole === 'GUIDE') return { label: 'Guide', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
    if (staffRole === 'EXPERT') return { label: 'Expert', color: 'text-yellow-400', bg: 'bg-yellow-500/10' }
    if (staffRole === 'TELECALLER') return { label: 'Telecaller', color: 'text-cyan-400', bg: 'bg-cyan-500/10' }
    if (staffRole === 'WRITTER' || staffRole === 'WRITER') return { label: 'Writer', color: 'text-rose-400', bg: 'bg-rose-500/10' }
    if (staffRole === 'BOTH') return { label: 'Guide & Expert', color: 'text-purple-400', bg: 'bg-purple-500/10' }
    return { label: 'Staff', color: 'text-slate-400', bg: 'bg-slate-500/10' }
}

const getBaseUrl = () => {
    // Return relative URL so it goes through next.config JS proxy (/uploads => http://localhost:5000/uploads)
    // This perfectly fixes cross-device image rendering!
    return ''
}

export default function MemberDashboard() {
    const params = useParams()
    const router = useRouter()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const userId = Number(params?.id)
    const currentUser = useAuthStore(state => state.user)
    const isAdmin = currentUser?.role === 'ADMIN'

    // Data fetching
    const { data: user, isLoading } = useQuery({
        queryKey: ['member-dashboard', userId],
        queryFn: async () => {
            const res = await teamAPI.getMemberDashboard(userId)
            return res.data.data
        },
        enabled: !!userId,
    })

    // Sub-components states
    const [isEditingPricing, setIsEditingPricing] = useState(false)
    const [pricingFields, setPricingFields] = useState<{ id: number; label: string; price: string }[]>([])
    const [zoomedImage, setZoomedImage] = useState<string | null>(null)

    // Update pricing state when user loads
    useEffect(() => {
        if (user?.pricing && !isEditingPricing) {
            setPricingFields(user.pricing.map((p: any) => ({
                id: p.id || Math.random(),
                label: p.label,
                price: String(p.price)
            })))
        }
    }, [user, isEditingPricing])

    // Upload Mutations
    const uploadQrMutation = useMutation({
        mutationFn: (file: File) => teamAPI.uploadQrScanner(userId, file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member-dashboard', userId] })
            toast({ title: 'Success', description: 'QR Scanner updated', variant: 'success' })
        },
        onError: () => toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' })
    })

    const uploadPassbookMutation = useMutation({
        mutationFn: (file: File) => teamAPI.uploadBankPassbook(userId, file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member-dashboard', userId] })
            toast({ title: 'Success', description: 'Bank Passbook updated', variant: 'success' })
        },
        onError: () => toast({ title: 'Error', description: 'Failed to upload image', variant: 'destructive' })
    })

    const savePricingMutation = useMutation({
        mutationFn: (pricing: any[]) => teamAPI.updateMemberPricing(userId, pricing),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['member-dashboard', userId] })
            setIsEditingPricing(false)
            toast({ title: 'Success', description: 'Pricing table updated', variant: 'success' })
        },
        onError: () => toast({ title: 'Error', description: 'Failed to update pricing', variant: 'destructive' })
    })

    const markPaymentMutation = useMutation({
        mutationFn: (data: any) => teamAPI.markPaymentDone(userId, data),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['member-dashboard', userId] })
            toast({ title: 'Payment Marked', description: 'Payment record created successfully', variant: 'success' })
            if (res.data?.data?.invoiceUrl) {
                 window.open(getBaseUrl() + res.data.data.invoiceUrl, '_blank')
            }
        },
        onError: () => toast({ title: 'Error', description: 'Failed to mark payment', variant: 'destructive' })
    })

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'qr' | 'passbook') => {
        if (e.target.files && e.target.files[0]) {
            if (type === 'qr') uploadQrMutation.mutate(e.target.files[0])
            else uploadPassbookMutation.mutate(e.target.files[0])
        }
    }

    const handleSavePricing = () => {
        const validPricing = pricingFields
            .filter(f => f.label.trim() && f.price.trim())
            .map(f => ({ label: f.label.trim(), price: parseFloat(f.price) || 0 }))
        savePricingMutation.mutate(validPricing)
    }

    // Calculate payable amounts
    let totalMatchedAmount = 0
    const payableItems: any[] = []
    
    // Track already paid student IDs
    const paidStudentIds = new Set(user?.paymentRecords?.flatMap((p: any) => p.studentIds) || [])
    
    const completedOrders: any[] = []
    const pendingOrders: any[] = []

    if (user?.assignedStudents && user?.pricing) {
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
                // Add to payable if not paid
                if (amountStr !== 'Paid' && amountStr !== '—') {
                    totalMatchedAmount += amountNum
                    payableItems.push({
                        studentId: o.id,
                        studentName: o.fullName,
                        requirement: requirement,
                        amount: amountNum
                    })
                }
            } else {
                pendingOrders.push(enrichedOrder)
            }
        })
    }
    
    const handleMarkPayment = () => {
        if (payableItems.length === 0) {
            toast({ title: 'Nothing to pay', description: 'No matched orders found for this member.', variant: 'destructive' })
            return
        }
        const note = prompt('Add an optional note for this payment:')
        if (note === null) return // user cancelled
        
        const studentIds = payableItems.map(p => p.studentId)
        markPaymentMutation.mutate({
            amount: totalMatchedAmount,
            note: note || '',
            studentIds,
            breakdown: payableItems
        })
    }

    if (isLoading) {
        return <div className="p-8 space-y-6 animate-pulse">
            <Skeleton className="h-10 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Skeleton className="h-64" />
                <Skeleton className="col-span-2 h-64" />
            </div>
        </div>
    }

    if (!user) {
        return <div className="p-8 text-center text-muted-foreground">User not found</div>
    }

    const roleMeta = getStaffRoleMeta(user.staffRole)

    return (
        <div className="space-y-6 pb-12 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
                    <ChevronLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {user.fullName}
                    </h1>
                    <p className="text-muted-foreground text-sm flex items-center gap-2">
                        {user.email} <span className="opacity-50">•</span> Member Dashboard
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Left Column: Info & Uploads */}
                <div className="space-y-6">
                    {/* Profile Card */}
                    <div className="glass rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                        <div className="relative z-10">
                            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${roleMeta.bg} ${roleMeta.color} mb-4`}>
                                {roleMeta.label}
                            </div>
                            {user.degree && (
                                <div className="text-sm font-medium mb-1">
                                    <span className="text-muted-foreground">Expertise:</span> {user.degree}
                                </div>
                            )}
                            <div className="text-sm">
                                <span className="text-muted-foreground">Joined:</span> {formatDateTime(user.createdAt).split(',')[0]}
                            </div>
                        </div>
                    </div>

                    {/* Bank Details */}
                    <div className="glass rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <IndianRupee className="w-4 h-4 text-emerald-400" />
                                Bank Details
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => router.push('/settings')} className="text-xs h-8">
                                Edit
                            </Button>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="flex flex-col">
                                <span className="text-muted-foreground text-xs uppercase tracking-wider">A/C Name</span>
                                <span className="font-medium">{user.bankAccName || '—'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground text-xs uppercase tracking-wider">Account No</span>
                                <span className="font-medium tracking-wide">{user.bankAccNo || '—'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground text-xs uppercase tracking-wider">IFSC / Bank Name</span>
                                <span>{user.ifscCode || '—'} <span className="text-muted-foreground mx-1">•</span> {user.bankName || '—'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground text-xs uppercase tracking-wider">Branch</span>
                                <span>{user.bankBranch || '—'}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground text-xs uppercase tracking-wider">UPI ID</span>
                                <span>{user.upiId || '—'}</span>
                            </div>
                        </div>
                    </div>

                    {/* QR Scanner Upload */}
                    <div className="glass rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Wallet className="w-4 h-4 text-blue-400" />
                                Payment QR Scanner
                            </h3>
                            <label className="cursor-pointer shrink-0">
                                <div className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-blue-500/20 shadow-sm">
                                    {uploadQrMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    Upload QR
                                </div>
                                <input type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e, 'qr')} disabled={uploadQrMutation.isPending} />
                            </label>
                        </div>
                        <div 
                            className={`flex items-center justify-center p-4 border-2 border-dashed border-white/10 rounded-xl bg-black/20 relative overflow-hidden h-48 transition-all ${user.qrScannerUrl ? 'cursor-pointer group hover:border-blue-500/30' : ''}`}
                            onClick={() => user.qrScannerUrl && setZoomedImage(`${getBaseUrl()}${user.qrScannerUrl}`)}
                        >
                            {user.qrScannerUrl ? (
                                <>
                                    <img src={`${getBaseUrl()}${user.qrScannerUrl}`} alt="QR Scanner" className="w-full h-full object-contain rounded transition-transform duration-500 group-hover:scale-[1.02]" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="bg-black/60 text-white rounded-full p-3 backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all duration-300">
                                            <ZoomIn className="w-5 h-5" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6 text-muted-foreground flex flex-col items-center">
                                    <ShieldCheck className="w-8 h-8 mb-2 opacity-30" />
                                    <p className="text-sm">No QR Code uploaded</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Passbook Upload */}
                    <div className="glass rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold flex items-center gap-2">
                                <FileText className="w-4 h-4 text-amber-400" />
                                Bank Passbook
                            </h3>
                            <label className="cursor-pointer shrink-0">
                                <div className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-amber-500/20 shadow-sm">
                                    {uploadPassbookMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                    Upload
                                </div>
                                <input type="file" accept="image/*" className="hidden" onChange={e => handleFileChange(e, 'passbook')} disabled={uploadPassbookMutation.isPending} />
                            </label>
                        </div>
                        <div 
                            className={`flex items-center justify-center p-4 border-2 border-dashed border-white/10 rounded-xl bg-black/20 relative overflow-hidden h-48 transition-all ${user.bankPassbookUrl ? 'cursor-pointer group hover:border-amber-500/30' : ''}`}
                            onClick={() => user.bankPassbookUrl && setZoomedImage(`${getBaseUrl()}${user.bankPassbookUrl}`)}
                        >
                            {user.bankPassbookUrl ? (
                                <>
                                    <img src={`${getBaseUrl()}${user.bankPassbookUrl}`} alt="Passbook" className="w-full h-full object-cover rounded transition-transform duration-500 group-hover:scale-[1.02]" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="bg-black/60 text-white rounded-full p-3 backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-all duration-300">
                                            <ZoomIn className="w-5 h-5" />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center py-6 text-muted-foreground flex flex-col items-center">
                                    <FileText className="w-8 h-8 mb-2 opacity-30" />
                                    <p className="text-sm">No Passbook uploaded</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Pricing & Work Record */}
                <div className="md:col-span-2 space-y-6">
                    {/* Fixed Pricing Table */}
                    <div className="glass rounded-2xl p-6 border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold flex items-center gap-2 text-lg">
                                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                                Fixed Pricing Structure
                            </h3>
                            {!isEditingPricing ? (
                                <Button variant="outline" size="sm" onClick={() => setIsEditingPricing(true)} className="gap-2">
                                    <Edit className="w-4 h-4" /> Edit Pricing
                                </Button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setIsEditingPricing(false)}>Cancel</Button>
                                    <Button size="sm" onClick={handleSavePricing} disabled={savePricingMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white gap-2">
                                        {savePricingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!isEditingPricing ? (
                            <div className="overflow-hidden rounded-xl border border-white/10">
                                <table className="w-full">
                                    <thead className="bg-white/5 border-b border-white/10">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requirement Type</th>
                                            <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fixed Price</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {user.pricing?.length > 0 ? (
                                            user.pricing.map((p: any) => (
                                                <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-4 py-3 text-sm font-medium">{p.label}</td>
                                                    <td className="px-4 py-3 text-sm text-right text-emerald-400 font-semibold tracking-wide">Rs {Number(p.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground text-sm">
                                                    No pricing structure defined yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {pricingFields.map((field, index) => (
                                    <div key={field.id} className="flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                                        <div className="flex-1 w-full">
                                            <Label className="text-xs text-muted-foreground mb-1 block">Type (e.g. SYNOPSIS)</Label>
                                            <Input 
                                                value={field.label} 
                                                onChange={e => {
                                                    const newFields = [...pricingFields]
                                                    newFields[index].label = e.target.value
                                                    setPricingFields(newFields)
                                                }} 
                                                placeholder="Requirement label" 
                                            />
                                        </div>
                                        <div className="w-full sm:w-32">
                                            <Label className="text-xs text-muted-foreground mb-1 block">Price (Rs)</Label>
                                            <Input 
                                                type="number"
                                                value={field.price}
                                                onChange={e => {
                                                    const newFields = [...pricingFields]
                                                    newFields[index].price = e.target.value
                                                    setPricingFields(newFields)
                                                }} 
                                                placeholder="0.00" 
                                            />
                                        </div>
                                        <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-10 w-10 shrink-0"
                                            onClick={() => setPricingFields(pricingFields.filter((_, i) => i !== index))}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm"
                                    className="w-full border-dashed gap-2"
                                    onClick={() => setPricingFields([...pricingFields, { id: Math.random(), label: '', price: '' }])}
                                >
                                    <Plus className="w-4 h-4" /> Add Pricing Row
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Work Record / Assigned Orders */}
                    <div className="glass rounded-2xl border border-white/5 flex flex-col min-h-[400px]">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2 text-lg">
                                <Calendar className="w-5 h-5 text-blue-400" />
                                Work Record & Payments
                            </h3>
                            {isAdmin && totalMatchedAmount > 0 && (
                                <Button size="sm" onClick={handleMarkPayment} disabled={markPaymentMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-8 text-xs font-semibold">
                                    {markPaymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                    Mark Payment Done
                                </Button>
                            )}
                        </div>
                        <div className="p-0 overflow-x-auto">
                            {/* Completed Orders Table (Payable) */}
                            <div className="bg-emerald-500/5 px-6 py-3 border-b border-emerald-500/10 shadow-inner">
                                <h4 className="text-emerald-400 font-semibold text-sm flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" /> Completed Work (Payable)
                                </h4>
                            </div>
                            <table className="w-full">
                                <thead className="bg-white/5 border-b border-white/10">
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
                                                No completed orders yet
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {completedOrders.length > 0 && (
                                    <tfoot className="bg-emerald-500/5 border-t border-emerald-500/20 font-medium">
                                        <tr>
                                            <td colSpan={3} className="px-6 py-4 text-right align-middle text-emerald-400/80 uppercase text-xs tracking-wider font-semibold">
                                                Total Pending Amount:
                                            </td>
                                            <td className="px-6 py-4 text-emerald-400 text-right align-middle font-bold text-lg">
                                                Rs {Number(totalMatchedAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>

                            {/* Pending Orders Table (WIP) */}
                            <div className="bg-blue-500/5 px-6 py-3 border-t border-b border-blue-500/10 shadow-inner mt-4">
                                <h4 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> Pending Work (In Progress)
                                </h4>
                            </div>
                            <table className="w-full">
                                <thead className="bg-white/5 border-b border-white/10">
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
                                                No pending orders
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
                                Payment History
                            </h3>
                        </div>
                        <div className="p-0 overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-white/5 border-b border-white/10">
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
                                                No payments recorded yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Image Zoom Modal */}
            {zoomedImage && (
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-md p-4 sm:p-8 animate-in fade-in duration-200 !mt-0"
                    onClick={() => setZoomedImage(null)}
                >
                    <button 
                        onClick={() => setZoomedImage(null)} 
                        className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 p-2.5 rounded-full transition-all border border-white/10 z-10"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <div className="relative max-w-5xl w-full max-h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                        <img 
                            src={zoomedImage} 
                            alt="Zoomed" 
                            className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl border border-white/10" 
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
