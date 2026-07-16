'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Manrope } from 'next/font/google'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { teamAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import { cn, getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    ArrowUpRight,
    ArrowDownRight,
    BookOpen,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    ExternalLink,
    Eye,
    FileText,
    IndianRupee,
    Layers,
    LayoutGrid,
    List,
    Loader2,
    Mail,
    MoreHorizontal,
    MoreVertical,
    PenTool,
    PhoneCall,
    QrCode,
    Search,
    ShieldAlert,
    Star,
    Users,
    Wallet,
    X,
    type LucideIcon,
} from 'lucide-react'

type StaffRoleFilter = 'ALL' | 'GUIDE' | 'EXPERT' | 'BOTH' | 'TELECALLER' | 'WRITTER'
type NormalizedRole = 'GUIDE' | 'EXPERT' | 'BOTH' | 'TELECALLER' | 'WRITTER' | 'STAFF' | 'OTHER'
type PricingRow = { id: number; label: string; price: number }
type PaymentRecord = { id: number; amount: number; paidAt: string; note?: string | null; invoiceUrl?: string | null; studentIds?: unknown }
type AssignedStudent = { id: string | number; fullName: string; status: string; createdAt: string; customFields?: Record<string, unknown> | null }
type Member = {
    id: number
    email?: string | null
    fullName: string
    role: string
    status: string
    avatar?: string | null
    staffRole?: string | null
    bankName?: string | null
    bankAccNo?: string | null
    upiId?: string | null
    qrScannerUrl?: string | null
    bankPassbookUrl?: string | null
    pricing: PricingRow[]
    paymentRecords: PaymentRecord[]
    assignedStudents: AssignedStudent[]
}
type PayableItem = { studentId: string; studentName: string; requirement: string; amount: number }
type WorkItem = { label: string; count: number }
type Summary = {
    member: Member
    role: NormalizedRole
    completedOrders: number
    pendingOrders: number
    payableAmount: number
    totalPaid: number
    payableItems: PayableItem[]
    workBreakdown: WorkItem[]
    lastInvoiceUrl: string | null
    lastActiveAt: string | null
}
type LightboxState = { title: string; imageUrl: string }
type BulkMailState = { emails: string[]; invoices: Array<{ memberName: string; invoiceUrl: string }> }

const ALL_MEMBERS = 'ALL_MEMBERS'
const COMPLETED_STATUSES = new Set(['ALL_DONE', 'SHIPPED'])
const currencyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
const ROLE_FILTERS: Array<{ value: StaffRoleFilter; label: string }> = [
    { value: 'ALL', label: 'All Roles' },
    { value: 'GUIDE', label: 'Guide' },
    { value: 'EXPERT', label: 'Expert' },
    { value: 'BOTH', label: 'Guide & Expert' },
    { value: 'TELECALLER', label: 'Telecaller' },
    { value: 'WRITTER', label: 'Writer' },
]
const ROLE_ORDER: NormalizedRole[] = ['GUIDE', 'EXPERT', 'BOTH', 'TELECALLER', 'WRITTER', 'STAFF', 'OTHER']
const manrope = Manrope({ subsets: ['latin'], weight: ['500', '600', '700', '800'] })

function formatCurrency(value: number) {
    return `Rs ${currencyFormatter.format(Number(value) || 0)}`
}

function formatAmountNumber(value: number) {
    return currencyFormatter.format(Number(value) || 0)
}

