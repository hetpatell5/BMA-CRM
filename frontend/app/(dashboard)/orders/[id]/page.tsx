'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { studentsAPI, shiprocketAPI } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    ArrowLeft, BookOpen,
    GraduationCap, Edit, User, Info, FileText,
    Truck, ExternalLink, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { formatDate, getStatusColor } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const ShiprocketModal = dynamic(() => import('@/components/shiprocket-modal'), { ssr: false })

const INTERNAL_CUSTOM_FIELD_KEYS = new Set(['requirementassignments', 'telecallerowners'])

function normalizeFieldKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function valueToText(value: any): string {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join(', ')
    if (typeof value === 'object') return ''
    return String(value).trim()
}

function customFieldText(customFields: Record<string, any> | null | undefined, ...keywords: string[]): string {
    if (!customFields || typeof customFields !== 'object') return ''

    const entries = Object.entries(customFields)
        .filter(([key, value]) => !INTERNAL_CUSTOM_FIELD_KEYS.has(normalizeFieldKey(key)) && valueToText(value))

    for (const keyword of keywords) {
        const normalizedKeyword = normalizeFieldKey(keyword)
        const exact = entries.find(([key]) => normalizeFieldKey(key) === normalizedKeyword)
        if (exact) return valueToText(exact[1])

        const partial = entries.find(([key]) => key.toLowerCase().includes(keyword.toLowerCase()))
        if (partial) return valueToText(partial[1])
    }

    return ''
}

// ─── Pretty-print a single custom field value ────────────────────────────────
function FieldValue({ val }: { val: any }) {
    if (val === null || val === undefined || val === '') return <span className="text-muted-foreground italic">—</span>
    if (Array.isArray(val)) {
        const values = val.map(valueToText).filter(Boolean)
        if (values.length === 0) return <span className="text-muted-foreground italic">—</span>
        return (
            <div className="flex flex-wrap gap-1.5 mt-1">
                {values.map((v, i) => (
                    <span key={i} className="px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded text-xs">{v}</span>
                ))}
            </div>
        )
    }
    if (typeof val === 'object') {
        const text = valueToText(val)
        return <span className="font-medium break-words">{text || JSON.stringify(val)}</span>
    }
    return <span className="font-medium break-words">{String(val)}</span>
}

