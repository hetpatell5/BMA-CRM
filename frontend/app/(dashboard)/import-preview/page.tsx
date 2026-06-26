'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
    Search, ChevronLeft, ChevronRight, Users, RefreshCw,
    ChevronDown, X, SlidersHorizontal, FolderOpen,
    ArrowUpCircle, Download, Tag, GraduationCap,
    CheckCircle2, AlertTriangle, Loader2, ExternalLink, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { studentsAPI, ignouAPI } from '@/lib/api'
import { formatNumber, debounce } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { io as socketIO } from 'socket.io-client'

// ─── Helpers ────────────────────────────────────────────────────────────────
// Columns that are unique per-row — never useful as filters
const NON_FILTERABLE_COLS = new Set([
    'control number', 'control no',
    'enrolment number', 'enrollment number', 'enrolment no', 'enrollment no',
    'name', 'full name', 'first name', 'last name', 'student name',
    'email', 'e-mail', 'email address', 'email id',
    'alternate email', 'alternate e-mail', 'alternate email address',
    'mobile', 'mobile number', 'mobile no', 'phone', 'phone number',
    'contact', 'contact number', 'contact no',
])

function isNonFilterableCol(key: string) {
    return NON_FILTERABLE_COLS.has(key.trim().toLowerCase())
}
const INTERNAL_KEYS = new Set([
    'requirementassignments', 'telecallerowners', 'orderidprefix',
    'orderidrequirement', 'orderidgenerated', 'orderidsignature',
    'columnorder',
])

function normalizeKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isInternalKey(key: string) {
    return key.startsWith('_') || INTERNAL_KEYS.has(normalizeKey(key))
}

function collectCustomFieldColumns(students: any[]): string[] {
    let columnOrder: string[] | null = null
    for (const s of students) {
        const order = s.customFields?._columnOrder
        if (Array.isArray(order) && order.length > 0) { columnOrder = order; break }
    }
    const allKeys = new Set<string>()
    students.forEach(s => {
        if (s.customFields && typeof s.customFields === 'object') {
            Object.keys(s.customFields).forEach(k => {
                if (k && k.trim() && !isInternalKey(k)) allKeys.add(k.trim())
            })
        }
    })
    if (columnOrder) {
        const ordered: string[] = []
        const remaining = new Set(allKeys)
        for (const h of columnOrder) {
            const t = h.trim()
            if (allKeys.has(t)) { ordered.push(t); remaining.delete(t) }
        }
        remaining.forEach(k => ordered.push(k))
        return ordered
    }
    return Array.from(allKeys)
}

function cellValue(val: any): string {
    if (val === null || val === undefined) return ''
    if (Array.isArray(val)) return val.map(cellValue).filter(Boolean).join(', ')
    if (typeof val === 'object') return ''
    return String(val).trim()
}