function assetUrl(path?: string | null) {
    if (!path) return ''
    if (/^https?:\/\//i.test(path)) return path
    if (typeof window === 'undefined') return path
    return new URL(path, window.location.origin).toString()
}

function normalizeRole(staffRole?: string | null, role?: string): NormalizedRole {
    if (staffRole === 'WRITER') return 'WRITTER'
    if (staffRole === 'GUIDE' || staffRole === 'EXPERT' || staffRole === 'BOTH' || staffRole === 'TELECALLER' || staffRole === 'WRITTER') return staffRole
    if (role === 'STAFF') return 'STAFF'
    return 'OTHER'
}

function roleMeta(role: NormalizedRole) {
    const fallback = {
        label: role === 'STAFF' ? 'STAFF' : 'OTHER',
        icon: Users,
        badge: 'border-slate-500/25 bg-slate-500/10 text-slate-300',
        pill: 'border-slate-500/25 bg-slate-500/15 text-slate-200',
        glow: 'bg-slate-500/15',
        bar: 'from-slate-400 to-slate-200',
    }
    if (role === 'GUIDE') return { label: 'Guide', icon: BookOpen, badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400', pill: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300', glow: 'bg-emerald-500/20', bar: 'from-emerald-500 to-emerald-300' }
    if (role === 'EXPERT') return { label: 'Expert', icon: Star, badge: 'border-amber-500/25 bg-amber-500/10 text-amber-400', pill: 'border-amber-500/25 bg-amber-500/15 text-amber-300', glow: 'bg-amber-500/20', bar: 'from-amber-500 to-amber-300' }
    if (role === 'BOTH') return { label: 'Guide & Expert', icon: Layers, badge: 'border-violet-500/25 bg-violet-500/10 text-violet-400', pill: 'border-violet-500/25 bg-violet-500/15 text-violet-300', glow: 'bg-violet-500/20', bar: 'from-violet-500 to-fuchsia-400' }
    if (role === 'TELECALLER') return { label: 'Telecaller', icon: PhoneCall, badge: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-400', pill: 'border-cyan-500/25 bg-cyan-500/15 text-cyan-300', glow: 'bg-cyan-500/20', bar: 'from-cyan-500 to-cyan-300' }
    if (role === 'WRITTER') return { label: 'Writer', icon: PenTool, badge: 'border-rose-500/25 bg-rose-500/10 text-rose-400', pill: 'border-rose-500/25 bg-rose-500/15 text-rose-300', glow: 'bg-rose-500/20', bar: 'from-rose-500 to-rose-300' }
    return fallback
}

function extractRequirement(customFields?: Record<string, unknown> | null) {
    if (!customFields || typeof customFields !== 'object') return ''
    const key = Object.keys(customFields).find((entry) => entry.toLowerCase().includes('requirement'))
    if (!key) return ''
    const value = customFields[key]
    return Array.isArray(value) ? value.join(' ').trim() : String(value || '').trim()
}

function findPricingMatch(pricing: PricingRow[], requirement: string) {
    if (!requirement) return null
    const requirementLower = requirement.toLowerCase()
    return pricing.find((entry) => {
        const labelLower = entry.label.toLowerCase()
        return requirementLower.includes(labelLower) || labelLower.includes(requirementLower)
    }) || null
}

function buildSummary(member: Member): Summary {
    const paidIds = new Set(member.paymentRecords.flatMap((record) => Array.isArray(record.studentIds) ? record.studentIds.map((id) => String(id)) : []))
    const workMap = new Map<string, number>()
    const payableItems: PayableItem[] = []
    let completedOrders = 0
    let pendingOrders = 0
    let payableAmount = 0
    let lastActiveAt: string | null = null
    member.paymentRecords.forEach(record => {
        if (record.paidAt && (!lastActiveAt || new Date(record.paidAt) > new Date(lastActiveAt))) lastActiveAt = record.paidAt
    })
    member.assignedStudents.forEach((student) => {
        if (student.createdAt && (!lastActiveAt || new Date(student.createdAt) > new Date(lastActiveAt))) lastActiveAt = student.createdAt
        const completed = COMPLETED_STATUSES.has(student.status)
        const requirement = extractRequirement(student.customFields)
        const pricing = findPricingMatch(member.pricing, requirement)
        if (completed) {
            completedOrders += 1
            if (pricing) {
                workMap.set(pricing.label, (workMap.get(pricing.label) || 0) + 1)
                const studentId = String(student.id)
                if (!paidIds.has(studentId)) {
                    const amount = Number(pricing.price) || 0
                    payableAmount += amount
                    payableItems.push({ studentId, studentName: student.fullName, requirement: requirement || pricing.label, amount })
                }
            }
        } else {
            pendingOrders += 1
        }
    })
    return {
        member,
        role: normalizeRole(member.staffRole, member.role),
        completedOrders,
        pendingOrders,
        payableAmount,
        totalPaid: member.paymentRecords.reduce((sum, record) => sum + (Number(record.amount) || 0), 0),
        payableItems,
        workBreakdown: Array.from(workMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({ label, count })),
        lastInvoiceUrl: member.paymentRecords.find((record) => record.invoiceUrl)?.invoiceUrl || null,
        lastActiveAt,
    }
}

function openMail(options: { to?: string; bcc?: string[]; subject: string; body: string }) {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams()
    if (options.bcc?.length) params.set('bcc', options.bcc.join(','))
    params.set('subject', options.subject)
    params.set('body', options.body)
    window.location.href = `mailto:${options.to || ''}?${params.toString()}`
}

function downloadInvoice(url?: string | null) {
    if (!url || typeof document === 'undefined') return
    const link = document.createElement('a')
    const href = assetUrl(url)
    link.href = href
    link.download = href.split('/').pop() || 'invoice'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

function invoiceBody(memberName: string, invoiceUrl: string) {
    return [
        `<div style="font-family: sans-serif; color: #333; line-height: 1.6;">`,
        `<p>Hello <strong>${memberName}</strong>,</p>`,
        `<p>We are pleased to inform you that your payment has been processed. Please find your latest payment invoice attached to this email.</p>`,
        `<p>You can also view it online here: <a href="${assetUrl(invoiceUrl)}" style="color: #2563eb; text-decoration: none;">View Invoice</a></p>`,
        `<div style="margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">`,
        `<p>Regards,<br><strong>Admin Team</strong></p>`,
        `</div>`,
        `</div>`
    ].join('')
}

function bulkInvoiceBody(invoices: BulkMailState['invoices']) {
    return [
        `<div style="font-family: sans-serif; color: #333; line-height: 1.6;">`,
        `<p>Hello Team,</p>`,
        `<p>Please find the latest payment invoices below:</p>`,
        `<ul style="list-style: none; padding: 0;">`,
        ...invoices.map((invoice, index) => 
            `<li style="margin-bottom: 12px; padding: 12px; border: 1px solid #eee; rounded: 8px;">
                <strong>${index + 1}. ${invoice.memberName}</strong><br/>
                <a href="${assetUrl(invoice.invoiceUrl)}" style="color: #2563eb; text-decoration: none;">Download Invoice</a>
            </li>`
        ),
        `</ul>`,
        `<p>Regards,<br><strong>Admin Team</strong></p>`,
        `</div>`
    ].join('')
}

function AmountStatValue({ amount, tone }: { amount: number; tone: string }) {
    return (
        <span className={cn('text-3xl font-bold tracking-tight text-slate-900 dark:text-white', tone)}>
            {/* The user preferred $ format in the image, but Rs is being used. We use $ format to match the exact image if desired by string, or Rs. Let's use currencyFormatter with $ or Rs. Let's just output $ to respect exact image, but format natively. */}
            Rs {formatAmountNumber(amount)}
        </span>
    )
}

function StatCard({ label, value, change, changeType, description }: { label: string; value: ReactNode; change?: string; changeType?: 'positive' | 'negative' | 'neutral'; description?: string }) {
    return (
        <div className="rounded-[16px] border border-slate-200 bg-white p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70 sm:p-6">
            <p className="text-[15px] font-medium text-slate-500 dark:text-muted-foreground">{label}</p>
            <div className="mt-3 flex items-baseline gap-3">
                <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>
                {(change || description) && (
                    <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                        {change && (
                            <span className={cn(
                                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[12px] font-bold tracking-tight",
                                changeType === 'positive' && "bg-[#e8f5f1] text-[#2ba384] dark:bg-emerald-500/20 dark:text-emerald-400",
                                changeType === 'negative' && "bg-[#fcedeb] text-[#e36154] dark:bg-rose-500/20 dark:text-rose-400",
                                changeType === 'neutral' && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            )}>
                                {changeType === 'positive' && <ArrowUpRight className="h-3 w-3" />}
                                {changeType === 'negative' && <ArrowDownRight className="h-3 w-3" />}
                                {change}
                            </span>
                        )}
                        {description && <span className="text-[13px] font-medium text-slate-400 dark:text-muted-foreground">{description}</span>}
                    </div>
                )}
            </div>
        </div>
    )
}

function tooltipPlacementClass(placement: 'top' | 'bottom' | 'left' = 'bottom') {
    if (placement === 'left') {
        return 'right-full top-1/2 mr-2 -translate-y-1/2 translate-x-1 group-hover:translate-x-0 group-focus-within:translate-x-0'
    }
    if (placement === 'top') {
        return 'bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0'
    }
    return 'top-full left-1/2 mt-2 -translate-x-1/2 -translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0'
}

function ActionButton({
    title,
    icon: Icon,
    onClick,
    disabled,
    tooltip,
    tone,
    tooltipPlacement = 'top',
}: {
    title: string
    icon: LucideIcon
    onClick?: () => void
    disabled?: boolean
    tooltip?: string
    tone: string
    tooltipPlacement?: 'top' | 'bottom' | 'left'
}) {
    const helperText = disabled && tooltip ? tooltip : title
    return (
        <div className="group relative inline-flex">
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-label={title}
                className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-200',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    tone
                )}
            >
                <Icon className="h-5 w-5" />
            </button>
            <div
                className={cn(
                    'pointer-events-none absolute z-[40] whitespace-nowrap rounded-xl border border-slate-200 bg-slate-900/95 px-3 py-1.5 text-center opacity-0 shadow-lg shadow-black/25 transition-all duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10',
                    tooltipPlacementClass(tooltipPlacement)
                )}
            >
                <p className="text-sm font-medium leading-none text-white">{helperText}</p>
            </div>
        </div>
    )
}

function ActionLinkButton({
    title,
    subtitle,
    icon: Icon,
    href,
    tone,
    tooltipPlacement = 'left',
}: {
    title: string
    subtitle: string
    icon: LucideIcon
    href: string
    tone: string
    tooltipPlacement?: 'top' | 'bottom' | 'left'
}) {
    return (
        <div className="group relative inline-flex">
            <Link
                href={href}
                aria-label={title}
                className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-2xl border transition-all duration-200',
                    tone
                )}
            >
                <Icon className="h-5 w-5" />
            </Link>
            <div
                className={cn(
                    'pointer-events-none absolute z-[40] whitespace-nowrap rounded-xl border border-slate-200 bg-slate-900/95 px-3 py-1.5 text-center opacity-0 shadow-lg shadow-black/25 transition-all duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/10',
                    tooltipPlacementClass(tooltipPlacement)
                )}
            >
                <p className="text-sm font-medium leading-none text-white">{subtitle}</p>
            </div>
        </div>
    )
}

