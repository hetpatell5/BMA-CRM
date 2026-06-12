'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import {
    Search, ChevronLeft, ChevronRight, Users, RefreshCw,
    ChevronDown, X, SlidersHorizontal, FolderOpen,
    ArrowUpCircle, Download, Tag,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { studentsAPI } from '@/lib/api'
import { formatNumber, getStatusColor, debounce } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import { cn } from '@/lib/utils'

// ─── Helpers ────────────────────────────────────────────────────────────────

const INTERNAL_KEYS = new Set([
    'requirementassignments', 'telecallerowners', 'orderidprefix',
    'orderidrequirement', 'orderidgenerated', 'orderidsignature',
    'columnorder', // _columnOrder is a meta field storing the original sheet header order
])

function normalizeKey(key: string) {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isInternalKey(key: string) {
    return key.startsWith('_') || INTERNAL_KEYS.has(normalizeKey(key))
}

/** Collect all visible custom-field column keys from a list of student records,
 *  using the stored _columnOrder to preserve the exact original Excel sheet order. */
function collectCustomFieldColumns(students: any[]): string[] {
    let columnOrder: string[] | null = null
    for (const s of students) {
        const order = s.customFields?._columnOrder
        if (Array.isArray(order) && order.length > 0) {
            columnOrder = order as string[]
            break
        }
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
        for (const header of columnOrder) {
            const trimmed = header.trim()
            if (allKeys.has(trimmed)) {
                ordered.push(trimmed)
                remaining.delete(trimmed)
            }
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

/**
 * For each column in the data, detect if it's "filterable" (low cardinality — ≤ 50 unique values,
 * more than 1 unique value). Skip columns where every row has a unique value (like IDs or names).
 */
function detectFilterableColumns(
    students: any[],
    columns: string[]
): { key: string; values: string[] }[] {
    const MAX_UNIQUE = 50

    return columns
        .map(key => {
            const seen = new Set<string>()
            for (const s of students) {
                const v = cellValue(s.customFields?.[key])
                if (v) seen.add(v)
                if (seen.size > MAX_UNIQUE) break
            }
            return { key, values: Array.from(seen).sort((a, b) => a.localeCompare(b)) }
        })
        .filter(f => f.values.length >= 2 && f.values.length <= MAX_UNIQUE)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportPreviewPage() {
    const searchParams = useSearchParams()
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { user: currentUser } = useAuthStore()

    const isAdminManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'

    // ── State ──────────────────────────────────────────────────────────────
    const [search, setSearch] = useState(searchParams.get('search') || '')
    const [page, setPage] = useState(1)
    const [pageInput, setPageInput] = useState('1')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [showFilters, setShowFilters] = useState(false)

    // importBatchId is the only server-side filter (all other filters are client-side)
    const [importBatchId, setImportBatchId] = useState(searchParams.get('importBatchId') || '')

    // Client-side multi-select adaptive filters: { "Regional Center": ["Mumbai", "Delhi"], ... }
    const [activeFilters, setActiveFilters] = useState<Record<string, Set<string>>>({})

    const [filterSearch, setFilterSearch] = useState('')
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({ imports: true })

    const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))

    // ── Queries ────────────────────────────────────────────────────────────
    // Fetch ALL records for current batch (up to 500) to enable client-side filtering
    const { data: allData, isLoading, refetch } = useQuery({
        queryKey: ['import-preview-all', importBatchId],
        queryFn: async () => {
            const params: Record<string, string> = {
                page: '1', limit: '500', source: 'excel_import',
            }
            if (importBatchId) params.importBatchId = importBatchId
            const res = await studentsAPI.getAll(params)
            return res.data.data
        },
    })

    const { data: filterOptions } = useQuery({
        queryKey: ['student-filters'],
        queryFn: async () => (await studentsAPI.getFilters()).data.data,
    })

    // ── All raw students ───────────────────────────────────────────────────
    const allStudents: any[] = allData?.students || []

    // Dynamic column list from the full data set
    const customFieldCols = useMemo(() => collectCustomFieldColumns(allStudents), [allStudents])

    // Filterable columns: low-cardinality columns discovered from data
    const filterableCols = useMemo(
        () => detectFilterableColumns(allStudents, customFieldCols),
        [allStudents, customFieldCols]
    )

    // ── Client-side search + multi-select filter ───────────────────────────
    const filteredStudents = useMemo(() => {
        let rows = allStudents

        // 1. Text search: match against any column value
        const q = search.trim().toLowerCase()
        if (q) {
            rows = rows.filter(s => {
                const cf = s.customFields || {}
                // Search standard fields
                const standard = [s.fullName, s.email, s.phone, s.programme, s.regionalCenter, s.enrollmentNo]
                    .filter(Boolean).map(v => String(v).toLowerCase())
                if (standard.some(v => v.includes(q))) return true
                // Search all custom field values
                return Object.values(cf).some(v => {
                    const str = cellValue(v).toLowerCase()
                    return str.includes(q)
                })
            })
        }

        // 2. Multi-select adaptive filters
        for (const [colKey, selected] of Object.entries(activeFilters)) {
            if (!selected || selected.size === 0) continue
            rows = rows.filter(s => {
                const v = cellValue(s.customFields?.[colKey])
                return selected.has(v)
            })
        }

        return rows
    }, [allStudents, search, activeFilters])

    // ── Pagination (client-side) ───────────────────────────────────────────
    const PAGE_SIZE = 50
    const totalFiltered = filteredStudents.length
    const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE))
    const students = filteredStudents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    // Reset page on search/filter change
    useEffect(() => { setPage(1); setPageInput('1') }, [search, activeFilters, importBatchId])

    // Total active filter count (for badge)
    const activeFilterCount = (importBatchId ? 1 : 0) + Object.values(activeFilters).reduce((n, s) => n + s.size, 0)

    // Toggle a single value in a multi-select filter column
    const toggleFilterValue = (colKey: string, value: string) => {
        setActiveFilters(prev => {
            const next = { ...prev }
            const current = new Set(next[colKey] || [])
            if (current.has(value)) current.delete(value)
            else current.add(value)
            if (current.size === 0) delete next[colKey]
            else next[colKey] = current
            return next
        })
    }

    const clearAllFilters = () => {
        setImportBatchId('')
        setActiveFilters({})
    }

    // ── Promote mutations ──────────────────────────────────────────────────
    const promoteRowMutation = useMutation({
        mutationFn: (id: string | number) => studentsAPI.promoteImportedRow(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['import-preview-all'] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setSelectedIds(prev => prev.filter(sid => sid !== String(promoteRowMutation.variables)))
            toast({ title: 'Promoted!', description: 'Record moved to active Orders.', variant: 'success' })
        },
        onError: (err: any) => toast({
            title: 'Error', description: err?.response?.data?.message || 'Failed to promote record.', variant: 'destructive',
        }),
    })

    const promoteSelectionMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            for (const id of ids) await studentsAPI.promoteImportedRow(id)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['import-preview-all'] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setSelectedIds([])
            toast({ title: 'Promoted!', description: 'Selected records moved to active Orders.', variant: 'success' })
        },
        onError: (err: any) => toast({
            title: 'Error', description: err?.response?.data?.message || 'Failed to promote records.', variant: 'destructive',
        }),
    })

    const promoteBatchMutation = useMutation({
        mutationFn: (batchId: string) => studentsAPI.promoteImportBatch(batchId),
        onSuccess: (res: any) => {
            queryClient.invalidateQueries({ queryKey: ['import-preview-all'] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            toast({ title: 'Batch Promoted!', description: res?.data?.message || 'All records moved to active Orders.', variant: 'success' })
        },
        onError: (err: any) => toast({
            title: 'Error', description: err?.response?.data?.message || 'Failed to promote batch.', variant: 'destructive',
        }),
    })

    // ── Export ─────────────────────────────────────────────────────────────
    const [isExporting, setIsExporting] = useState(false)
    const handleExport = async () => {
        setIsExporting(true)
        try {
            const exportParams: Record<string, string> = { source: 'excel_import' }
            if (importBatchId) exportParams.importBatchId = importBatchId
            const response = await studentsAPI.exportExcel(exportParams)
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `import_preview_${new Date().toISOString().split('T')[0]}.xlsx`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            window.URL.revokeObjectURL(url)
            toast({ title: 'Export Successful', description: 'Your Excel file has been downloaded.' })
        } catch {
            toast({ title: 'Export Failed', variant: 'destructive' })
        } finally {
            setIsExporting(false)
        }
    }

    // ── Selection ──────────────────────────────────────────────────────────
    const handleSelectAll = () => {
        setSelectedIds(selectedIds.length === students.length ? [] : students.map((s: any) => String(s.id)))
    }
    const handleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
    }

    // ── Access Gate ────────────────────────────────────────────────────────
    if (currentUser && !isAdminManager) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
                <Users className="w-16 h-16 text-muted-foreground/40" />
                <h2 className="text-xl font-semibold">Access Restricted</h2>
                <p className="text-muted-foreground max-w-sm">
                    Import Preview is only available to Admins and Managers.
                </p>
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
                            : <><Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span></>}
                    </Button>

                    {selectedIds.length > 0 && (
                        <Button
                            size="sm"
                            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => {
                                if (window.confirm(`Promote ${selectedIds.length} selected record(s) to Orders?`)) {
                                    promoteSelectionMutation.mutate(selectedIds)
                                }
                            }}
                            disabled={promoteSelectionMutation.isPending}
                        >
                            {promoteSelectionMutation.isPending
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <ArrowUpCircle className="w-4 h-4" />}
                            Promote Selection ({selectedIds.length})
                        </Button>
                    )}

                    {importBatchId && (
                        <Button
                            size="sm"
                            className="gap-2 gradient-primary text-white"
                            onClick={() => {
                                if (window.confirm('Promote ALL un-promoted records in this batch to Orders?')) {
                                    promoteBatchMutation.mutate(importBatchId)
                                }
                            }}
                            disabled={promoteBatchMutation.isPending}
                        >
                            {promoteBatchMutation.isPending
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <ArrowUpCircle className="w-4 h-4" />}
                            <span className="hidden sm:inline">Promote Entire Batch</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* ── Search & Filter Bar ── */}
            <div className="border border-border rounded-xl p-3 flex flex-col sm:flex-row gap-3">
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

                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search any column value…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full h-9 pl-9 pr-4 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Active filter chips */}
                {Object.entries(activeFilters).map(([col, vals]) =>
                    Array.from(vals).map(val => (
                        <span
                            key={`${col}:${val}`}
                            className="inline-flex items-center gap-1 px-2 h-9 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20 shrink-0 max-w-[180px]"
                        >
                            <span className="truncate">{col}: {val}</span>
                            <button onClick={() => toggleFilterValue(col, val)} className="shrink-0 hover:opacity-70">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))
                )}

                <div className="flex items-center shrink-0">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {isLoading ? '…' : `${formatNumber(totalFiltered)} / ${formatNumber(allStudents.length)} record${allStudents.length !== 1 ? 's' : ''}`}
                    </span>
                </div>
            </div>

            {/* ── Bulk action bar when rows selected ── */}
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20 animate-fade-in">
                    <span className="text-sm font-medium text-primary">{selectedIds.length} selected</span>
                    <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                        onClick={() => {
                            if (window.confirm(`Promote ${selectedIds.length} selected record(s) to Orders?`)) {
                                promoteSelectionMutation.mutate(selectedIds)
                            }
                        }}
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

            {/* ── Layout Wrapper for Table + Filter Panel ── */}
            <div className={cn(
                "grid gap-6 transition-all duration-300 items-start",
                showFilters ? "grid-cols-1 xl:grid-cols-[1fr_290px]" : "grid-cols-1"
            )}>
                {/* ── Data Table ── */}
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
                                    <th className="p-2 text-left font-bold text-slate-500 dark:text-slate-200 border-l border-border whitespace-nowrap bg-slate-100 dark:bg-slate-800 sticky right-0 z-20 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {isLoading ? (
                                    Array(8).fill(0).map((_, i) => (
                                        <tr key={i} className="border-b border-border">
                                            <td className="p-3"><Skeleton className="h-4 w-4" /></td>
                                            {customFieldCols.map(k => (
                                                <td key={k} className="p-3"><Skeleton className="h-4 w-24" /></td>
                                            ))}
                                            <td className="p-3 sticky right-0 bg-background"><Skeleton className="h-7 w-28" /></td>
                                        </tr>
                                    ))
                                ) : students.length === 0 ? (
                                    <tr>
                                        <td colSpan={1 + customFieldCols.length + 1} className="p-16 text-center">
                                            <Users className="w-14 h-14 mx-auto mb-4 text-muted-foreground/40" />
                                            <p className="text-lg font-medium mb-1">No imported records found</p>
                                            <p className="text-muted-foreground text-sm mb-4">
                                                {search || activeFilterCount > 0
                                                    ? 'Try adjusting your search or filters'
                                                    : 'Import an Excel file to see records here'}
                                            </p>
                                            {!search && activeFilterCount === 0 && (
                                                <Link href="/import">
                                                    <Button variant="outline">Import Data</Button>
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    students.map((student: any) => {
                                        const cf = student.customFields || {}
                                        const id = String(student.id)
                                        const isSelected = selectedIds.includes(id)
                                        const isPromoting = promoteRowMutation.isPending && promoteRowMutation.variables === student.id

                                        return (
                                            <tr
                                                key={id}
                                                className={cn(
                                                    'border-b border-border transition-colors group/row',
                                                    isSelected
                                                        ? 'bg-primary/5'
                                                        : 'hover:bg-slate-50/50 dark:hover:bg-white/[0.02]'
                                                )}
                                            >
                                                <td className="p-2 border-r border-border">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => handleSelect(id)}
                                                        className="w-4 h-4 rounded border-slate-300 dark:border-white/20 cursor-pointer"
                                                    />
                                                </td>

                                                {customFieldCols.map(key => (
                                                    <td key={key} className="p-2 border-r border-border text-[13px] max-w-[200px]">
                                                        <span className="block truncate" title={cellValue(cf[key])}>
                                                            {cellValue(cf[key]) || <span className="text-muted-foreground">—</span>}
                                                        </span>
                                                    </td>
                                                ))}

                                                <td
                                                    className="p-2 border-l border-border sticky right-0 bg-background group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-900/80 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)]"
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-[11px] font-bold uppercase tracking-wider text-emerald-600 border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 whitespace-nowrap gap-1.5"
                                                        onClick={() => {
                                                            if (window.confirm('Promote this record to active Orders?')) {
                                                                promoteRowMutation.mutate(student.id)
                                                            }
                                                        }}
                                                        disabled={isPromoting || promoteSelectionMutation.isPending}
                                                    >
                                                        {isPromoting
                                                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                                                            : <ArrowUpCircle className="w-3 h-3" />}
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

                    {/* ── Pagination ── */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-border flex items-center justify-between">
                            <p className="text-sm text-muted-foreground hidden sm:block">
                                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalFiltered)} of {formatNumber(totalFiltered)}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => { const n = page - 1; setPage(n); setPageInput(String(n)) }}>
                                    <ChevronLeft className="w-4 h-4" />Prev
                                </Button>
                                <div className="flex items-center gap-2 px-2">
                                    <span className="text-sm text-muted-foreground hidden sm:inline">Page</span>
                                    <input
                                        type="text"
                                        value={pageInput}
                                        onChange={e => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
                                        onBlur={() => {
                                            const v = parseInt(pageInput)
                                            if (v >= 1 && v <= totalPages) { setPage(v); setPageInput(String(v)) }
                                            else setPageInput(String(page))
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                const v = parseInt(pageInput)
                                                if (v >= 1 && v <= totalPages) { setPage(v); setPageInput(String(v)) }
                                                else setPageInput(String(page))
                                            }
                                        }}
                                        className="w-12 px-2 py-1 text-sm text-center bg-white/5 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <span className="text-sm text-muted-foreground">of {totalPages}</span>
                                </div>
                                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => { const n = page + 1; setPage(n); setPageInput(String(n)) }}>
                                    Next<ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Filter Sidebar ── */}
                {showFilters && (
                    <div className="sticky top-6 self-start rounded-xl border border-border bg-background shadow-lg overflow-hidden h-[calc(100vh-200px)] flex flex-col animate-fade-in">
                        {/* Header */}
                        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4 text-primary" />
                                Filter Records
                            </h3>
                            <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Search inside filter panel */}
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

                        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">

                            {/* ── Import Batch ── */}
                            {filterOptions?.importBatches?.length > 0 && (
                                <div>
                                    <button
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => toggleSection('imports')}
                                    >
                                        <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" />Imported Files</span>
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", openSections.imports && "rotate-180")} />
                                    </button>
                                    {openSections.imports && (
                                        <div className="space-y-0.5 mb-3">
                                            {filterOptions.importBatches
                                                .filter((b: any) => !filterSearch || b.fileName.toLowerCase().includes(filterSearch.toLowerCase()))
                                                .map((batch: any) => (
                                                    <label
                                                        key={batch.id}
                                                        className={cn(
                                                            "flex items-start gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors group",
                                                            importBatchId === batch.id
                                                                ? "bg-blue-50 dark:bg-blue-500/10"
                                                                : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                        )}
                                                    >
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

                            {/* ── Adaptive Column Filters ── */}
                            {filterableCols.length === 0 && !isLoading && allStudents.length > 0 && (
                                <p className="text-xs text-muted-foreground text-center py-6 px-3">
                                    No filterable columns detected in the current data.
                                </p>
                            )}

                            {filterableCols.map((col, idx) => {
                                const sectionKey = `col_${col.key}`
                                const selectedVals = activeFilters[col.key] || new Set<string>()
                                const filteredVals = col.values.filter(v =>
                                    !filterSearch || v.toLowerCase().includes(filterSearch.toLowerCase()) ||
                                    col.key.toLowerCase().includes(filterSearch.toLowerCase())
                                )
                                if (filteredVals.length === 0) return null

                                // Cycle through accent colours for visual variety
                                const accents = [
                                    'accent-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
                                    'accent-amber-500 bg-amber-50 dark:bg-amber-500/10',
                                    'accent-violet-500 bg-violet-50 dark:bg-violet-500/10',
                                    'accent-cyan-500 bg-cyan-50 dark:bg-cyan-500/10',
                                    'accent-rose-500 bg-rose-50 dark:bg-rose-500/10',
                                    'accent-indigo-500 bg-indigo-50 dark:bg-indigo-500/10',
                                ]
                                const [accentCls, activeBg] = accents[idx % accents.length].split(' ').reduce<[string, string]>((acc, c) => {
                                    if (c.startsWith('accent-')) return [c, acc[1]]
                                    return [acc[0], c + ' ' + (acc[1] || '')]
                                }, ['', ''])

                                return (
                                    <div key={col.key}>
                                        <button
                                            className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                            onClick={() => toggleSection(sectionKey)}
                                        >
                                            <span className="flex items-center gap-1.5 truncate">
                                                <Tag className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">{col.key}</span>
                                                {selectedVals.size > 0 && (
                                                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                                                        {selectedVals.size}
                                                    </span>
                                                )}
                                            </span>
                                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform shrink-0", openSections[sectionKey] && "rotate-180")} />
                                        </button>
                                        {openSections[sectionKey] && (
                                            <div className="space-y-0.5 mb-3 max-h-48 overflow-y-auto">
                                                {filteredVals.map(val => (
                                                    <label
                                                        key={val}
                                                        className={cn(
                                                            "flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                                                            selectedVals.has(val)
                                                                ? activeBg.trim()
                                                                : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedVals.has(val)}
                                                            onChange={() => toggleFilterValue(col.key, val)}
                                                            className={cn("w-3.5 h-3.5 rounded border-slate-300 cursor-pointer shrink-0", accentCls)}
                                                        />
                                                        <span className="text-[13px] font-medium text-foreground truncate" title={val}>{val}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Footer */}
                        {activeFilterCount > 0 && (
                            <div className="p-3 border-t border-border shrink-0">
                                <button
                                    onClick={clearAllFilters}
                                    className="w-full h-8 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border border-red-200 dark:border-red-500/20"
                                >
                                    Clear all {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