// Accent colours cycling for filter sections
const ACCENTS = [
    { check: 'accent-emerald-500', active: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { check: 'accent-amber-500',   active: 'bg-amber-50 dark:bg-amber-500/10' },
    { check: 'accent-violet-500',  active: 'bg-violet-50 dark:bg-violet-500/10' },
    { check: 'accent-cyan-500',    active: 'bg-cyan-50 dark:bg-cyan-500/10' },
    { check: 'accent-rose-500',    active: 'bg-rose-50 dark:bg-rose-500/10' },
    { check: 'accent-indigo-500',  active: 'bg-indigo-50 dark:bg-indigo-500/10' },
]

// ─── FilterColumn component: loads values lazily when section opens ────────

function FilterColumn({
    colKey, accentIdx, batchId, selectedVals, filterSearch, onToggle, openSections, toggleSection,
}: {
    colKey: string
    accentIdx: number
    batchId: string
    selectedVals: Set<string>
    filterSearch: string
    onToggle: (key: string, val: string) => void
    openSections: Record<string, boolean>
    toggleSection: (key: string) => void
}) {
    const sectionKey = `col_${colKey}`
    const isOpen = !!openSections[sectionKey]
    const accent = ACCENTS[accentIdx % ACCENTS.length]

    const { data: vals, isLoading } = useQuery({
        queryKey: ['import-field-values', colKey, batchId],
        queryFn: async () => (await studentsAPI.getImportFieldValues(colKey, batchId || undefined)).data.data as string[],
        enabled: isOpen, // only fetch when section is open
        staleTime: 5 * 60 * 1000,
    })

    const displayed = useMemo(() => {
        if (!vals) return []
        if (!filterSearch) return vals
        const q = filterSearch.toLowerCase()
        return vals.filter(v => v.toLowerCase().includes(q) || colKey.toLowerCase().includes(q))
    }, [vals, filterSearch, colKey])

    // Never fetched yet (section not opened) → show the header but no content
    // Fetched and got values → show list
    // Fetched and got 0 values → keep header visible, show a hint (DON'T hide)
    const hasBeenFetched = vals !== undefined

    return (
        <div>
            <button
                className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleSection(sectionKey)}
            >
                <span className="flex items-center gap-1.5 truncate min-w-0">
                    <Tag className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{colKey}</span>
                    {selectedVals.size > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                            {selectedVals.size}
                        </span>
                    )}
                </span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform shrink-0', isOpen && 'rotate-180')} />
            </button>

            {isOpen && (
                <div className="space-y-0.5 mb-3 max-h-48 overflow-y-auto">
                    {isLoading ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground text-center">Loading…</div>
                    ) : displayed.length === 0 && hasBeenFetched ? (
                        <div className="px-2 py-3 text-xs text-muted-foreground text-center italic">
                            Use Search above to find specific values
                        </div>
                    ) : (
                        displayed.map(val => (
                            <label
                                key={val}
                                className={cn(
                                    'flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors',
                                    selectedVals.has(val) ? accent.active : 'hover:bg-slate-100 dark:hover:bg-white/5'
                                )}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedVals.has(val)}
                                    onChange={() => onToggle(colKey, val)}
                                    className={cn('w-3.5 h-3.5 rounded border-slate-300 cursor-pointer shrink-0', accent.check)}
                                />
                                <span className="text-[13px] font-medium text-foreground truncate" title={val}>{val}</span>
                            </label>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportPreviewPage() {
    const searchParams = useSearchParams()
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { user: currentUser } = useAuthStore()

    const isAdminManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'

    // ── State ──────────────────────────────────────────────────────────────
    const [search, setSearch]         = useState(searchParams.get('search') || '')
    const [debouncedSearch, setDebouncedSearch] = useState(search)
    const [page, setPage]             = useState(1)
    const [pageInput, setPageInput]   = useState('1')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [showFilters, setShowFilters] = useState(false)
    const [importBatchId, setImportBatchId] = useState(searchParams.get('importBatchId') || '')
    // { "Regional Center": new Set(["Mumbai","Delhi"]), ... }
    const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({})
    const [filterSearch, setFilterSearch] = useState('')
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({ imports: true })

    // ── IGNOU state ────────────────────────────────────────────────────────
    const [ignouProgress, setIgnouProgress] = useState<{ done: number; total: number; percent: number } | null>(null)
    const [ignouChecking, setIgnouChecking] = useState(false)
    const [ignouModal, setIgnouModal]       = useState<any | null>(null) // open student drill-down
    const [checkedStudentIds, setCheckedStudentIds] = useState<string[]>([])

    const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

    // ── Socket.IO for IGNOU real-time progress ─────────────────────────────
    useEffect(() => {
        const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5000'
        const socket = socketIO(apiBase, { transports: ['websocket', 'polling'] })
        socket.on('ignou:progress', (data: { done: number; total: number; percent: number }) => {
            setIgnouProgress(data)
            if (data.done >= data.total && data.total > 0) {
                setIgnouChecking(false)
                // Refresh IGNOU results after completion
                queryClient.invalidateQueries({ queryKey: ['ignou-results'] })
                queryClient.invalidateQueries({ queryKey: ['ignou-selected-results'] })
            }
        })
        return () => { socket.disconnect() }
    }, [])

    // Debounce search input → reset to page 1 on change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedSet = useCallback(debounce((v: string) => { setDebouncedSearch(v); setPage(1); setPageInput('1') }, 400), [])
    useEffect(() => { debouncedSet(search) }, [search, debouncedSet])

    // ── Build server params ────────────────────────────────────────────────
    const serverParams = useMemo(() => {
        const p: Record<string, any> = {
            page: String(page),
            limit: '50',
            source: 'excel_import',
        }
        if (debouncedSearch) p.search = debouncedSearch
        if (importBatchId)   p.importBatchId = importBatchId

        // Pass as a NESTED object so axios serializes correctly:
        // { customField: { 'Regional Center': 'Mumbai,Delhi' } }
        // → ?customField[Regional%20Center]=Mumbai%2CDelhi
        // Express/qs then parses req.query.customField = { 'Regional Center': 'Mumbai,Delhi' }
        const cfParams: Record<string, string> = {}
        for (const [k, vals] of Object.entries(activeFilters)) {
            if (vals.size > 0) cfParams[k] = Array.from(vals).join(',')
        }
        if (Object.keys(cfParams).length > 0) p.customField = cfParams

        return p
    }, [page, debouncedSearch, importBatchId, activeFilters])

    // ── Main data query (server-side pagination) ───────────────────────────
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['import-preview', serverParams],
        queryFn: async () => {
            const res = await studentsAPI.getAll(serverParams)
            return res.data.data
        },
    })

    // ── Filter options (import batches etc.) ───────────────────────────────
    const { data: filterOptions } = useQuery({
        queryKey: ['student-filters'],
        queryFn: async () => (await studentsAPI.getFilters()).data.data,
    })

    // ── IGNOU results — batch mode ────────────────────────────────────────────
    const { data: ignouData } = useQuery({
        queryKey: ['ignou-results', importBatchId],
        queryFn: async () => {
            if (!importBatchId) return null
            const r = await ignouAPI.results(importBatchId, { limit: 1000 })
            return r.data.data
        },
        enabled: !!importBatchId,
        refetchInterval: ignouChecking && !!importBatchId ? 5000 : false,
    })

    // ── IGNOU results — selected-rows mode ───────────────────────────────────
    const { data: ignouSelectedData } = useQuery({
        queryKey: ['ignou-selected-results', checkedStudentIds],
        queryFn: async () => {
            if (checkedStudentIds.length === 0) return null
            const r = await ignouAPI.resultsByStudents(checkedStudentIds)
            return r.data.data
        },
        enabled: checkedStudentIds.length > 0,
        refetchInterval: ignouChecking && checkedStudentIds.length > 0 && !importBatchId ? 3000 : false,
    })

    // Build a lookup: studentId → ignouCheck record (merges both modes)
    const ignouMap = useMemo(() => {
        const map: Record<string, any> = {}
        if (ignouData?.records) {
            ignouData.records.forEach((r: any) => { map[String(r.studentId)] = r })
        }
        if (ignouSelectedData?.records) {
            ignouSelectedData.records.forEach((r: any) => { map[String(r.studentId)] = r })
        }
        return map
    }, [ignouData, ignouSelectedData])

    // ── Derived ────────────────────────────────────────────────────────────
    const students: any[]   = data?.students || []
    const pagination        = data?.pagination || { page: 1, totalPages: 1, total: 0 }
    const customFieldCols   = collectCustomFieldColumns(students)

    // Columns eligible for adaptive filtering: from _columnOrder, minus known unique-per-row identity columns
    const filterableCols = useMemo(() => {
        let cols: string[] = customFieldCols
        for (const s of students) {
            const order = s.customFields?._columnOrder
            if (Array.isArray(order) && order.length > 0) { cols = order as string[]; break }
        }
        // Strip out identity columns that are useless as filters (always unique per row)
        return cols.filter(col => !isNonFilterableCol(col))
    }, [students, customFieldCols])

    const activeFilterCount =
        (importBatchId ? 1 : 0) +
        Object.values(activeFilters).reduce((n, s) => n + s.size, 0)

    // Reset page when filters/batch change
    useEffect(() => { setPage(1); setPageInput('1') }, [importBatchId, activeFilters])

    // Toggle a value in a multi-select filter
    const toggleFilterValue = (colKey: string, value: string) => {
        setActiveFilters(prev => {
            const next = { ...prev }
            const cur = new Set(next[colKey] || [])
            if (cur.has(value)) cur.delete(value); else cur.add(value)
            if (cur.size === 0) delete next[colKey]; else next[colKey] = cur
            return next
        })
    }

    const clearAllFilters = () => { setImportBatchId(''); setActiveFilters({}) }

    // ── Selection ──────────────────────────────────────────────────────────
    const handleSelectAll = () =>
        setSelectedIds(selectedIds.length === students.length ? [] : students.map((s: any) => String(s.id)))
    const handleSelect = (id: string) =>
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])

    // ── Promote mutations ──────────────────────────────────────────────────
    const promoteRowMutation = useMutation({
        mutationFn: (id: string | number) => studentsAPI.promoteImportedRow(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['import-preview'] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setSelectedIds(prev => prev.filter(sid => sid !== String(promoteRowMutation.variables)))
            toast({ title: 'Promoted!', description: 'Record moved to active Orders.', variant: 'success' })
        },
        onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || 'Failed.', variant: 'destructive' }),
    })

    const promoteSelectionMutation = useMutation({
        mutationFn: async (ids: string[]) => { for (const id of ids) await studentsAPI.promoteImportedRow(id) },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['import-preview'] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setSelectedIds([])
            toast({ title: 'Promoted!', description: 'Selected records moved to active Orders.', variant: 'success' })
        },
        onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || 'Failed.', variant: 'destructive' }),
    })

    const promoteBatchMutation = useMutation({
        mutationFn: (batchId: string) => studentsAPI.promoteImportBatch(batchId),
        onSuccess: (res: any) => {
            queryClient.invalidateQueries({ queryKey: ['import-preview'] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            toast({ title: 'Batch Promoted!', description: res?.data?.message || 'All records moved to Orders.', variant: 'success' })
        },
        onError: (err: any) => toast({ title: 'Error', description: err?.response?.data?.message || 'Failed.', variant: 'destructive' }),
    })

    // ── Export (CSV) ─────────────────────────────────────────────────────────
    const [isExporting, setIsExporting] = useState(false)
    const handleExport = () => {
        try {
            const p: Record<string, any> = { source: 'excel_import' }
            if (importBatchId)   p.importBatchId = importBatchId
            if (debouncedSearch) p.search = debouncedSearch
            const cfParams: Record<string, string> = {}
            for (const [k, vals] of Object.entries(activeFilters)) {
                if (vals.size > 0) cfParams[k] = Array.from(vals).join(',')
            }
            if (Object.keys(cfParams).length > 0) p.customField = cfParams
            const url = studentsAPI.getExportUrl(p)
            const link = document.createElement('a')
            link.href = url
            link.download = `export_${new Date().toISOString().split('T')[0]}.csv`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            toast({ title: 'Export Started', description: 'Your file will download shortly.' })
        } catch {
            toast({ title: 'Export Failed', description: 'Could not start export.', variant: 'destructive' })
        }
    }

    // ── IGNOU Export (Excel with IGNOU columns appended) ──────────────────
    const handleIgnouExport = (onlyPending = false) => {
        if (!importBatchId) {
            toast({ title: 'Select a batch first', description: 'Use the filter sidebar to select an import batch.', variant: 'destructive' })
            return
        }
        const url = ignouAPI.getExportUrl(importBatchId, onlyPending)
        const link = document.createElement('a')
        link.href = url
        link.download = `ignou_status_${importBatchId}_${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast({ title: 'IGNOU Export Started', description: 'Your Excel file with IGNOU status will download shortly.' })
    }

    // ── IGNOU check trigger — supports BOTH batch mode and selected-rows mode ──
    const handleIgnouCheck = async () => {
        // Selected rows ALWAYS take priority — never let a batch override explicit selections.
        const useSelected = selectedIds.length > 0
        const useBatch    = !useSelected && !!importBatchId

        if (!useSelected && !useBatch) {
            toast({ title: 'Nothing to check', description: 'Either select rows with checkboxes OR pick a batch from the filter sidebar.', variant: 'destructive' })
            return
        }
        try {
            setIgnouChecking(true)
            setIgnouProgress(null)

            if (useSelected) {
                // Check only the selected rows
                const r = await ignouAPI.checkStudents(selectedIds)
                const { queued, missing } = r.data.data
                if (queued === 0) {
                    setIgnouChecking(false)
                    toast({ title: 'Nothing queued', description: missing > 0 ? `${missing} selected student(s) are missing enrollment/programme data.` : 'All selected students already checked.' })
                } else {
                    setCheckedStudentIds(selectedIds) // store so results query can show statuses
                    setIgnouProgress({ done: 0, total: queued, percent: 0 })
                    toast({ title: `IGNOU Check Started`, description: `${queued} selected student(s) queued. Progress will update in real-time.` })
                }
            } else {
                // Check entire batch
                const r = await ignouAPI.checkBatch(importBatchId)
                const { queued, skipped } = r.data.data
                if (queued === 0) {
                    setIgnouChecking(false)
                    toast({ title: 'Nothing to check', description: skipped > 0 ? `All ${skipped} students already checked.` : 'No students with enrollment + programme found in this batch.' })
                } else {
                    setIgnouProgress({ done: 0, total: queued, percent: 0 })
                    toast({ title: `IGNOU Batch Check Started`, description: `${queued} students queued. Progress updates in real-time.` })
                }
            }
        } catch (err: any) {
            setIgnouChecking(false)
            toast({ title: 'Error', description: err?.response?.data?.message || 'Failed to start IGNOU check.', variant: 'destructive' })
        }
    }

    // ── Access Gate ────────────────────────────────────────────────────────
    if (currentUser && !isAdminManager) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
                <Users className="w-16 h-16 text-muted-foreground/40" />
                <h2 className="text-xl font-semibold">Access Restricted</h2>
                <p className="text-muted-foreground max-w-sm">Import Preview is only available to Admins and Managers.</p>
                <Link href="/orders"><Button variant="outline">Go to Orders</Button></Link>
            </div>
        )
    }

    // ── Render ─────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6 animate-fade-in">
            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Import Preview</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        Review imported records. Promote individual rows or entire batches to active Orders.
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className="gap-2">
                        {isExporting
                            ? <><RefreshCw className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Exporting…</span></>
                            : <><Download className="w-4 h-4" /><span className="hidden sm:inline">Export CSV</span></>}
                    </Button>
                    {selectedIds.length > 0 && (
                        <Button
                            size="sm"
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => { if (window.confirm(`Promote ${selectedIds.length} selected record(s)?`)) promoteSelectionMutation.mutate(selectedIds) }}
                            disabled={promoteSelectionMutation.isPending}
                        >
                            {promoteSelectionMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
                            Promote Selection ({selectedIds.length})
                        </Button>
                    )}
                    {importBatchId && (
                        <Button
                            size="sm"
                            className="gap-2 gradient-primary text-white"
                            onClick={() => { if (window.confirm('Promote ALL un-promoted records in this batch?')) promoteBatchMutation.mutate(importBatchId) }}
                            disabled={promoteBatchMutation.isPending}
                        >
                            {promoteBatchMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
                            <span className="hidden sm:inline">Promote Entire Batch</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* ── IGNOU Assignment Status Checker Toolbar ── */}
            <div className="rounded-xl border border-border bg-gradient-to-r from-indigo-500/5 via-violet-500/5 to-purple-500/5 dark:from-indigo-500/10 dark:via-violet-500/10 dark:to-purple-500/10 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                            <GraduationCap className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm text-foreground">IGNOU Assignment Status Checker</p>
                            <p className="text-xs text-muted-foreground">
                                {selectedIds.length > 0
                                    ? `${selectedIds.length} row(s) ticked — will check only these (batch ignored)`
                                    : importBatchId
                                        ? 'Will check all students in selected batch · tick rows to narrow to specific students'
                                        : 'Tick rows with checkboxes, or pick a batch from the filter sidebar'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <Button
                            size="sm"
                            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white h-9"
                            onClick={handleIgnouCheck}
                            disabled={ignouChecking || (!importBatchId && selectedIds.length === 0)}
                        >
                            {ignouChecking
                                ? <><Loader2 className="w-4 h-4 animate-spin" />Checking…</>
                                : selectedIds.length > 0
                                    ? <><GraduationCap className="w-4 h-4" />Check {selectedIds.length} Selected</>
                                    : <><GraduationCap className="w-4 h-4" />Check IGNOU {importBatchId ? 'Batch' : 'Status'}</>}
                        </Button>
                        {importBatchId && (
                            <>
                                <Button size="sm" variant="outline" className="gap-2 h-9 border-indigo-500/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10" onClick={() => handleIgnouExport(false)}>
                                    <Download className="w-4 h-4" />Export with IGNOU
                                </Button>
                                <Button size="sm" variant="outline" className="gap-2 h-9 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10" onClick={() => handleIgnouExport(true)}>
                                    <AlertTriangle className="w-4 h-4" />Pending Only
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Stats row */}
                {ignouData?.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Checked',    value: ignouData.summary.done,                   color: 'text-emerald-600 dark:text-emerald-400' },
                            { label: 'Pending Assignments', value: ignouData.summary.totalPendingAssignments, color: 'text-amber-600 dark:text-amber-400' },
                            { label: 'Errors',     value: ignouData.summary.errors,                  color: 'text-red-600 dark:text-red-400' },
                            { label: 'Not Checked',value: ignouData.summary.notChecked,              color: 'text-muted-foreground' },
                        ].map(s => (
                            <div key={s.label} className="bg-background/60 rounded-lg px-3 py-2 border border-border/60">
                                <p className={cn('text-xl font-bold tabular-nums', s.color)}>{formatNumber(s.value ?? 0)}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Progress bar */}
                {ignouProgress && ignouProgress.total > 0 && (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <Loader2 className={cn('w-3 h-3', ignouChecking && 'animate-spin')} />
                                {ignouProgress.done} / {ignouProgress.total} students checked
                            </span>
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{ignouProgress.percent}%</span>
                        </div>
                        <div className="h-2 bg-border rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
                                style={{ width: `${ignouProgress.percent}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Search & Filter Bar ── */}
            <div className="border border-border rounded-xl p-3 flex flex-col sm:flex-row gap-3 flex-wrap">
                <Button
                    variant={showFilters ? 'secondary' : 'outline'}
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2 h-9 relative shrink-0"
                    size="sm"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-primary text-[10px] text-white font-bold flex items-center justify-center">
                            {activeFilterCount}
                        </span>
                    )}
                </Button>

                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search any column value…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    {search && (
                        <button onClick={() => { setSearch(''); setDebouncedSearch('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Active filter chips */}
                {Object.entries(activeFilters).flatMap(([col, vals]) =>
                    Array.from(vals).map(val => (
                        <span
                            key={`${col}:${val}`}
                            className="inline-flex items-center gap-1 px-2 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20 shrink-0 max-w-[200px]"
                        >
                            <span className="truncate">{col}: {val}</span>
                            <button onClick={() => toggleFilterValue(col, val)} className="shrink-0 hover:opacity-70 ml-0.5">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))
                )}

                <div className="flex items-center shrink-0">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {isLoading ? '…' : `${formatNumber(pagination.total)} record${pagination.total !== 1 ? 's' : ''}`}
                    </span>
                </div>
            </div>

            {/* ── Bulk action bar ── */}
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in">
                    <span className="text-sm font-medium text-primary">{selectedIds.length} selected</span>
                    <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                        onClick={() => { if (window.confirm(`Promote ${selectedIds.length} selected record(s)?`)) promoteSelectionMutation.mutate(selectedIds) }}
                        disabled={promoteSelectionMutation.isPending}
                    >
                        {promoteSelectionMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowUpCircle className="w-3.5 h-3.5" />}
                        Promote Selected
                    </Button>
                    <button onClick={() => setSelectedIds([])} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-auto">
                        Clear selection
                    </button>
                </div>
            )}


            {/* ── Layout: Filter Sidebar LEFT + Table RIGHT ── */}
            <div className={cn('grid gap-6 transition-all duration-300 items-start', showFilters ? 'grid-cols-1 xl:grid-cols-[280px_1fr]' : 'grid-cols-1')}>

                {/* ── Filter Sidebar — FIRST in DOM = LEFT column ── */}
                {showFilters && (
                    <div className="sticky top-6 self-start rounded-xl border border-border bg-background shadow-lg overflow-hidden h-[calc(100vh-200px)] flex flex-col animate-fade-in">
                        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4 text-primary" />
                                Filter Records
                            </h3>
                            <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-4 py-3 border-b border-border shrink-0">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input
                                    placeholder="Search filter values..."
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    className="w-full h-8 pl-8 pr-3 rounded-lg text-sm bg-slate-100 dark:bg-white/5 border border-transparent focus:border-primary/40 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>

                        {/* ── Active Filters Summary — pinned at top ── */}
                        {activeFilterCount > 0 && (
                            <div className="px-3 py-2.5 border-b border-border bg-primary/5 shrink-0">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1.5">
                                    Active ({activeFilterCount})
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {importBatchId && (
                                        <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[11px] font-medium border border-blue-200 dark:border-blue-500/30">
                                            <FolderOpen className="w-2.5 h-2.5 shrink-0" />
                                            <span className="truncate max-w-[130px]">
                                                {filterOptions?.importBatches?.find((b: any) => b.id === importBatchId)?.fileName?.split('.')[0] || 'Batch'}
                                            </span>
                                            <button onClick={() => setImportBatchId('')} className="hover:opacity-70 shrink-0"><X className="w-2.5 h-2.5" /></button>
                                        </span>
                                    )}
                                    {Object.entries(activeFilters).flatMap(([col, vals]) =>
                                        Array.from(vals).map(val => (
                                            <span key={`${col}:${val}`} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium border border-primary/20">
                                                <span className="truncate max-w-[120px]" title={`${col}: ${val}`}>{val}</span>
                                                <button onClick={() => toggleFilterValue(col, val)} className="hover:opacity-70 shrink-0"><X className="w-2.5 h-2.5" /></button>
                                            </span>
                                        ))
                                    )}
                                    <button onClick={clearAllFilters} className="text-[10px] text-red-500 hover:text-red-600 font-medium underline underline-offset-1 ml-0.5">
                                        Clear all
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">
                            {/* Import Batches */}
                            {filterOptions?.importBatches?.length > 0 && (
                                <div>
                                    <button
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => toggleSection('imports')}
                                    >
                                        <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" />Imported Files</span>
                                        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', openSections.imports && 'rotate-180')} />
                                    </button>
                                    {openSections.imports && (
                                        <div className="space-y-0.5 mb-3">
                                            {filterOptions.importBatches
                                                .filter((b: any) => !filterSearch || b.fileName.toLowerCase().includes(filterSearch.toLowerCase()))
                                                .map((batch: any) => (
                                                    <label key={batch.id} className={cn('flex items-start gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors', importBatchId === batch.id ? 'bg-blue-50 dark:bg-blue-500/10' : 'hover:bg-slate-100 dark:hover:bg-white/5')}>
                                                        <input
                                                            type="checkbox"
                                                            checked={importBatchId === batch.id}
                                                            onChange={() => setImportBatchId(prev => prev === batch.id ? '' : batch.id)}
                                                            className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 accent-blue-500 cursor-pointer shrink-0"
                                                        />
                                                        <div className="min-w-0">
                                                            <p className="text-[13px] font-medium leading-tight truncate text-foreground">{batch.fileName}</p>
                                                            <p className="text-[11px] text-muted-foreground mt-0.5">{batch.importedCount} records</p>
                                                        </div>
                                                    </label>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Adaptive column filters — lazy loaded */}
                            {filterableCols.map((colKey, idx) => (
                                <FilterColumn
                                    key={colKey}
                                    colKey={colKey}
                                    accentIdx={idx}
                                    batchId={importBatchId}
                                    selectedVals={activeFilters[colKey] || new Set()}
                                    filterSearch={filterSearch}
                                    onToggle={toggleFilterValue}
                                    openSections={openSections}
                                    toggleSection={toggleSection}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-background rounded-xl overflow-hidden min-w-0 border border-border shadow-sm flex flex-col">
                    <div className="overflow-auto scrollbar-thin max-h-[calc(100vh-320px)]">
                        <table className="w-full border-collapse text-sm">
                            <thead className="sticky top-0 z-10 shadow-sm">
                                <tr className="border-b border-border bg-slate-50 dark:bg-slate-800">
                                    <th className="p-2 text-left w-10 border-r border-border bg-slate-100 dark:bg-slate-800">
                                        <input
                                            type="checkbox"
                                            checked={students.length > 0 && selectedIds.length === students.length}
                                            onChange={handleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 dark:border-white/20"
                                        />
                                    </th>
                                    {customFieldCols.map(key => (
                                        <th key={key} className="p-2 text-left font-bold text-slate-500 dark:text-slate-200 border-r border-border whitespace-nowrap bg-slate-100 dark:bg-slate-800">
                                            {key}
                                        </th>
                                    ))}
                                    <th className="p-2 text-left font-bold text-slate-500 dark:text-slate-200 border-r border-border whitespace-nowrap bg-indigo-50 dark:bg-indigo-900/30">
                                        <span className="flex items-center gap-1.5">
                                            <GraduationCap className="w-3.5 h-3.5 text-indigo-500" />
                                            IGNOU Status
                                        </span>
                                    </th>
                                    <th className="p-2 text-left font-bold text-slate-500 dark:text-slate-200 border-l border-border whitespace-nowrap bg-slate-100 dark:bg-slate-800 sticky right-0 z-20 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {isLoading ? (
                                    Array(10).fill(0).map((_, i) => (
                                        <tr key={i} className="border-b border-border">
                                            <td className="p-3"><Skeleton className="h-4 w-4" /></td>
                                            {Array(8).fill(0).map((__, j) => <td key={j} className="p-3"><Skeleton className="h-4 w-24" /></td>)}
                                            <td className="p-3 sticky right-0 bg-background"><Skeleton className="h-7 w-28" /></td>
                                        </tr>
                                    ))
                                ) : students.length === 0 ? (
                                    <tr>
                                        <td colSpan={1 + customFieldCols.length + 1} className="p-16 text-center">
                                            <Users className="w-14 h-14 mx-auto mb-4 text-muted-foreground/40" />
                                            <p className="text-lg font-medium mb-1">No imported records found</p>
                                            <p className="text-muted-foreground text-sm mb-4">
                                                {debouncedSearch || activeFilterCount > 0
                                                    ? 'Try adjusting your search or filters'
                                                    : 'Import an Excel file to see records here'}
                                            </p>
                                            {!debouncedSearch && activeFilterCount === 0 && (
                                                <Link href="/import"><Button variant="outline">Import Data</Button></Link>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    students.map((student: any) => {
                                        const cf = student.customFields || {}
                                        const id = String(student.id)
                                        const isSelected = selectedIds.includes(id)
                                        const isPromoting = promoteRowMutation.isPending && promoteRowMutation.variables === student.id
                                        const ignouCheck = ignouMap[id]
                                        return (
                                            <tr key={id} className={cn('border-b border-border transition-colors group/row', isSelected ? 'bg-primary/5' : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.02]')}>
                                                <td className="p-2 border-r border-border">
                                                    <input type="checkbox" checked={isSelected} onChange={() => handleSelect(id)} className="w-4 h-4 rounded border-slate-300 dark:border-white/20 cursor-pointer" />
                                                </td>
                                                {customFieldCols.map(key => (
                                                    <td key={key} className="p-2 border-r border-border text-[13px] max-w-[200px]">
                                                        <span className="block truncate" title={cellValue(cf[key])}>
                                                            {cellValue(cf[key]) || <span className="text-muted-foreground">—</span>}
                                                        </span>
                                                    </td>
                                                ))}
                                                {/* IGNOU Status cell */}
                                                <td className="p-2 border-r border-border text-[13px] min-w-[130px]">
                                                    {!ignouCheck ? (
                                                        <span className="text-[11px] text-muted-foreground">—</span>
                                                    ) : ignouCheck.checkStatus === 'RUNNING' || ignouCheck.checkStatus === 'PENDING' ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] text-indigo-500">
                                                            <Loader2 className="w-3 h-3 animate-spin" />Checking…
                                                        </span>
                                                    ) : ignouCheck.checkStatus === 'ERROR' ? (
                                                        <span className="inline-flex items-center gap-1 text-[11px] text-red-500" title={ignouCheck.errorMessage}>
                                                            <XCircle className="w-3 h-3" />Error
                                                        </span>
                                                    ) : ignouCheck.pendingCount > 0 ? (
                                                        <button
                                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                                                            onClick={() => setIgnouModal(ignouCheck)}
                                                        >
                                                            <AlertTriangle className="w-3 h-3" />{ignouCheck.pendingCount} Pending
                                                        </button>
                                                    ) : ignouCheck.totalItems > 0 ? (
                                                        <button
                                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                                                            onClick={() => setIgnouModal(ignouCheck)}
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />All Clear
                                                        </button>
                                                    ) : (
                                                        /* IGNOU returned an empty table — no assignment records on IGNOU portal */
                                                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="IGNOU portal returned no assignment records for this student">
                                                            <XCircle className="w-3 h-3 text-slate-400" />No Data
                                                        </span>
                                                    )}

                                                </td>
                                                <td className="p-2 border-l border-border sticky right-0 bg-background group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-900/80 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]" onClick={e => e.stopPropagation()}>
                                                    <Button
                                                        variant="outline" size="sm"
                                                        className="h-8 text-[11px] font-bold uppercase tracking-wider text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 whitespace-nowrap gap-1.5"
                                                        onClick={() => { if (window.confirm('Promote this record to active Orders?')) promoteRowMutation.mutate(student.id) }}
                                                        disabled={isPromoting || promoteSelectionMutation.isPending}
                                                    >
                                                        {isPromoting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ArrowUpCircle className="w-3 h-3" />}
                                                        Promote
                                                    </Button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Pagination — always visible so count shows even on single page ── */}
                    {pagination.total > 0 && (
                        <div className="p-4 border-t border-border flex items-center justify-between">
                            <p className="text-sm text-muted-foreground hidden sm:block">
                                Showing {((page - 1) * 50) + 1}–{Math.min(page * 50, pagination.total)} of {formatNumber(pagination.total)}
                            </p>
                            {pagination.totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { const n = page - 1; setPage(n); setPageInput(String(n)) }}>
                                        <ChevronLeft className="w-4 h-4" />Prev
                                    </Button>
                                    <div className="flex items-center gap-2 px-2">
                                        <span className="text-sm text-muted-foreground hidden sm:inline">Page</span>
                                        <input
                                            type="text" value={pageInput}
                                            onChange={e => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                                            onBlur={() => { const v = parseInt(pageInput); if (v >= 1 && v <= pagination.totalPages) { setPage(v); setPageInput(String(v)) } else setPageInput(String(page)) }}
                                            onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt(pageInput); if (v >= 1 && v <= pagination.totalPages) { setPage(v); setPageInput(String(v)) } else setPageInput(String(page)) } }}
                                            className="w-12 px-2 py-1 text-sm text-center bg-white/5 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        />
                                        <span className="text-sm text-muted-foreground">of {pagination.totalPages}</span>
                                    </div>
                                    <Button variant="outline" size="sm" disabled={page === pagination.totalPages} onClick={() => { const n = page + 1; setPage(n); setPageInput(String(n)) }}>
                                        Next<ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── IGNOU Drill-down Modal ── */}
            {ignouModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setIgnouModal(null)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div className="relative bg-background rounded-2xl border border-border shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-border">
                            <div>
                                <h3 className="font-bold text-base flex items-center gap-2">
                                    <GraduationCap className="w-5 h-5 text-indigo-500" />
                                    {ignouModal.studentName}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                    {ignouModal.enrollmentNo} · {ignouModal.programme}
                                    {' · '}
                                    <a
                                        href={`https://isms.ignou.ac.in/changeadmdata/StatusAssignment.asp?submit=1&enrno=${ignouModal.enrollmentNo}&program=${ignouModal.programme}`}
                                        target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-0.5 text-indigo-500 hover:underline text-xs"
                                    >
                                        View on IGNOU <ExternalLink className="w-3 h-3" />
                                    </a>
                                </p>
                            </div>
                            <button onClick={() => setIgnouModal(null)} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-accent transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Summary pills */}
                        <div className="flex items-center gap-3 px-5 py-3 bg-slate-50/50 dark:bg-white/5 border-b border-border">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-xs font-semibold">
                                Total: {ignouModal.totalItems}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {ignouModal.submittedCount} Submitted
                            </span>
                            {ignouModal.pendingCount > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                                    <AlertTriangle className="w-3.5 h-3.5" /> {ignouModal.pendingCount} Pending
                                </span>
                            )}
                            {ignouModal.checkedAt && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                    Checked {new Date(ignouModal.checkedAt).toLocaleDateString('en-IN')}
                                </span>
                            )}
                        </div>

                        {/* Assignment rows table */}
                        <div className="overflow-auto flex-1 p-1">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800 text-left">
                                        {['Type', 'Course', 'Session', 'Status', 'Date'].map(h => (
                                            <th key={h} className="px-3 py-2 font-semibold text-xs text-muted-foreground border-b border-border">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {(ignouModal.assignmentRows || []).map((row: any, i: number) => (
                                        <tr key={i} className={cn('transition-colors', row.isPending ? 'bg-amber-50/60 dark:bg-amber-900/10' : '')}>
                                            <td className="px-3 py-2 text-xs font-medium">{row.type}</td>
                                            <td className="px-3 py-2 text-xs font-mono font-semibold">{row.course}</td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">{row.session}</td>
                                            <td className="px-3 py-2 text-xs">{row.status || <span className="text-amber-500 font-semibold">Not Submitted</span>}</td>
                                            <td className="px-3 py-2 text-xs">
                                                {row.date
                                                    ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">{row.date}</span>
                                                    : <span className="text-amber-500 font-semibold">⚠ Pending</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {(!ignouModal.assignmentRows || ignouModal.assignmentRows.length === 0) && (
                                        <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">No assignment data found for this student</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