function formatPrice(value: string | null | undefined) {
    if (!value) return '-'

    const normalized = String(value).trim()
    if (!normalized) return '-'

    const numeric = Number(normalized.replace(/,/g, ''))
    if (!Number.isNaN(numeric)) {
        return `Rs ${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    }

    return normalized
}

function escapeHtml(value: any) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function printableText(value: any) {
    const text = valueToText(value)
    return text || '—'
}

// ─── Core fields we map directly (skip from customFields display) ─────────────
const CORE_KEYWORDS = ['name', 'email', 'phone', 'contact number', 'mobile', 'programme', 'program name', 'course']
function isCoreField(label: string) {
    const l = label.toLowerCase()
    return CORE_KEYWORDS.some(kw => l.includes(kw))
}

export default function StudentDetailPage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const { id } = params
    const { user: currentUser } = useAuthStore()
    const isTelecaller = currentUser?.role === 'STAFF' && currentUser?.staffRole === 'TELECALLER'
    const canSeeDecidedPrice = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER' || isTelecaller

    const queryClient = useQueryClient()
    const { toast } = useToast()

    const [showEditPrice, setShowEditPrice] = useState(false)
    const [editPriceValue, setEditPriceValue] = useState('')
    const [showShiprocketModal, setShowShiprocketModal] = useState(false)
    const [isPreparingPdf, setIsPreparingPdf] = useState(false)

    const { data: response, isLoading } = useQuery({
        queryKey: ['student', id],
        queryFn: () => studentsAPI.getById(id),
        retry: 1,
    })

    // Fetch Shiprocket config for dynamic hard copy keyword detection
    const { data: srConfigData } = useQuery({
        queryKey: ['shiprocket-config'],
        queryFn: async () => (await shiprocketAPI.getConfig()).data.data,
        staleTime: 5 * 60 * 1000,
    })
    const hardCopyKeywords: string[] = srConfigData?.hardCopyKeywords || ['hard copy']

    const student = response?.data?.data

    const updatePriceMutation = useMutation({
        mutationFn: (newPrice: string) => {
            const nextFields = { ...customFields }
            if (newPrice.trim()) {
                nextFields['Decided Price'] = newPrice.trim()
            } else {
                delete nextFields['Decided Price']
                delete nextFields['decided price']
            }
            return studentsAPI.update(id, { customFields: nextFields })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['student', id] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setShowEditPrice(false)
            toast({ title: 'Updated', description: 'Decided Price has been updated', variant: 'success' })
        },
        onError: (err: any) => {
            toast({ title: 'Error', description: err.response?.data?.message || 'Failed to update', variant: 'destructive' })
        }
    })

    if (isLoading) {
        return (
            <div className="p-6 space-y-6 animate-pulse">
                <Skeleton className="w-64 h-8" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-64 rounded-xl col-span-2" />
                    <Skeleton className="h-64 rounded-xl" />
                </div>
            </div>
        )
    }

    if (!student) {
        return (
            <div className="p-6 text-center">
                <h3 className="text-lg font-semibold mb-2">Order not found</h3>
                <Button onClick={() => router.push('/orders')}>Go Back</Button>
            </div>
        )
    }

    // Get custom fields — exclude nulls and empty strings
    const customFields: Record<string, any> = (student.customFields && typeof student.customFields === 'object')
        ? student.customFields
        : {}

    // Separate "extra" custom fields (all non-core ones, excluding price/commission managed fields)
    const decidedPrice = customFields['Decided Price'] || customFields.decidedPrice
    const commission   = customFields['Commission'] || customFields.commission
    const requirementText = customFieldText(customFields, 'requirement of', 'requirement in', 'product type', 'requirement')

    const extraFields = Object.entries(customFields).filter(([k, v]) =>
        !INTERNAL_CUSTOM_FIELD_KEYS.has(normalizeFieldKey(k)) &&
        !k.toLowerCase().includes('decided price') &&
        !k.toLowerCase().includes('commission') &&
        valueToText(v) !== ''
    )

    const sourceLabel =
        student.source === 'form_submission' ? { txt: 'Form Submission', cls: 'bg-violet-500/20 text-violet-300 border-violet-500/30' }
        : student.source === 'excel' ? { txt: 'Excel Import', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
        : { txt: 'Manual', cls: 'bg-white/10 text-muted-foreground border-white/20' };

    const handleSavePdf = () => {
        setIsPreparingPdf(true)

        try {
            const contactRows: Array<[string, any]> = [
                ['Full Name', student.fullName],
                ['Email Id', student.email],
                ['Contact Number', student.phone],
                ['Alternative Contact', customFields['Alternative Contact Number'] || customFields['Alt Contact'] || student.alternateEmail],
                ['Postal Address', customFields['Postal Address With Pincode'] || customFields['Postal Address'] || customFields['Address'] || [student.city, student.state].filter(Boolean).join(', ')],
            ]

            const academicRows: Array<[string, any]> = [
                ['Program Name', student.programme || student.course || customFields['Program Name with Year'] || customFields['Programme']],
                ['Present Semester / Year', customFields['Present Semester / Year'] || customFields['Present Semester'] || customFields['Semester'] || customFields['Year']],
                ['Enrollment No', student.enrollmentNo],
                ['Regional Center', student.regionalCenter],
                ['Subjects', Array.isArray(student.subjects) ? student.subjects.join(', ') : student.subjects],
            ]

            const assignmentRows: Array<[string, any]> = [
                ['Requirement', requirementText],
                ['Subject Codes', customFields['Require Assignments Subject Codes (Ex: ECO-01, BCS-011, etc.)'] || customFields['Subject Codes']],
                ['Total Assignments', customFields['Total How Many Assignments (Ex: 4, 6, 8, 10, 14 etc.)']],
                ['Language', customFields['Assignment Language'] || customFields['Language']],
                ['Description', customFields['Describe Requirement'] || customFields['Description']],
                ['Order / Payment Date', customFields['Order Date / Payment Date'] || customFields['Payment Date']],
            ]

            if (commission) {
                assignmentRows.splice(5, 0, ['Commission', formatPrice(commission)])
            }
            if (canSeeDecidedPrice) {
                assignmentRows.splice(commission ? 6 : 5, 0, ['Decided Price', decidedPrice ? formatPrice(decidedPrice) : 'Not set'])
            }

            const recordRows: Array<[string, any]> = [
                ['Status', student.status?.replace(/_/g, ' ')],
                ['Source', sourceLabel.txt],
                ['Added By', student.createdBy?.fullName || 'System'],
                ['Added On', formatDate(student.createdAt)],
                ['Updated', formatDate(student.updatedAt)],
            ]

            const renderSection = (title: string, rows: Array<[string, any]>) => {
                const filteredRows = rows.filter(([, value]) => printableText(value) !== '—')
                if (filteredRows.length === 0) return ''

                return `
                    <section class="section">
                        <h2>${escapeHtml(title)}</h2>
                        <div class="grid">
                            ${filteredRows.map(([label, value]) => `
                                <div class="row">
                                    <div class="label">${escapeHtml(label)}</div>
                                    <div class="value">${escapeHtml(printableText(value))}</div>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                `
            }

            const extraSection = extraFields.length > 0 ? `
                <section class="section">
                    <h2>Form Response Details</h2>
                    <div class="grid">
                        ${extraFields.map(([label, value]) => `
                            <div class="row">
                                <div class="label">${escapeHtml(label)}</div>
                                <div class="value">${escapeHtml(printableText(value))}</div>
                            </div>
                        `).join('')}
                    </div>
                </section>
            ` : ''

            const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768')
            if (!printWindow) {
                toast({
                    title: 'Popup blocked',
                    description: 'Please allow popups to save this order as PDF.',
                    variant: 'destructive',
                })
                return
            }

            const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="utf-8" />
                    <title>${escapeHtml(`Order ${student.fullName || id}`)}</title>
                    <style>
                        * { box-sizing: border-box; }
                        body {
                            margin: 0;
                            padding: 32px;
                            font-family: Arial, sans-serif;
                            color: #0f172a;
                            background: #f8fafc;
                        }
                        .page {
                            max-width: 920px;
                            margin: 0 auto;
                            background: #ffffff;
                            border: 1px solid #e2e8f0;
                            border-radius: 16px;
                            padding: 32px;
                        }
                        .topbar {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            gap: 24px;
                            padding-bottom: 24px;
                            border-bottom: 2px solid #e2e8f0;
                        }
                        .brand {
                            font-size: 12px;
                            font-weight: 700;
                            letter-spacing: 0.16em;
                            text-transform: uppercase;
                            color: #2563eb;
                            margin-bottom: 8px;
                        }
                        .title {
                            font-size: 28px;
                            line-height: 1.2;
                            font-weight: 700;
                            margin: 0 0 8px;
                        }
                        .sub {
                            color: #475569;
                            font-size: 14px;
                            line-height: 1.6;
                        }
                        .meta {
                            min-width: 220px;
                            background: #f8fafc;
                            border: 1px solid #e2e8f0;
                            border-radius: 12px;
                            padding: 16px 18px;
                        }
                        .meta-row {
                            display: flex;
                            justify-content: space-between;
                            gap: 16px;
                            font-size: 13px;
                            padding: 8px 0;
                            border-bottom: 1px solid #e2e8f0;
                        }
                        .meta-row:last-child { border-bottom: 0; }
                        .meta-label { color: #64748b; }
                        .meta-value { font-weight: 600; text-align: right; }
                        .section {
                            margin-top: 28px;
                        }
                        .section h2 {
                            margin: 0 0 14px;
                            font-size: 16px;
                            font-weight: 700;
                            color: #0f172a;
                        }
                        .grid {
                            border: 1px solid #e2e8f0;
                            border-radius: 12px;
                            overflow: hidden;
                        }
                        .row {
                            display: grid;
                            grid-template-columns: 220px 1fr;
                            gap: 18px;
                            padding: 12px 16px;
                            border-bottom: 1px solid #e2e8f0;
                            font-size: 14px;
                            align-items: start;
                        }
                        .row:last-child { border-bottom: 0; }
                        .label {
                            color: #64748b;
                            font-weight: 600;
                        }
                        .value {
                            color: #0f172a;
                            white-space: pre-wrap;
                            word-break: break-word;
                        }
                        @media print {
                            body {
                                background: #ffffff;
                                padding: 0;
                            }
                            .page {
                                max-width: none;
                                margin: 0;
                                border: 0;
                                border-radius: 0;
                                padding: 18px;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="page">
                        <div class="topbar">
                            <div>
                                <div class="brand">BookMyAssignment</div>
                                <h1 class="title">${escapeHtml(student.fullName || 'Order Details')}</h1>
                                <div class="sub">
                                    Order ID: ${escapeHtml(id)}<br />
                                    ${escapeHtml(student.email || 'No email')}<br />
                                    ${escapeHtml(student.phone || 'No contact number')}
                                </div>
                            </div>
                            <div class="meta">
                                <div class="meta-row">
                                    <span class="meta-label">Status</span>
                                    <span class="meta-value">${escapeHtml(student.status?.replace(/_/g, ' ') || '—')}</span>
                                </div>
                                <div class="meta-row">
                                    <span class="meta-label">Source</span>
                                    <span class="meta-value">${escapeHtml(sourceLabel.txt)}</span>
                                </div>
                                <div class="meta-row">
                                    <span class="meta-label">Created</span>
                                    <span class="meta-value">${escapeHtml(formatDate(student.createdAt))}</span>
                                </div>
                                <div class="meta-row">
                                    <span class="meta-label">Updated</span>
                                    <span class="meta-value">${escapeHtml(formatDate(student.updatedAt))}</span>
                                </div>
                            </div>
                        </div>

                        ${renderSection('Contact Information', contactRows)}
                        ${renderSection('Academic Details', academicRows)}
                        ${renderSection('Assignment Details', assignmentRows)}
                        ${renderSection('Record Information', recordRows)}
                        ${extraSection}
                    </div>
                    <script>
                        window.onload = function () {
                            setTimeout(function () {
                                window.print();
                            }, 250);
                        };
                    </script>
                </body>
                </html>
            `

            printWindow.document.open()
            printWindow.document.write(html)
            printWindow.document.close()

            toast({
                title: 'PDF ready',
                description: 'Print window opened. Choose Save as PDF to download and share.',
                variant: 'success',
            })
        } finally {
            setIsPreparingPdf(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full hover:bg-white/5">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-lg">
                            {student.fullName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">{student.fullName}</h1>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                                {student.enrollmentNo && <span className="font-mono">{student.enrollmentNo}</span>}
                                {student.enrollmentNo && <span>•</span>}
                                <span className={`font-medium whitespace-nowrap ${getStatusColor(student.status)}`}>{student.status.replace(/_/g, ' ')}</span>
                                <span>•</span>
                                <span className={`px-2 py-0.5 rounded text-xs border ${sourceLabel.cls}`}>{sourceLabel.txt}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Shiprocket button or tracking badge */}
                    {(() => {
                        if (!student) return null
                        const deliveryText = customFieldText(customFields, 'delivery type', 'delivery', 'copy type')
                        const reqLower = `${deliveryText} ${requirementText}`.toLowerCase()
                        const isHardCopy = hardCopyKeywords.some(kw => reqLower.includes(kw.toLowerCase()))
                        const awb = customFields?.shiprocketAwb
                        const srStatus = customFields?.shiprocketStatus
                        const srCourier = customFields?.shiprocketCourier

                        if (awb) {
                            return (
                                <a
                                    href={`https://shiprocket.co/tracking/${awb}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-medium hover:bg-orange-500/25 transition-colors"
                                >
                                    <Truck className="w-3.5 h-3.5" />
                                    <span>{srStatus || 'Shipped'}</span>
                                    {srCourier && <span className="opacity-70">· {srCourier}</span>}
                                    <span className="font-mono opacity-70">{awb}</span>
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            )
                        }

                        if (isHardCopy) {
                            return (
                                <Button
                                    className="gap-2 bg-orange-500 hover:bg-orange-600 text-white border-0 rounded-lg"
                                    onClick={() => setShowShiprocketModal(true)}
                                >
                                    <Truck className="w-4 h-4" />
                                    Ship on Shiprocket
                                </Button>
                            )
                        }
                        return null
                    })()}

                    <Link href={`/orders/${id}/edit`}>
                        <Button className="gap-2 gradient-primary">
                            <Edit className="w-4 h-4" />Edit Order
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={handleSavePdf}
                        disabled={isPreparingPdf}
                    >
                        <Download className="w-4 h-4" />
                        {isPreparingPdf ? 'Preparing PDF...' : 'Save PDF'}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* ── Left / main column ── */}
                <div className="md:col-span-2 space-y-6">

                    {/* Core contact */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="text-base font-semibold mb-5 flex items-center gap-2">
                            <User className="w-4 h-4 text-blue-400" />Contact Information
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <InfoRow label="Full Name" value={student.fullName} />
                            <InfoRow label="Email Id" value={
                                student.email
                                    ? <a href={`mailto:${student.email}`} className="text-blue-400 hover:underline">{student.email}</a>
                                    : '—'
                            } />
                            <InfoRow label="Contact Number" value={
                                student.phone
                                    ? <a href={`tel:${student.phone}`} className="text-blue-400 hover:underline">{student.phone}</a>
                                    : '—'
                            } />
                            <InfoRow label="Alternative Contact" value={
                                customFields['Alternative Contact Number']
                                || customFields['Alt Contact']
                                || student.alternateEmail
                                || '—'
                            } />
                            <InfoRow label="Postal Address" value={
                                customFields['Postal Address With Pincode']
                                || customFields['Postal Address']
                                || customFields['Address']
                                || [student.city, student.state].filter(Boolean).join(', ')
                                || '—'
                            } />
                        </div>
                    </div>

                    {/* Academic info */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="text-base font-semibold mb-5 flex items-center gap-2">
                            <GraduationCap className="w-4 h-4 text-purple-400" />Academic Details
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <InfoRow label="Program Name" value={
                                student.programme || student.course
                                || customFields['Program Name with Year']
                                || customFields['Programme']
                                || '—'
                            } />
                            <InfoRow label="Present Semester / Year" value={
                                customFields['Present Semester / Year']
                                || customFields['Present Semester']
                                || customFields['Semester']
                                || customFields['Year']
                                || '—'
                            } />
                            {student.enrollmentNo && <InfoRow label="Enrollment No" value={student.enrollmentNo} />}
                            {student.regionalCenter && <InfoRow label="Regional Center" value={student.regionalCenter} />}
                        </div>
                        {student.subjects && Array.isArray(student.subjects) && student.subjects.length > 0 && (
                            <div className="mt-5 pt-5 border-t border-white/10">
                                <label className="text-xs text-muted-foreground uppercase tracking-wider mb-3 block">Enrolled Subjects</label>
                                <div className="flex flex-wrap gap-2">
                                    {student.subjects.map((s: string, i: number) => (
                                        <span key={i} className="px-3 py-1 bg-blue-500/15 border border-blue-500/20 text-blue-300 rounded-lg text-sm font-mono">{s}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* All form responses — the raw customFields  */}
                    {extraFields.length > 0 && (
                        <div className="glass rounded-xl p-6">
                            <h3 className="text-base font-semibold mb-5 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-emerald-400" />Form Response Details
                            </h3>
                            <div className="divide-y divide-white/5">
                                {extraFields.map(([key, val]) => (
                                    <div key={key} className="py-3 grid grid-cols-2 gap-4 items-start">
                                        <span className="text-sm text-muted-foreground leading-relaxed">{key}</span>
                                        <div className="text-sm text-right"><FieldValue val={val} /></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Right sidebar ── */}
                <div className="space-y-6">
                    {/* Status & Source */}
                    <div className="glass rounded-xl p-6">
                        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                            <Info className="w-4 h-4 text-cyan-400" />Record Info
                        </h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-muted-foreground">Status</span>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(student.status)}`}>{student.status}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-muted-foreground">Source</span>
                                <Badge variant="outline" className={`text-xs border ${sourceLabel.cls}`}>{sourceLabel.txt}</Badge>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-muted-foreground">Added By</span>
                                <span>{student.createdBy?.fullName || 'System'}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-muted-foreground">Added On</span>
                                <span>{formatDate(student.createdAt)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-muted-foreground">Updated</span>
                                <span>{formatDate(student.updatedAt)}</span>
                            </div>
                            {canSeeDecidedPrice && (
                                <div className="flex justify-between items-center py-2 pt-3 mt-1 border-t border-white/10">
                                    <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                                        Decided Price
                                        <button 
                                            onClick={() => {
                                                setEditPriceValue(decidedPrice || '')
                                                setShowEditPrice(true)
                                            }}
                                            className="inline-flex text-muted-foreground hover:text-white transition-colors"
                                        >
                                            <Edit className="w-3.5 h-3.5" />
                                        </button>
                                    </span>
                                    <span className="font-semibold text-amber-400">
                                        {decidedPrice ? formatPrice(decidedPrice) : 'Not set'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick assignment info from custom fields */}
                    {(customFields['Require Assignments Subject Codes (Ex: ECO-01, BCS-011, etc.)'] ||
                      customFields['Total How Many Assignments (Ex: 4, 6, 8, 10, 14 etc.)'] ||
                      customFields['Assignment Language'] ||
                      requirementText ||
                      customFields['Describe Requirement'] ||
                      commission) && (
                        <div className="glass rounded-xl p-6">
                            <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-amber-400" />Assignment Details
                            </h3>
                            <div className="space-y-3 text-sm divide-y divide-white/5">
                                {[
                                    ['Requirement', requirementText],
                                    ['Subject Codes', customFields['Require Assignments Subject Codes (Ex: ECO-01, BCS-011, etc.)'] || customFields['Subject Codes']],
                                    ['Total Assignments', customFields['Total How Many Assignments (Ex: 4, 6, 8, 10, 14 etc.)']],
                                    ['Language', customFields['Assignment Language'] || customFields['Language']],
                                    ['Description', customFields['Describe Requirement'] || customFields['Description']],
                                    // Commission: visible to everyone (staff sees their payout)
                                    ...(commission ? [['Commission', formatPrice(commission)]] : []),
                                    ['Order / Payment Date', customFields['Order Date / Payment Date'] || customFields['Payment Date']],
                                ].filter(([, v]) => v).map(([label, val]) => (
                                    <div key={label as string} className="py-2.5">
                                        <span className="text-xs text-muted-foreground block mb-1">{label as string}</span>
                                        <span className={`font-medium text-sm break-words ${
                                            label === 'Commission' ? 'text-emerald-400' : ''
                                        }`}>{String(val)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Shiprocket Modal */}
            {showShiprocketModal && student && (
                <ShiprocketModal
                    orderId={id}
                    prefill={{
                        customerName: student.fullName || '',
                        customerPhone: student.phone || '',
                        shippingAddress:
                            customFields['Postal Address With Pincode']
                            || customFields['Postal Address']
                            || customFields['Address']
                            || student.address
                            || '',
                        shippingCity: student.city || '',
                        shippingState: student.state || '',
                        shippingPincode: student.pincode || '',
                        declaredValue:
                            customFields['Decided Price']
                            || customFields['decidedPrice']
                            || '',
                    }}
                    onClose={() => setShowShiprocketModal(false)}
                    onSuccess={() => {
                        setShowShiprocketModal(false)
                        queryClient.invalidateQueries({ queryKey: ['student', id] })
                    }}
                />
            )}

            {/* Edit Price Modal */}
            {showEditPrice && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={() => setShowEditPrice(false)}>
                    <div className="glass rounded-2xl p-6 max-w-sm w-full border border-amber-500/20" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4 text-emerald-500">Update Decided Price</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">Deal Price (₹)</label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    inputMode="decimal"
                                    value={editPriceValue}
                                    onChange={e => setEditPriceValue(e.target.value)}
                                    placeholder="Enter agreed price with customer"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <Button variant="ghost" onClick={() => setShowEditPrice(false)} disabled={updatePriceMutation.isPending}>Cancel</Button>
                                <Button className="gradient-primary" onClick={() => updatePriceMutation.mutate(editPriceValue)} disabled={updatePriceMutation.isPending}>
                                    {updatePriceMutation.isPending ? 'Saving...' : 'Save Price'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}

// ─── Small helper ─────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>
            <div className="font-medium text-sm">{value ?? <span className="text-muted-foreground italic">—</span>}</div>
        </div>
    )
}