function MemberCard({
    summary,
    expanded,
    canProcessPayments,
    onToggleExpand,
    onPay,
    onMail,
    onPreview,
}: {
    summary: Summary
    expanded: boolean
    canProcessPayments: boolean
    onToggleExpand: () => void
    onPay: () => void
    onMail: () => void
    onPreview: (title: string, image?: string | null) => void
}) {
    const meta = roleMeta(summary.role)
    const visibleBreakdown = expanded ? summary.workBreakdown : summary.workBreakdown.slice(0, 3)
    const maxCount = Math.max(...summary.workBreakdown.map((item) => item.count), 1)
    return (
        <div className="relative">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
                <div className={cn('absolute -right-10 -top-10 h-28 w-28 rounded-full blur-3xl', meta.glow)} />
            </div>
            <div className="glass relative z-10 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none">
                <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 flex-1 items-start gap-4">
                            <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold', meta.pill)}>
                                {summary.member.avatar ? <img src={summary.member.avatar} alt={summary.member.fullName} className="h-full w-full rounded-2xl object-cover" /> : getInitials(summary.member.fullName)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-lg font-semibold">{summary.member.fullName}</h3>
                                    <Badge className={meta.badge}>{meta.label}</Badge>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                    {summary.member.email && <><span className="truncate">{summary.member.email}</span></>}
                                </div>
                            </div>
                        </div>
                        <div className="shrink-0">
                            <ActionLinkButton
                                title="Profile"
                                subtitle="Open profile"
                                icon={ExternalLink}
                                href={`/team/${summary.member.id}`}
                                tone="border-slate-300 bg-slate-100 text-slate-600 shadow-sm shadow-slate-200/70 hover:border-slate-400 hover:bg-slate-200 dark:border-white/10 dark:bg-slate-950/25 dark:text-slate-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-white/20 dark:hover:bg-slate-950/40"
                                tooltipPlacement="left"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-500/15 dark:bg-emerald-500/5"><p className="text-[13px] font-medium tracking-tight text-slate-500 dark:text-muted-foreground">Completed orders</p><p className="mt-2 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">{summary.completedOrders}</p></div>
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3 dark:border-blue-500/15 dark:bg-blue-500/5"><p className="text-[13px] font-medium tracking-tight text-slate-500 dark:text-muted-foreground">Pending orders</p><p className="mt-2 text-xl font-bold tracking-tight text-blue-600 dark:text-blue-400">{summary.pendingOrders}</p></div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/85 p-3 dark:border-amber-500/15 dark:bg-amber-500/5"><p className="text-[13px] font-medium tracking-tight text-slate-500 dark:text-muted-foreground">Payable amount</p><p className="mt-2 text-xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{formatCurrency(summary.payableAmount)}</p></div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/85 p-3 dark:border-slate-500/15 dark:bg-white/5"><p className="text-[13px] font-medium tracking-tight text-slate-500 dark:text-muted-foreground">Total paid</p><p className="mt-2 text-xl font-bold tracking-tight text-slate-700 dark:text-slate-200">{formatCurrency(summary.totalPaid)}</p></div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div><p className="text-sm font-semibold tracking-tight">Work breakdown</p></div>
                            {summary.workBreakdown.length > 3 && <button type="button" onClick={onToggleExpand} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80">{expanded ? 'Show less' : 'Show more'} {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button>}
                        </div>
                        {summary.workBreakdown.length ? (
                            <div className="space-y-3">
                                {visibleBreakdown.map((item) => (
                                    <div key={item.label} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{item.label}</span><span className="text-muted-foreground">{item.count}</span></div>
                                        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className={cn('h-full rounded-full bg-gradient-to-r', meta.bar)} style={{ width: `${Math.max((item.count / maxCount) * 100, 12)}%` }} /></div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-sm text-muted-foreground">No matched work yet.</p>}
                    </div>
                    <div className={cn('grid items-center justify-items-center gap-3', canProcessPayments ? 'grid-cols-4' : 'grid-cols-3')}>
                        {canProcessPayments && <ActionButton title="Pay" icon={Wallet} onClick={onPay} disabled={!summary.payableItems.length} tooltip="No payable work yet." tone="border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:border-amber-400/30 dark:hover:bg-amber-500/15" />}
                        <ActionButton title="Mail invoice" icon={Mail} onClick={onMail} disabled={!summary.member.email || !summary.lastInvoiceUrl} tooltip={!summary.member.email ? 'Email missing.' : 'Invoice not ready yet.'} tone="border-blue-200 bg-blue-50 text-blue-600 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:border-blue-400/30 dark:hover:bg-blue-500/15" />
                        <ActionButton title="QR code" icon={QrCode} onClick={() => onPreview(`${summary.member.fullName} QR Code`, summary.member.qrScannerUrl)} disabled={!summary.member.qrScannerUrl} tooltip="QR not uploaded." tone="border-violet-200 bg-violet-50 text-violet-600 hover:border-violet-300 hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300 dark:hover:border-violet-400/30 dark:hover:bg-violet-500/15" />
                        <ActionButton title="Passbook" icon={FileText} onClick={() => onPreview(`${summary.member.fullName} Bank Passbook`, summary.member.bankPassbookUrl)} disabled={!summary.member.bankPassbookUrl} tooltip="Passbook not uploaded." tone="border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-100 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:border-emerald-400/30 dark:hover:bg-emerald-500/15" />
                    </div>
                </div>
            </div>
        </div>
    )
}

function AssetLightbox({ state, onClose }: { state: LightboxState | null; onClose: () => void }) {
    if (!state) return null
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/20 backdrop-blur-md p-4 sm:p-8" onClick={onClose}>
            <button type="button" onClick={onClose} className="absolute right-4 top-4 z-[91] rounded-full border border-white/15 bg-white/10 p-2 text-white hover:bg-white/15"><X className="h-5 w-5" /></button>
            <div className="relative flex max-h-[90vh] w-full max-w-[90vw] flex-col items-center justify-center gap-4" onClick={(event) => event.stopPropagation()}>
                <img src={state.imageUrl} alt={state.title} className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" />
                <p className="text-center text-sm font-medium text-white/80">{state.title}</p>
            </div>
        </div>
    )
}

export default function LeaderDashboardPage() {
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { _hasHydrated, isAuthenticated, user } = useAuthStore()
    const canView = user?.role === 'ADMIN' || user?.role === 'MANAGER'
    const canProcessPayments = user?.role === 'ADMIN'
    const [draftRole, setDraftRole] = useState<StaffRoleFilter>('ALL')
    const [draftMember, setDraftMember] = useState(ALL_MEMBERS)
    const [appliedRole, setAppliedRole] = useState<StaffRoleFilter>('ALL')
    const [appliedMember, setAppliedMember] = useState(ALL_MEMBERS)
    const [expanded, setExpanded] = useState<number[]>([])
    const [paymentMemberId, setPaymentMemberId] = useState<number | null>(null)
    const [paymentNote, setPaymentNote] = useState('')
    const [paying, setPaying] = useState(false)
    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulkSubmitting, setBulkSubmitting] = useState(false)
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
    const [bulkMail, setBulkMail] = useState<BulkMailState | null>(null)
    const [lightbox, setLightbox] = useState<LightboxState | null>(null)
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedMembers, setSelectedMembers] = useState<number[]>([])

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['leader-payment-summary'],
        queryFn: async () => ((await teamAPI.getPaymentSummary()).data.data || []) as Member[],
        enabled: _hasHydrated && isAuthenticated && canView,
        staleTime: 30000,
    })

    const summaries = (data || []).map(buildSummary)
    const memberOptions = summaries.filter((summary) => draftRole === 'ALL' || summary.role === draftRole)
    const filtered = summaries.filter((summary) => {
        if (appliedRole !== 'ALL' && summary.role !== appliedRole) return false
        if (appliedMember !== ALL_MEMBERS && String(summary.member.id) !== appliedMember) return false
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase()
            return summary.member.fullName.toLowerCase().includes(query) || (summary.member.email && summary.member.email.toLowerCase().includes(query))
        }
        return true
    })
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    let currentMonthPaid = 0
    let lastMonthPaid = 0
    let currentMonthCompleted = 0
    let lastMonthCompleted = 0

    summaries.forEach((summary) => {
        summary.member.paymentRecords.forEach((record) => {
            if (!record.paidAt) return
            const date = new Date(record.paidAt)
            if (date >= currentMonthStart) currentMonthPaid += Number(record.amount) || 0
            else if (date >= lastMonthStart && date <= lastMonthEnd) lastMonthPaid += Number(record.amount) || 0
        })
        summary.member.assignedStudents.forEach((student) => {
            if (COMPLETED_STATUSES.has(student.status) && student.createdAt) {
                const date = new Date(student.createdAt)
                if (date >= currentMonthStart) currentMonthCompleted += 1
                else if (date >= lastMonthStart && date <= lastMonthEnd) lastMonthCompleted += 1
            }
        })
    })

    const calculateChange = (current: number, last: number) => {
        if (last === 0) return current > 0 ? { value: '+100%', type: 'positive' as const } : undefined
        const diff = current - last
        const percent = (diff / last) * 100
        return {
            value: `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`,
            type: percent > 0 ? 'positive' as const : percent < 0 ? 'negative' as const : 'neutral' as const
        }
    }

    const paidChange = calculateChange(currentMonthPaid, lastMonthPaid)
    const completedChange = calculateChange(currentMonthCompleted, lastMonthCompleted)

    const stats = {
        totalStaff: summaries.length,
        pending: summaries.reduce((sum, summary) => sum + summary.payableAmount, 0),
        paid: summaries.reduce((sum, summary) => sum + summary.totalPaid, 0),
        completed: summaries.reduce((sum, summary) => sum + summary.completedOrders, 0),
    }
    const basePayableVisible = filtered.filter((summary) => summary.payableAmount > 0)
    const payableVisible = selectedMembers.length > 0 ? basePayableVisible.filter(s => selectedMembers.includes(s.member.id)) : basePayableVisible
    const payableVisibleTotal = payableVisible.reduce((sum, summary) => sum + summary.payableAmount, 0)
    const paymentMember = summaries.find((summary) => summary.member.id === paymentMemberId) || null

    const toggleExpand = (id: number) => setExpanded((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])
    const applyFilters = () => { setAppliedRole(draftRole); setAppliedMember(draftMember) }
    const changeDraftRole = (nextRole: StaffRoleFilter) => { setDraftRole(nextRole); setDraftMember(ALL_MEMBERS) }
    const previewImage = (title: string, image?: string | null) => image && setLightbox({ title, imageUrl: assetUrl(image) })
    const sendMemberMail = async (summary: Summary) => {
        if (!summary.member.email || !summary.lastInvoiceUrl) return
        try {
            await teamAPI.sendEmail(summary.member.id, {
                subject: `Payment Invoice - ${summary.member.fullName}`,
                body: invoiceBody(summary.member.fullName, summary.lastInvoiceUrl),
                invoiceUrl: summary.lastInvoiceUrl
            })
            toast({ title: 'Email sent', description: `Invoice sent to ${summary.member.fullName}`, variant: 'success' })
        } catch (error: any) {
            toast({ title: 'Email failed', description: error?.response?.data?.message || 'Could not send email. Check SMTP settings.', variant: 'destructive' })
        }
    }

    const sendBulkMail = () => {
        toast({ title: 'Not implemented', description: 'Bulk email via SMTP coming soon.' })
    }

    const closePaymentDialog = (open: boolean) => {
        if (paying) return
        if (!open) {
            setPaymentMemberId(null)
            setPaymentNote('')
        }
    }

    const confirmPayment = async () => {
        if (!paymentMember || !paymentMember.payableItems.length || paying) return
        setPaying(true)
        try {
            const response = await teamAPI.markPaymentDone(paymentMember.member.id, {
                amount: paymentMember.payableAmount,
                note: paymentNote.trim(),
                studentIds: paymentMember.payableItems.map((item) => item.studentId),
                breakdown: paymentMember.payableItems,
            })
            toast({ title: 'Payment recorded', description: `${paymentMember.member.fullName} has been marked as paid.`, variant: 'success' })
            downloadInvoice(response.data?.data?.invoiceUrl)
            await queryClient.invalidateQueries({ queryKey: ['leader-payment-summary'] })
            setPaymentMemberId(null)
            setPaymentNote('')
        } catch (error: any) {
            toast({ title: 'Payment failed', description: error?.response?.data?.message || 'Unable to record payment right now.', variant: 'destructive' })
        } finally {
            setPaying(false)
        }
    }

    const openBulkDialog = () => {
        if (!payableVisible.length) {
            toast({ 
                title: 'Nothing to pay', 
                description: selectedMembers.length > 0 
                    ? 'None of the selected members have pending payable work.' 
                    : 'There are no visible members with pending payable work.', 
                variant: 'destructive' 
            })
            return
        }
        setBulkProgress({ current: 0, total: payableVisible.length })
        setBulkOpen(true)
    }

    const confirmBulkPay = async () => {
        if (!payableVisible.length || bulkSubmitting) return
        setBulkSubmitting(true)
        const emails: string[] = []
        const invoices: BulkMailState['invoices'] = []
        let successCount = 0
        let failureCount = 0
        try {
            for (let index = 0; index < payableVisible.length; index += 1) {
                const summary = payableVisible[index]
                setBulkProgress({ current: index + 1, total: payableVisible.length })
                try {
                    const response = await teamAPI.markPaymentDone(summary.member.id, {
                        amount: summary.payableAmount,
                        note: 'Bulk payment from Staff Payment Hub',
                        studentIds: summary.payableItems.map((item) => item.studentId),
                        breakdown: summary.payableItems,
                    })
                    if (summary.member.email) emails.push(summary.member.email)
                    if (response.data?.data?.invoiceUrl) invoices.push({ memberName: summary.member.fullName, invoiceUrl: response.data.data.invoiceUrl })
                    successCount += 1
                } catch {
                    failureCount += 1
                }
            }
            if (successCount > 0) setBulkMail({ emails: Array.from(new Set(emails)), invoices })
            await queryClient.invalidateQueries({ queryKey: ['leader-payment-summary'] })
            setBulkOpen(false)
            toast({ title: 'Bulk payment complete', description: `${successCount} payments processed, ${invoices.length} invoices generated${failureCount ? `, ${failureCount} failed` : ''}.`, variant: successCount > 0 ? 'success' : 'destructive' })
        } finally {
            setBulkSubmitting(false)
            setBulkProgress({ current: 0, total: payableVisible.length })
        }
    }

    if (!_hasHydrated) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-36 rounded-3xl" />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-36 rounded-3xl" />)}</div>
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-80 rounded-3xl" />)}</div>
            </div>
        )
    }

    if (!canView) {
        return (
            <div className="glass rounded-3xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-sm shadow-slate-200/80 dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400"><ShieldAlert className="h-6 w-6" /></div>
                <h1 className="mt-4 text-2xl font-bold">Staff Payment Hub</h1>
                <p className="mt-2 text-sm text-muted-foreground">This page is available to admins and managers only.</p>
            </div>
        )
    }

    return (
        <div className={cn('space-y-6 pb-10 animate-fade-in', manrope.className)}>
            <div className="glass sticky top-0 z-20 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/88 px-4 py-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none sm:px-6 sm:py-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-white/40" />
                <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
                <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-blue-300/20 blur-3xl dark:bg-blue-500/10" />
                <div className="relative z-10 space-y-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pt-1">
                            <div>
                                <h1 className={cn("text-[32px] font-extrabold tracking-tight text-[#111827] dark:text-white leading-none", manrope.className)}>Payments</h1>
                            </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <Select value={draftRole} onValueChange={(value) => changeDraftRole(value as StaffRoleFilter)}>
                                <SelectTrigger className="h-[42px] w-[130px] rounded-[10px] border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-500 shadow-sm hover:bg-slate-50 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                                    <SelectValue placeholder="All Roles" />
                                </SelectTrigger>
                                <SelectContent className="border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 rounded-[10px]">
                                    {ROLE_FILTERS.map((role) => (
                                        <SelectItem key={role.value} value={role.value} className="cursor-pointer font-medium text-slate-600 focus:bg-slate-50 focus:text-blue-600 dark:text-slate-300 dark:focus:bg-white/10 dark:focus:text-white rounded-[6px]">
                                            {role.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select value={draftMember} onValueChange={setDraftMember}>
                                <SelectTrigger className="h-[42px] w-[150px] rounded-[10px] border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-500 shadow-sm hover:bg-slate-50 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300">
                                    <SelectValue placeholder="All Members" />
                                </SelectTrigger>
                                <SelectContent className="border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900 rounded-[10px]">
                                    <SelectItem value={ALL_MEMBERS} className="cursor-pointer font-medium text-slate-600 focus:bg-slate-50 focus:text-blue-600 dark:text-slate-300 dark:focus:bg-white/10 dark:focus:text-white rounded-[6px]">All Members</SelectItem>
                                    {memberOptions.map((summary) => (
                                        <SelectItem key={summary.member.id} value={String(summary.member.id)} className="cursor-pointer font-medium text-slate-600 focus:bg-slate-50 focus:text-blue-600 dark:text-slate-300 dark:focus:bg-white/10 dark:focus:text-white rounded-[6px]">
                                            {summary.member.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button onClick={applyFilters} className="h-[42px] px-6 text-[14px] font-medium">
                                Show
                            </Button>

                            <div className="flex h-[42px] items-center rounded-[10px] border border-slate-200 bg-white p-[3px] shadow-sm dark:border-white/10 dark:bg-slate-800">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={cn("flex h-[34px] w-[36px] items-center justify-center rounded-[7px] transition-colors", viewMode === 'grid' ? "bg-[#f3f4f6] text-[#4b5563] dark:bg-white/10 dark:text-white" : "text-[#9ca3af] hover:text-[#4b5563] dark:hover:text-slate-300")}
                                >
                                    <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={2.5} />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={cn("flex h-[34px] w-[36px] items-center justify-center rounded-[7px] transition-colors", viewMode === 'list' ? "bg-[#f3f4f6] text-[#4b5563] dark:bg-white/10 dark:text-white" : "text-[#9ca3af] hover:text-[#4b5563] dark:hover:text-slate-300")}
                                >
                                    <List className="h-[20px] w-[20px]" strokeWidth={2.5} />
                                </button>
                            </div>

                            {canProcessPayments && (
                                <Button onClick={openBulkDialog} disabled={isLoading} className="h-[42px] rounded-[10px] bg-[#82d6b3] px-5 text-[14px] font-semibold text-[#1a5a3f] shadow-[0_4px_14px_0_rgba(130,214,179,0.39)] hover:bg-[#68c6a0] transition-all">
                                    <IndianRupee className="mr-1.5 h-[16px] w-[16px]" strokeWidth={2.5} />{selectedMembers.length > 0 ? 'Pay Selected' : 'Bulk Pay All'}
                                </Button>
                            )}
                            
                            {canProcessPayments && bulkMail && (
                                <Button onClick={sendBulkMail} disabled={!bulkMail.invoices.length || !bulkMail.emails.length} className="h-[42px] rounded-[10px] bg-[#82b4d6] px-5 text-sm font-semibold text-[#1a3a5a] shadow-[0_4px_14px_0_rgba(130,180,214,0.39)] hover:bg-[#68a6ca] transition-all">
                                    <Mail className="mr-1.5 h-4 w-4" />Bulk Mail
                                </Button>
                            )}
                        </div>
                    </div>

                    {isFetching && (
                        <div className="flex justify-end xl:mt-[-8px]">
                            <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-500 dark:text-blue-300">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing summary
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Pending payout" value={<AmountStatValue amount={stats.pending} tone="text-slate-900 dark:text-white" />} description="Total pending" />
                <StatCard label="Paid out" value={<AmountStatValue amount={stats.paid} tone="text-slate-900 dark:text-white" />} change={paidChange?.value} changeType={paidChange?.type} description="vs last month" />
                <StatCard label="Completed orders" value={stats.completed} change={completedChange?.value} changeType={completedChange?.type} description="vs last month" />
                <StatCard label="Total staff" value={stats.totalStaff} description="Total active members" />
            </div>

            {isLoading ? (
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-[360px] rounded-3xl" />)}</div>
            ) : !filtered.length ? (
                <div className="glass rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-14 text-center shadow-sm shadow-slate-200/80 dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5"><Users className="h-6 w-6 text-slate-500 dark:text-muted-foreground" /></div>
                    <h2 className="mt-4 text-xl font-semibold">No matching staff found</h2>
                    <p className="mt-2 text-sm text-muted-foreground">Try another role or member filter to see payment summaries.</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((summary) => <MemberCard key={summary.member.id} summary={summary} expanded={expanded.includes(summary.member.id)} canProcessPayments={canProcessPayments} onToggleExpand={() => toggleExpand(summary.member.id)} onPay={() => { setPaymentMemberId(summary.member.id); setPaymentNote('') }} onMail={() => sendMemberMail(summary)} onPreview={previewImage} />)}
                </div>
            ) : (
                <div className="rounded-[16px] border border-slate-200 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70 overflow-hidden">
                    <div className="p-5 border-b border-slate-200/60 dark:border-white/10 bg-transparent">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white leading-none">Payroll list</h2>
                            <div className="relative w-full sm:w-auto">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search Employee" className="h-10 w-full sm:w-[240px] rounded-lg border border-slate-200 px-9 text-sm outline-none transition-all placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-emerald-500 dark:border-slate-700/50 dark:bg-slate-800/50 dark:text-slate-200 dark:placeholder:text-slate-500" />
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-[#fbfcff] dark:bg-slate-800/30 text-slate-500 dark:text-slate-400">
                                <tr>
                                    <th className="px-5 py-4 font-medium">
                                        <input 
                                            type="checkbox" 
                                            checked={filtered.length > 0 && selectedMembers.length === filtered.length}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedMembers(filtered.map(s => s.member.id))
                                                else setSelectedMembers([])
                                            }}
                                            className="rounded-[4px] border-slate-300 dark:border-slate-600 bg-transparent" 
                                        />
                                    </th>
                                    <th className="px-5 py-4 font-medium">Employee name <ChevronUp className="inline h-3 w-3 ml-1" /></th>
                                    <th className="px-5 py-4 font-medium">Role <ChevronUp className="inline h-3 w-3 ml-1" /></th>
                                    <th className="px-5 py-4 font-medium">Date &amp; Time <ChevronUp className="inline h-3 w-3 ml-1" /></th>
                                    <th className="px-5 py-4 font-medium">Total Salary</th>
                                    <th className="px-5 py-4 font-medium">Due Amount</th>
                                    <th className="px-5 py-4 font-medium">Payment Status <ChevronUp className="inline h-3 w-3 ml-1" /></th>
                                    <th className="px-5 py-4 font-medium text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-transparent">
                                {filtered.map((summary) => (
                                    <tr key={summary.member.id} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02]">
                                        <td className="px-5 py-4">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedMembers.includes(summary.member.id)}
                                                onChange={() => {
                                                    if (selectedMembers.includes(summary.member.id)) {
                                                        setSelectedMembers(prev => prev.filter(id => id !== summary.member.id))
                                                    } else {
                                                        setSelectedMembers(prev => [...prev, summary.member.id])
                                                    }
                                                }}
                                                className="rounded-[4px] border-slate-300 dark:border-slate-600 bg-transparent" 
                                            />
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                {summary.member.avatar ? (
                                                    <img src={summary.member.avatar} alt={summary.member.fullName} className="h-[34px] w-[34px] rounded-full object-cover" />
                                                ) : (
                                                    <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{getInitials(summary.member.fullName)}</div>
                                                )}
                                                <span className="font-semibold text-slate-900 dark:text-white text-[15px]">{summary.member.fullName}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-slate-500 font-medium">{roleMeta(summary.role).label}</td>
                                        <td className="px-5 py-4 text-slate-500 font-medium">
                                            {summary.lastActiveAt ? new Date(summary.lastActiveAt).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Activity'}
                                        </td>
                                        <td className="px-5 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                            Rs {formatAmountNumber(summary.totalPaid + summary.payableAmount)}
                                        </td>
                                        <td className="px-5 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                            Rs {formatAmountNumber(summary.payableAmount)}
                                        </td>
                                        <td className="px-5 py-4">
                                            {summary.payableAmount > 0 ? (
                                                <span className="inline-flex items-center rounded-md border border-[#eab308] bg-white dark:bg-transparent px-2.5 py-1 text-[13px] font-semibold text-[#eab308] dark:border-[#eab308]/50">Pending</span>
                                            ) : summary.totalPaid > 0 ? (
                                                <span className="inline-flex items-center rounded-md border border-[#2ba384] bg-white dark:bg-transparent px-2.5 py-1 text-[13px] font-semibold text-[#2ba384] dark:border-[#2ba384]/50">Settled</span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-md border border-slate-300 bg-white dark:bg-transparent px-2.5 py-1 text-[13px] font-semibold text-slate-500 dark:border-slate-600 dark:text-slate-400">No Dues</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                {canProcessPayments && (
                                                    <button
                                                        onClick={() => { setPaymentMemberId(summary.member.id); setPaymentNote('') }}
                                                        disabled={!summary.payableItems.length}
                                                        className={cn(
                                                            "group relative flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                                                            "border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-300 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed",
                                                            "dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:border-amber-500/30"
                                                        )}
                                                        title="Process Payout"
                                                    >
                                                        <Wallet className="h-4 w-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => sendMemberMail(summary)}
                                                    disabled={!summary.member.email || !summary.lastInvoiceUrl}
                                                    className={cn(
                                                        "group relative flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                                                        "border-blue-200 bg-blue-50 text-blue-600 hover:border-blue-300 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed",
                                                        "dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:border-blue-500/30"
                                                    )}
                                                    title="Email Invoice"
                                                >
                                                    <Mail className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => previewImage(`${summary.member.fullName} QR Code`, summary.member.qrScannerUrl)}
                                                    disabled={!summary.member.qrScannerUrl}
                                                    className={cn(
                                                        "group relative flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                                                        "border-violet-200 bg-violet-50 text-violet-600 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed",
                                                        "dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400 dark:hover:border-violet-500/30"
                                                    )}
                                                    title="QR Code"
                                                >
                                                    <QrCode className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => previewImage(`${summary.member.fullName} Bank Passbook`, summary.member.bankPassbookUrl)}
                                                    disabled={!summary.member.bankPassbookUrl}
                                                    className={cn(
                                                        "group relative flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200",
                                                        "border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed",
                                                        "dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:border-emerald-500/30"
                                                    )}
                                                    title="Bank Passbook"
                                                >
                                                    <FileText className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <Dialog open={Boolean(paymentMember)} onOpenChange={closePaymentDialog}>
                <DialogContent className="max-w-4xl overflow-hidden border-white/10 bg-background/95 p-0 backdrop-blur-2xl">
                    <DialogHeader className="border-b border-white/10 px-6 py-5">
                        <DialogTitle className="flex items-center gap-2 text-xl"><Wallet className="h-5 w-5 text-amber-400" />Pay {paymentMember?.member.fullName || 'Member'}</DialogTitle>
                        <DialogDescription>Review unpaid completed work, confirm payout, and generate the invoice automatically.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 px-6 py-5">
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Account No</p><p className="mt-2 text-sm font-semibold">{paymentMember?.member.bankAccNo || 'Not provided'}</p></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Bank Name</p><p className="mt-2 text-sm font-semibold">{paymentMember?.member.bankName || 'Not provided'}</p></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">UPI ID</p><p className="mt-2 text-sm font-semibold">{paymentMember?.member.upiId || 'Not provided'}</p></div>
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-white/10">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[680px]">
                                    <thead className="bg-white/5"><tr><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Student Name</th><th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Requirement</th><th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Amount</th></tr></thead>
                                    <tbody className="divide-y divide-white/10">
                                        {paymentMember?.payableItems.length ? paymentMember.payableItems.map((item) => <tr key={item.studentId}><td className="px-4 py-3 text-sm font-medium">{item.studentName}</td><td className="px-4 py-3 text-sm text-muted-foreground">{item.requirement || '—'}</td><td className="px-4 py-3 text-right text-sm font-semibold text-amber-300">{formatCurrency(item.amount)}</td></tr>) : <tr><td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">No unpaid completed work found for this member.</td></tr>}
                                    </tbody>
                                    <tfoot className="border-t border-white/10 bg-amber-500/5"><tr><td colSpan={2} className="px-4 py-4 text-right text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Grand Total</td><td className="px-4 py-4 text-right text-lg font-bold text-amber-300">{formatCurrency(paymentMember?.payableAmount || 0)}</td></tr></tfoot>
                                </table>
                            </div>
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium">Optional Note</label>
                            <textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} rows={4} placeholder="Add a note to include in the payment record and invoice..." className="flex min-h-[104px] w-full rounded-2xl border border-input bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                    </div>
                    <DialogFooter className="border-t border-white/10 px-6 py-4">
                        <Button variant="outline" onClick={() => closePaymentDialog(false)} disabled={paying} className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10">Cancel</Button>
                        <Button onClick={confirmPayment} disabled={paying || !paymentMember?.payableItems.length} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-500">{paying ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming Payment</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Confirm Payment</>}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkOpen} onOpenChange={(open) => !bulkSubmitting && setBulkOpen(open)}>
                <DialogContent className="max-w-3xl overflow-hidden border-white/10 bg-background/95 p-0 backdrop-blur-2xl">
                    <DialogHeader className="border-b border-white/10 px-6 py-5">
                        <DialogTitle className="flex items-center gap-2 text-xl"><IndianRupee className="h-5 w-5 text-amber-400" />Bulk Pay All</DialogTitle>
                        <DialogDescription>You are about to pay {payableVisible.length} member{payableVisible.length === 1 ? '' : 's'} for a total of {formatCurrency(payableVisibleTotal)}.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 px-6 py-5">
                        {bulkSubmitting && <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-300"><div className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin" />Paying {bulkProgress.current} of {bulkProgress.total}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300" style={{ width: `${bulkProgress.total ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }} /></div></div>}
                        <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                            {payableVisible.map((summary) => <div key={summary.member.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><div><p className="font-semibold">{summary.member.fullName}</p><p className="text-sm text-muted-foreground">{summary.payableItems.length} payable item{summary.payableItems.length === 1 ? '' : 's'}</p></div><p className="font-semibold text-amber-300">{formatCurrency(summary.payableAmount)}</p></div>)}
                        </div>
                    </div>
                    <DialogFooter className="border-t border-white/10 px-6 py-4">
                        <Button variant="outline" onClick={() => !bulkSubmitting && setBulkOpen(false)} disabled={bulkSubmitting} className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10">Cancel</Button>
                        <Button onClick={confirmBulkPay} disabled={bulkSubmitting || !payableVisible.length} className="rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400">{bulkSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Confirm Bulk Payment</>}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AssetLightbox state={lightbox} onClose={() => setLightbox(null)} />
        </div>
    )
}

