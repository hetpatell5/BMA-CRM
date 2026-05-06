'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    Search, Filter, Plus, Download, Trash2, Edit,
    ChevronLeft, ChevronRight, Users, RefreshCw, FileText,
    UserCheck, ChevronDown, BookOpen, Star, Layers, PhoneCall, PenTool, X, Check,
    Columns, EyeOff, Eye, GripVertical, Lock, Settings, SlidersHorizontal, FolderOpen, Tag, Truck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { studentsAPI, teamAPI, shiprocketAPI } from '@/lib/api'
import { formatNumber, formatDate, getStatusColor, debounce } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

// ─── Column Definition Schema ───────────────────────────────────────────────
type ColumnDef = {
    id: string;               // unique key
    label: string;            // header display text
    locked?: boolean;         // cannot be removed (Full Name, Actions)
    coreField?: string;       // maps to getStudentRow() fields
    customFieldKey?: string;  // reads from customFields JSON using cfGet()
    adminOnly?: boolean;      // only visible to admin/manager
}

const DEFAULT_COLUMNS: ColumnDef[] = [
    { id: 'name',        label: 'Full Name',      locked: true,  coreField: 'name' },
    { id: 'phone',       label: 'Contact',        coreField: 'phone' },
    { id: 'programme',   label: 'Program',        coreField: 'programme' },
    { id: 'semester',    label: 'Sem / Year',     coreField: 'semester' },
    { id: 'requirement', label: 'Requirement of', coreField: 'requirement' },
    { id: 'source',      label: 'Source',         coreField: 'source' },
    { id: 'status',      label: 'Status',         locked: true, coreField: 'status' },
    { id: 'assignedTo',  label: 'Assigned To',    coreField: 'assignedGuide' },
    { id: 'assignedBy',  label: 'Assigned By',    coreField: 'assignedBy', adminOnly: true },
    { id: 'decidedPrice',label: 'Decided Price',  coreField: 'decidedPrice', adminOnly: true },
    { id: 'actions',     label: 'Actions',        locked: true },
]


// ─── Helper: read a value from customFields by matching label keywords ────────
function cfGet(customFields: Record<string, any> | null | undefined, ...keywords: string[]): string {
    if (!customFields || typeof customFields !== 'object') return ''
    const kws = keywords.map(k => k.toLowerCase())
    for (const [key, val] of Object.entries(customFields)) {
        const lk = key.toLowerCase()
        if (kws.some(kw => lk.includes(kw) || kw === lk)) {
            if (Array.isArray(val)) return val.join(', ')
            return String(val ?? '').trim()
        }
    }
    return ''
}

// ─── Column definitions ────────────────────────────────────────────────────────
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

function getStudentRow(s: any) {
    const cf = s.customFields
    return {
        name:            s.fullName || cfGet(cf, 'name', 'full name'),
        email:           s.email || cfGet(cf, 'email'),
        phone:           s.phone || cfGet(cf, 'contact number', 'contact', 'mobile', 'phone'),
        programme:       s.programme || s.course || cfGet(cf, 'program name', 'programme', 'program', 'course'),
        semester:        cfGet(cf, 'present semester', 'semester', 'year'),
        requirement:     cfGet(cf, 'requirement of', 'requirement in', 'product type', 'requirement'),
        deliveryType:    cfGet(cf, 'delivery type', 'delivery', 'copy type'),
        decidedPrice:    cfGet(cf, 'decided price'),
        source:          s.source || 'manual',
        status:          s.status,
        id:              s.id,
        createdAt:       s.createdAt,
        assignedGuide:   s.assignedGuide || null,
        assignedGuideId: s.assignedGuideId || null,
        assignedBy:      s.assignedBy || null,
        assignedById:    s.assignedById || null,
    }
}

// ─── Guide role label ────────────────────────────────────────────────────────
function guideRoleLabel(staffRole: string | null) {
    if (staffRole === 'GUIDE')  return 'Guide'
    if (staffRole === 'EXPERT') return 'Expert'
    if (staffRole === 'BOTH')   return 'Guide & Expert'
    if (staffRole === 'TELECALLER') return 'Telecaller'
    if (staffRole === 'WRITTER' || staffRole === 'WRITER') return 'Writter'
    return ''
}

function getStaffRoleMeta(staffRole: string | null) {
    if (staffRole === 'GUIDE') {
        return { icon: BookOpen, iconColor: 'text-emerald-400' }
    }
    if (staffRole === 'EXPERT') {
        return { icon: Star, iconColor: 'text-yellow-400' }
    }
    if (staffRole === 'TELECALLER') {
        return { icon: PhoneCall, iconColor: 'text-cyan-400' }
    }
    if (staffRole === 'WRITTER' || staffRole === 'WRITER') {
        return { icon: PenTool, iconColor: 'text-rose-400' }
    }

    return { icon: Layers, iconColor: 'text-purple-400' }
}

export default function StudentsPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const queryClient = useQueryClient()
    const { toast } = useToast()
    const { user: currentUser } = useAuthStore()
    const isTelecaller = currentUser?.role === 'STAFF' && currentUser?.staffRole === 'TELECALLER'
    const hasFullStudentAccess = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER' || isTelecaller

    // Fetch Shiprocket config for dynamic hard copy keyword detection
    const { data: srConfigData } = useQuery({
        queryKey: ['shiprocket-config'],
        queryFn: async () => (await shiprocketAPI.getConfig()).data.data,
        staleTime: 5 * 60 * 1000,
    })
    const hardCopyKeywords: string[] = srConfigData?.hardCopyKeywords || ['hard copy', 'hard-copy', 'hardcopy']
    // Check both deliveryType and requirement fields.
    // Also always treat any deliveryType containing 'hard' as a hard copy (e.g. "Hard Copy").
    const isHardCopyOrder = (r: ReturnType<typeof getStudentRow>) => {
        const deliveryLower = (r.deliveryType || '').toLowerCase()
        const requirementLower = (r.requirement || '').toLowerCase()
        // Direct fast check on delivery type
        if (deliveryLower.includes('hard')) return true
        // Dynamic keywords check against both fields
        const combined = `${deliveryLower} ${requirementLower}`
        return hardCopyKeywords.some(kw => combined.includes(kw.toLowerCase()))
    }

    const [search, setSearch]           = useState(searchParams.get('search') || '')
    const [page, setPage]               = useState(1)
    const [pageInput, setPageInput]     = useState('1')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [showFilters, setShowFilters] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [assignmentDraft, setAssignmentDraft] = useState<{ student: any; member: any } | null>(null)

    // Dynamic Columns State
    const [activeColumns, setActiveColumns] = useState<ColumnDef[]>([])
    const [showColumnPanel, setShowColumnPanel] = useState(false)
    const [newColumnLabel, setNewColumnLabel] = useState('')

    const [filters, setFilters] = useState({
        status:         searchParams.get('status') || '',
        programme:      searchParams.get('programme') || '',
        regionalCenter: searchParams.get('regionalCenter') || '',
        importBatchId:  searchParams.get('importBatchId') || '',
        source:         searchParams.get('source') || '',
        subject:        searchParams.get('subject') || '',
    })

    // Load columns correctly
    useEffect(() => {
        if (!currentUser?.id) return;
        const saved = localStorage.getItem(`crm_column_prefs_v1_${currentUser.id}`)
        if (saved) {
            try {
                setActiveColumns(JSON.parse(saved))
                return
            } catch (e) {
                console.error("Failed to parse saved columns", e)
            }
        }
        
        setActiveColumns(DEFAULT_COLUMNS.filter(c => c.adminOnly ? hasFullStudentAccess : true))
    }, [currentUser?.id, hasFullStudentAccess])

    const saveColumnPrefs = (cols: ColumnDef[]) => {
        if (!currentUser?.id) return;
        localStorage.setItem(`crm_column_prefs_v1_${currentUser.id}`, JSON.stringify(cols))
        setActiveColumns(cols)
    }

    const unassignedColumnDefaults = DEFAULT_COLUMNS.filter(col => 
        (col.adminOnly ? hasFullStudentAccess : true) && !activeColumns.find(ac => ac.id === col.id)
    )

    // Manage columns logic
    const moveColumn = (index: number, direction: 'up' | 'down') => {
        const cols = [...activeColumns]
        if (direction === 'up' && index > 0) {
            [cols[index], cols[index - 1]] = [cols[index - 1], cols[index]]
        } else if (direction === 'down' && index < cols.length - 1) {
            [cols[index], cols[index + 1]] = [cols[index + 1], cols[index]]
        }
        saveColumnPrefs(cols)
    }

    const removeColumn = (id: string) => {
        saveColumnPrefs(activeColumns.filter(c => c.id !== id))
    }

    const addColumn = (col: ColumnDef) => {
        const actionsIndex = activeColumns.findIndex(c => c.id === 'actions');
        if (actionsIndex !== -1) {
            const newCols = [...activeColumns];
            newCols.splice(actionsIndex, 0, col);
            saveColumnPrefs(newCols);
        } else {
            saveColumnPrefs([...activeColumns, col]);
        }
    }

    const handleAddCustomColumn = (e: React.FormEvent) => {
        e.preventDefault()
        const lbl = newColumnLabel.trim();
        if (!lbl) {
            toast({ title: 'Error', description: 'Please enter a column label.', variant: 'destructive' })
            return;
        }
        
        const newId = `custom_${lbl.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
        if (activeColumns.some(c => c.id === newId)) {
            toast({ title: 'Error', description: 'Column already exists', variant: 'destructive' })
            return
        }

        addColumn({
            id: newId,
            label: lbl,
            customFieldKey: lbl
        })
        setNewColumnLabel('')
    }


    // Fetch students
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['students', page, search, filters],
        queryFn: async () => {
            const params: Record<string, string> = { page: String(page), limit: '50', search }
            Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
            const response = await studentsAPI.getAll(params)
            return response.data.data
        },
    })

    // Fetch filter options
    const { data: filterOptions } = useQuery({
        queryKey: ['student-filters'],
        queryFn: async () => {
            const r = await studentsAPI.getFilters()
            return r.data.data
        },
    })

    // Fetch available guides/experts (admin/leader)
    const { data: guidesData } = useQuery({
        queryKey: ['guides-available'],
        queryFn: async () => (await teamAPI.getGuides()).data.data,
        enabled: hasFullStudentAccess,
    })
    const guides: any[] = guidesData || []

    // Bulk update
    const bulkUpdateMutation = useMutation({
        mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
            studentsAPI.bulkUpdate(ids, status),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setSelectedIds([])
            toast({ title: 'Updated', description: 'Orders updated successfully', variant: 'success' })
        },
        onError: () => toast({ title: 'Error', description: 'Failed to update orders', variant: 'destructive' }),
    })

    // Bulk delete
    const bulkDeleteMutation = useMutation({
        mutationFn: (ids: string[]) => studentsAPI.bulkDelete(ids),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setSelectedIds([])
            toast({ title: 'Deleted!', description: 'Orders deleted successfully', variant: 'success' })
        },
        onError: () => toast({ title: 'Error', description: 'Failed to delete orders', variant: 'destructive' }),
    })

    // Assign to staff member
    const assignMutation = useMutation({
        mutationFn: ({ studentId, guideId }: { studentId: string; guideId: number | null }) =>
            studentsAPI.assignToGuide(studentId, guideId),
        onSuccess: (_, { guideId }) => {
            queryClient.invalidateQueries({ queryKey: ['students'] })
            if (guideId) {
                closeAssignModal()
            }
            toast({
                title: guideId ? 'Assigned!' : 'Unassigned',
                description: guideId ? 'Order assigned successfully' : 'Assignment removed',
                variant: 'success',
            })
        },
        onError: (error: any) => toast({
            title: 'Error',
            description: error?.response?.data?.message || 'Failed to assign order',
            variant: 'destructive',
        }),
    })

    // Export
    const [isExporting, setIsExporting] = useState(false)
    const handleExport = async () => {
        setIsExporting(true)
        try {
            const response = await studentsAPI.exportExcel({ search, ...filters })
            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            })
            const url  = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `students_export_${new Date().toISOString().split('T')[0]}.xlsx`
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

    useEffect(() => {
        const d = debounce(() => setPage(1), 500)
        d()
    }, [search])

    const students   = data?.students || []
    const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 }
    const activeFilterCount = Object.values(filters).filter(Boolean).length

    // State for filter panel search
    const [filterSearch, setFilterSearch] = useState('')
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        imports: true, source: true, programme: false, regional: false, subject: false
    })
    const toggleSection = (key: string) => setOpenSections(s => ({ ...s, [key]: !s[key] }))

    const handleSelectAll = () => {
        setSelectedIds(selectedIds.length === students.length ? [] : students.map((s: any) => s.id))
    }
    const handleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
    }

    const sourceLabel = (src: string) => {
        if (src === 'form_submission') return { label: 'Form',   cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/25' }
        if (src === 'excel' || src === 'import') return { label: 'Excel',  cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/25' }
        return { label: 'Manual', cls: 'bg-muted text-muted-foreground border border-border' }
    }

    function closeAssignModal() {
        setShowAssignModal(false)
        setAssignmentDraft(null)
    }

    function openAssignModal(studentRow: any, member: any) {
        setAssignmentDraft({ student: studentRow, member })
        setShowAssignModal(true)
    }

    function handleAssignSubmit() {
        if (!assignmentDraft) return
        assignMutation.mutate({
            studentId: assignmentDraft.student.id,
            guideId: assignmentDraft.member.id,
        })
    }

    // Dynamic Row rendering
    const renderCell = (col: ColumnDef, r: ReturnType<typeof getStudentRow>, student: any) => {
        const src = sourceLabel(r.source)
        const guide = r.assignedGuide

        switch (col.id) {
            case 'name':
                return (
                    <td key={col.id} className="p-2 border-r border-border" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>
                        <div className="flex items-center gap-2 whitespace-nowrap min-w-max">
                            <span className="text-[14px] font-bold text-foreground group-hover/row:text-primary transition-colors">{r.name}</span>
                            {r.email && <span className="text-[11px] text-muted-foreground font-medium opacity-70">({r.email})</span>}
                        </div>
                    </td>
                )
            case 'phone':
                return <td key={col.id} className="p-2 text-[14px] font-mono border-r border-border whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>{r.phone || <span className="text-muted-foreground">—</span>}</td>
            case 'programme':
                return <td key={col.id} className="p-2 text-[14px] border-r border-border whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>{r.programme || <span className="text-muted-foreground">—</span>}</td>
            case 'semester':
                return <td key={col.id} className="p-2 text-[14px] border-r border-border whitespace-nowrap text-center" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>{r.semester ? <span className="font-medium">{r.semester}</span> : <span className="text-muted-foreground">—</span>}</td>
            case 'requirement':
                return <td key={col.id} className="p-2 text-[14px] border-r border-border whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>{r.requirement ? <span className="font-medium">{r.requirement}</span> : <span className="text-muted-foreground">—</span>}</td>
            case 'source':
                return <td key={col.id} className="p-2 border-r border-border whitespace-nowrap text-center" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}><span className="text-[12px] uppercase tracking-wider text-muted-foreground font-bold">{src.label}</span></td>
            case 'status':
                return (
                    <td key={col.id} className="p-2 border-r border-border whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger className="outline-none focus:outline-none flex items-center gap-1 group/trigger">
                                <span className={`px-2.5 py-1.5 flex whitespace-nowrap w-max shrink-0 items-center justify-between gap-1.5 rounded text-[11px] font-bold uppercase tracking-wider transition-all ${getStatusColor(r.status)} hover:brightness-110 cursor-pointer`}>
                                    {r.status.replace(/_/g, ' ')}
                                    <ChevronDown className="w-3 h-3 opacity-60 shrink-0 ml-0.5" />
                                </span>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    align="start"
                                    sideOffset={6}
                                    className="z-[100] w-52 overflow-hidden rounded-xl bg-popover border border-border p-1.5 shadow-2xl animate-fade-in"
                                >
                                    {['NEW_LEAD', 'SYNOPSIS_SENT', 'GUIDE_ASSIGNED', 'REPORT_IN_PROGRESS', 'SHIPPED', 'ALL_DONE'].map((st) => {
                                        const isSelected = r.status === st;
                                        return (
                                            <DropdownMenu.Item
                                                key={st}
                                                onSelect={() => bulkUpdateMutation.mutate({ ids: [r.id], status: st })}
                                                className={`flex items-center gap-2 outline-none transition-colors cursor-pointer rounded-lg px-3 py-2.5 mb-0.5 last:mb-0 text-[14px] ${
                                                    isSelected 
                                                        ? 'bg-slate-100 dark:bg-slate-800 text-foreground font-medium' 
                                                        : 'text-muted-foreground data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-slate-800/50 data-[highlighted]:text-foreground'
                                                }`}
                                                disabled={isSelected}
                                            >
                                                {st.charAt(0) + st.slice(1).toLowerCase().replace(/_/g, ' ')}
                                            </DropdownMenu.Item>
                                        )
                                    })}
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </td>
                )
            case 'assignedTo':
                return (
                    <td key={col.id} className="p-2 border-r border-border whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>
                        {guide ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[14px] font-bold text-foreground">{guide.fullName}</span>
                                <span className="text-[10px] uppercase tracking-widest text-muted-foreground px-1.5 py-0.5 border border-border rounded bg-muted/30">{guideRoleLabel(guide.staffRole)}</span>
                            </div>
                        ) : (
                            <span className="text-muted-foreground text-xs italic">Unassigned</span>
                        )}
                    </td>
                )
            case 'assignedBy':
                return (
                    <td key={col.id} className="p-2 border-r border-border whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>
                        {r.assignedBy ? (
                            <span className="text-muted-foreground text-[12px] font-bold uppercase tracking-tight">
                                {r.assignedBy.fullName}
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                        )}
                    </td>
                )
            case 'decidedPrice':
                return (
                    <td key={col.id} className="p-2 text-[15px] border-r border-border whitespace-nowrap text-right pr-4 font-bold" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>
                        {r.decidedPrice ? <span className="text-foreground">{formatPrice(r.decidedPrice)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                )
            case 'actions':
                return (
                    <td key={col.id} className="p-2 border-l border-border sticky right-0 bg-background shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.08)] group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-900/80" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                            {hasFullStudentAccess && (
                                <DropdownMenu.Root>
                                    <DropdownMenu.Trigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1 text-[11px] h-8 font-bold uppercase tracking-wider border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 max-w-[140px]" title="Assign staff member">
                                            <UserCheck className="w-3 h-3 shrink-0" />
                                            <span className="truncate">
                                                {guide ? guide.fullName : 'Assign'}
                                            </span>
                                            <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
                                        </Button>
                                    </DropdownMenu.Trigger>
                                    <DropdownMenu.Portal>
                                        <DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className="z-[100] w-52 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl bg-popover border border-border p-1.5 shadow-2xl animate-fade-in">
                                            {guides.length === 0 ? (
                                                <div className="px-3 py-4 text-xs text-muted-foreground text-center">No staff members available.</div>
                                            ) : (
                                                <div className="max-h-[min(18rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto pr-0.5">
                                                    {guides.map((g: any) => {
                                                        const isSelected = r.assignedGuideId === g.id
                                                        return (
                                                            <DropdownMenu.Item key={g.id} onSelect={() => openAssignModal(r, g)} className={`w-full flex items-center justify-between outline-none transition-colors cursor-pointer rounded-lg px-3 py-2.5 mb-1 last:mb-0 ${isSelected ? 'bg-slate-100 dark:bg-slate-800 text-foreground font-medium' : 'text-muted-foreground data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-slate-800/50 data-[highlighted]:text-foreground'}`}>
                                                                <div className="text-[14px] font-medium truncate">{g.fullName}</div>
                                                                <div className="text-[11px] text-muted-foreground shrink-0 ml-3 font-normal">{guideRoleLabel(g.staffRole)}</div>
                                                            </DropdownMenu.Item>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                            {r.assignedGuideId && (
                                                <div className="mt-1 border-t border-border pt-1">
                                                    <DropdownMenu.Item onSelect={() => assignMutation.mutate({ studentId: r.id, guideId: null })} className="w-full outline-none transition-colors cursor-pointer rounded-lg px-3 py-2.5 text-red-500 dark:text-red-400 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-500/10 font-medium">
                                                        Remove Assignment
                                                    </DropdownMenu.Item>
                                                </div>
                                            )}
                                        </DropdownMenu.Content>
                                    </DropdownMenu.Portal>
                                </DropdownMenu.Root>
                            )}
                            {hasFullStudentAccess && (
                                <Link href={`/orders/${r.id}/edit`}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                </Link>
                            )}
                            {hasFullStudentAccess && isHardCopyOrder(r) && (
                                <Link href={`/orders/${r.id}`} title="Ship via Shiprocket">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                                    >
                                        <Truck className="w-4 h-4" />
                                    </Button>
                                </Link>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-emerald-500"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    bulkUpdateMutation.mutate({ ids: [r.id], status: 'ALL_DONE' });
                                }}
                                title="Mark as Done"
                            >
                                <Check className="w-4 h-4" />
                            </Button>
                        </div>
                    </td>
                )
            default:
                // Custom column cell reading from customFields using cfGet matcher
                const val = cfGet(student.customFields, col.customFieldKey || col.label)
                return <td key={col.id} className="p-2 text-[14px] border-r border-border whitespace-nowrap" onClick={(e) => { e.stopPropagation(); router.push(`/orders/${r.id}`); }}>{val || <span className="text-muted-foreground">—</span>}</td>
        }
    }

    return (
        <div className="space-y-6 animate-fade-in relative">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Orders</h1>
                    <p className="text-muted-foreground">
                        {hasFullStudentAccess
                            ? `Manage your order records • ${formatNumber(pagination.total)} total`
                            : `Your assigned orders • ${formatNumber(pagination.total)} total`}
                    </p>
                </div>
                <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                    {hasFullStudentAccess && (
                        <>
                            <Button variant={showColumnPanel ? 'secondary' : 'outline'} onClick={() => setShowColumnPanel(!showColumnPanel)} className="gap-2" size="sm">
                                <Columns className="w-4 h-4" />
                                <span className="hidden sm:inline">Columns</span>
                            </Button>

                            <Button variant="outline" onClick={handleExport} disabled={isExporting} className="gap-2" size="sm">
                                {isExporting
                                    ? <><RefreshCw className="w-4 h-4 animate-spin" /><span className="hidden sm:inline">Exporting...</span></>
                                    : <><Download className="w-4 h-4" /><span className="hidden sm:inline">Export</span></>}
                            </Button>
                            <Button variant="outline" onClick={() => refetch()} size="sm">
                                <RefreshCw className="w-4 h-4" />
                            </Button>
                            <Link href="/orders/new">
                                <Button className="gap-2 gradient-primary text-white" size="sm">
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Add Order</span>
                                </Button>
                            </Link>
                        </>
                    )}
                    {!hasFullStudentAccess && (
                        <Button variant="outline" onClick={() => refetch()} size="sm">
                            <RefreshCw className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Search and Filters Bar */}
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
                    <Input
                        placeholder="Search by name, email, phone, enrollment..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-10 h-9"
                    />
                </div>
                <div className="flex items-center gap-2">
                    {/* Quick status pill */}
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5 h-9 whitespace-nowrap">
                                <span className="text-[13px] font-medium">{filters.status ? filters.status.replace(/_/g, ' ') : 'All Status'}</span>
                                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                            </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content align="end" sideOffset={6} className="z-[100] w-48 rounded-xl bg-popover border border-border p-1.5 shadow-2xl animate-fade-in">
                                {['', 'NEW_LEAD', 'SYNOPSIS_SENT', 'GUIDE_ASSIGNED', 'REPORT_IN_PROGRESS', 'SHIPPED', 'ALL_DONE'].map(st => (
                                    <DropdownMenu.Item
                                        key={st || 'all'}
                                        onSelect={() => setFilters(f => ({ ...f, status: st }))}
                                        className={`outline-none cursor-pointer rounded-lg px-3 py-2.5 mb-0.5 text-[13px] transition-colors ${
                                            filters.status === st
                                                ? 'bg-slate-100 dark:bg-slate-800 text-foreground font-medium'
                                                : 'text-muted-foreground data-[highlighted]:bg-slate-50 dark:data-[highlighted]:bg-slate-800/50 data-[highlighted]:text-foreground'
                                        }`}
                                    >
                                        {st ? (st.charAt(0) + st.slice(1).toLowerCase().replace(/_/g, ' ')) : 'All Status'}
                                    </DropdownMenu.Item>
                                ))}
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2 -mt-2">
                    {filters.importBatchId && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/25">
                            <FolderOpen className="w-3 h-3" />
                            {filterOptions?.importBatches?.find((b: any) => b.id === filters.importBatchId)?.fileName || 'Import'}
                            <button onClick={() => setFilters(f => ({ ...f, importBatchId: '' }))} className="ml-0.5 hover:text-blue-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                    )}
                    {filters.source && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/25">
                            Source: {filters.source}
                            <button onClick={() => setFilters(f => ({ ...f, source: '' }))} className="ml-0.5 hover:text-violet-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                    )}
                    {filters.programme && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/25">
                            <Tag className="w-3 h-3" />
                            {filters.programme}
                            <button onClick={() => setFilters(f => ({ ...f, programme: '' }))} className="ml-0.5 hover:text-emerald-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                    )}
                    {filters.regionalCenter && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/25">
                            {filters.regionalCenter}
                            <button onClick={() => setFilters(f => ({ ...f, regionalCenter: '' }))} className="ml-0.5 hover:text-amber-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                    )}
                    {filters.subject && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/25">
                            {filters.subject}
                            <button onClick={() => setFilters(f => ({ ...f, subject: '' }))} className="ml-0.5 hover:text-cyan-900 dark:hover:text-white"><X className="w-3 h-3" /></button>
                        </span>
                    )}
                    <button
                        onClick={() => setFilters({ status: '', programme: '', regionalCenter: '', importBatchId: '', source: '', subject: '' })}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                        Clear all
                    </button>
                </div>
            )}

            {/* Bulk Actions (admin/leader) */}
            {hasFullStudentAccess && selectedIds.length > 0 && (
                <div className="border border-border rounded-xl p-4 flex items-center justify-between animate-fade-in">
                    <p className="text-sm"><span className="font-medium">{selectedIds.length}</span> students selected</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => bulkUpdateMutation.mutate({ ids: selectedIds, status: 'ACTIVE' })} disabled={bulkUpdateMutation.isPending}>Set Active</Button>
                        <Button variant="outline" size="sm" onClick={() => bulkUpdateMutation.mutate({ ids: selectedIds, status: 'INACTIVE' })} disabled={bulkUpdateMutation.isPending}>Set Inactive</Button>
                        <Button variant="destructive" size="sm" className="gap-2" onClick={() => setShowDeleteConfirm(true)} disabled={bulkDeleteMutation.isPending}>
                            <Trash2 className="w-4 h-4" />Delete Selected
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
                    </div>
                </div>
            )}

            {/* Layout Wrapper for Table + Optional Column Panel + Filter Panel */}
            <div className={cn(
                "grid gap-6 transition-all duration-300 items-start",
                showColumnPanel
                    ? "grid-cols-1 xl:grid-cols-[1fr_350px]"
                    : showFilters
                        ? "grid-cols-1 xl:grid-cols-[280px_1fr]"
                        : "grid-cols-1"
            )}>

                {/* Zoho-style Filter Panel */}
                {showFilters && !showColumnPanel && (
                    <div className="sticky top-6 self-start rounded-xl border border-border bg-background shadow-lg overflow-hidden h-[calc(100vh-200px)] flex flex-col animate-fade-in">
                        {/* Header */}
                        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                <SlidersHorizontal className="w-4 h-4 text-primary" />
                                Filter Orders by
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
                                    placeholder="Search filters..."
                                    value={filterSearch}
                                    onChange={e => setFilterSearch(e.target.value)}
                                    className="w-full h-8 pl-8 pr-3 rounded-lg text-sm bg-slate-100 dark:bg-white/5 border border-transparent focus:border-primary/40 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-1">

                            {/* ── Data Sources (Import Batches) ── */}
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
                                                            filters.importBatchId === batch.id
                                                                ? "bg-blue-50 dark:bg-blue-500/10"
                                                                : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={filters.importBatchId === batch.id}
                                                            onChange={() => setFilters(f => ({ ...f, importBatchId: f.importBatchId === batch.id ? '' : batch.id }))}
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

                            {/* ── Source ── */}
                            <div>
                                <button
                                    className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                    onClick={() => toggleSection('source')}
                                >
                                    <span>Source</span>
                                    <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", openSections.source && "rotate-180")} />
                                </button>
                                {openSections.source && (
                                    <div className="space-y-0.5 mb-3">
                                        {[
                                            { value: 'form_submission', label: 'Form Submission' },
                                            { value: 'excel_import', label: 'Excel Import' },
                                            { value: 'manual', label: 'Manual Entry' },
                                        ].filter(opt => !filterSearch || opt.label.toLowerCase().includes(filterSearch.toLowerCase()))
                                            .map(opt => (
                                                <label
                                                    key={opt.value}
                                                    className={cn(
                                                        "flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                                                        filters.source === opt.value
                                                            ? "bg-violet-50 dark:bg-violet-500/10"
                                                            : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={filters.source === opt.value}
                                                        onChange={() => setFilters(f => ({ ...f, source: f.source === opt.value ? '' : opt.value }))}
                                                        className="w-3.5 h-3.5 rounded border-slate-300 accent-violet-500 cursor-pointer shrink-0"
                                                    />
                                                    <span className="text-[13px] font-medium text-foreground">{opt.label}</span>
                                                </label>
                                            ))}
                                    </div>
                                )}
                            </div>

                            {/* ── Programme ── */}
                            {filterOptions?.programmes?.length > 0 && (
                                <div>
                                    <button
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => toggleSection('programme')}
                                    >
                                        <span>Programme</span>
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", openSections.programme && "rotate-180")} />
                                    </button>
                                    {openSections.programme && (
                                        <div className="space-y-0.5 mb-3 max-h-48 overflow-y-auto">
                                            {filterOptions.programmes
                                                .filter((p: string) => !filterSearch || p.toLowerCase().includes(filterSearch.toLowerCase()))
                                                .map((prog: string) => (
                                                    <label
                                                        key={prog}
                                                        className={cn(
                                                            "flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                                                            filters.programme === prog
                                                                ? "bg-emerald-50 dark:bg-emerald-500/10"
                                                                : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={filters.programme === prog}
                                                            onChange={() => setFilters(f => ({ ...f, programme: f.programme === prog ? '' : prog }))}
                                                            className="w-3.5 h-3.5 rounded border-slate-300 accent-emerald-500 cursor-pointer shrink-0"
                                                        />
                                                        <span className="text-[13px] font-medium text-foreground truncate">{prog}</span>
                                                    </label>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Regional Center ── */}
                            {filterOptions?.regionalCenters?.length > 0 && (
                                <div>
                                    <button
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => toggleSection('regional')}
                                    >
                                        <span>Regional Center</span>
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", openSections.regional && "rotate-180")} />
                                    </button>
                                    {openSections.regional && (
                                        <div className="space-y-0.5 mb-3 max-h-48 overflow-y-auto">
                                            {filterOptions.regionalCenters
                                                .filter((c: string) => !filterSearch || c.toLowerCase().includes(filterSearch.toLowerCase()))
                                                .map((center: string) => (
                                                    <label
                                                        key={center}
                                                        className={cn(
                                                            "flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                                                            filters.regionalCenter === center
                                                                ? "bg-amber-50 dark:bg-amber-500/10"
                                                                : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={filters.regionalCenter === center}
                                                            onChange={() => setFilters(f => ({ ...f, regionalCenter: f.regionalCenter === center ? '' : center }))}
                                                            className="w-3.5 h-3.5 rounded border-slate-300 accent-amber-500 cursor-pointer shrink-0"
                                                        />
                                                        <span className="text-[13px] font-medium text-foreground truncate">{center}</span>
                                                    </label>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Subject ── */}
                            {filterOptions?.subjects?.length > 0 && (
                                <div>
                                    <button
                                        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                                        onClick={() => toggleSection('subject')}
                                    >
                                        <span>Subject</span>
                                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", openSections.subject && "rotate-180")} />
                                    </button>
                                    {openSections.subject && (
                                        <div className="space-y-0.5 mb-3 max-h-48 overflow-y-auto">
                                            {filterOptions.subjects
                                                .filter((s: string) => !filterSearch || s.toLowerCase().includes(filterSearch.toLowerCase()))
                                                .map((subj: string) => (
                                                    <label
                                                        key={subj}
                                                        className={cn(
                                                            "flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer transition-colors",
                                                            filters.subject === subj
                                                                ? "bg-cyan-50 dark:bg-cyan-500/10"
                                                                : "hover:bg-slate-100 dark:hover:bg-white/5"
                                                        )}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={filters.subject === subj}
                                                            onChange={() => setFilters(f => ({ ...f, subject: f.subject === subj ? '' : subj }))}
                                                            className="w-3.5 h-3.5 rounded border-slate-300 accent-cyan-500 cursor-pointer shrink-0"
                                                        />
                                                        <span className="text-[13px] font-medium text-foreground truncate">{subj}</span>
                                                    </label>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {activeFilterCount > 0 && (
                            <div className="p-3 border-t border-border shrink-0">
                                <button
                                    onClick={() => setFilters({ status: '', programme: '', regionalCenter: '', importBatchId: '', source: '', subject: '' })}
                                    className="w-full h-8 rounded-lg text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors border border-red-200 dark:border-red-500/20"
                                >
                                    Clear all {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Data Table */}
                <div className="bg-background rounded-xl overflow-hidden min-w-0 border border-border shadow-sm flex flex-col">
                    <div className="overflow-auto scrollbar-thin max-h-[calc(100vh-280px)]">
                        <table className="w-full min-w-[1000px] border-collapse relative">
                            <thead className="sticky top-0 z-10 shadow-sm">
                                <tr className="border-b border-border bg-slate-50 dark:bg-slate-800">
                                    {hasFullStudentAccess && (
                                        <th className="p-2 text-left w-10 border-r border-border bg-slate-100 dark:bg-slate-800">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.length === students.length && students.length > 0}
                                                onChange={handleSelectAll}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-white/20 bg-white/5"
                                            />
                                        </th>
                                    )}
                                    {activeColumns.map(col => (
                                        <th
                                            key={col.id}
                                            className={cn(
                                                "p-2 text-left text-[14px] font-bold text-slate-500 dark:text-slate-200 border-r border-border last:border-r-0 whitespace-nowrap bg-slate-100 dark:bg-slate-800",
                                                col.id === 'actions' && "sticky right-0 z-20 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)] border-l border-border"
                                            )}
                                        >
                                            {col.id === 'assignedTo' && !hasFullStudentAccess ? 'Your Role' : col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {isLoading ? (
                                    Array(8).fill(0).map((_, i) => (
                                        <tr key={i} className="border-b border-border">
                                            <td className="p-4"><Skeleton className="h-4 w-4" /></td>
                                            {activeColumns.map(col => (
                                                <td key={col.id} className="p-4"><Skeleton className="h-4 w-full" /></td>
                                            ))}
                                        </tr>
                                    ))
                                ) : students.length === 0 ? (
                                    <tr>
                                        <td colSpan={activeColumns.length + (hasFullStudentAccess ? 1 : 0)} className="p-12 text-center">
                                            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                                            <p className="text-lg font-medium mb-2">No orders found</p>
                                            <p className="text-muted-foreground mb-4">
                                                {hasFullStudentAccess
                                                    ? (search || Object.values(filters).some(Boolean)
                                                        ? 'Try adjusting your search or filters'
                                                        : 'Get started by importing orders or sharing a form')
                                                    : 'No orders have been assigned to you yet'}
                                            </p>
                                            {hasFullStudentAccess && (
                                                <Link href="/import">
                                                    <Button variant="outline">Import Orders</Button>
                                                </Link>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    students.map((student: any) => {
                                        const r = getStudentRow(student)
                                        return (
                                            <tr
                                                key={r.id}
                                                className="group/row border-b border-border hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors"
                                            >
                                                {/* Checkbox (Admin/leader) */}
                                                {hasFullStudentAccess && (
                                                    <td className="p-2 border-r border-border">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.includes(r.id)}
                                                            onChange={() => handleSelect(r.id)}
                                                            className="w-4 h-4 rounded border-slate-300 dark:border-white/20 bg-white/5 cursor-pointer"
                                                        />
                                                    </td>
                                                )}
                                                
                                                {/* Render Active Columns dynamically */}
                                                {activeColumns.map(col => renderCell(col, r, student))}
                                                
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.totalPages > 1 && (
                        <div className="p-4 border-t border-white/10 flex items-center justify-between mt-auto">
                            <p className="text-sm text-muted-foreground hidden sm:block">
                                Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, pagination.total)} of {formatNumber(pagination.total)}
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
                                            if (v >= 1 && v <= pagination.totalPages) { setPage(v); setPageInput(String(v)) }
                                            else setPageInput(String(page))
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                const v = parseInt(pageInput)
                                                if (v >= 1 && v <= pagination.totalPages) { setPage(v); setPageInput(String(v)) }
                                                else setPageInput(String(page))
                                            }
                                        }}
                                        className="w-12 px-2 py-1 text-sm text-center bg-white/5 border border-white/10 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <span className="text-sm text-muted-foreground">of {pagination.totalPages}</span>
                                </div>
                                <Button variant="outline" size="sm" disabled={page === pagination.totalPages} onClick={() => { const n = page + 1; setPage(n); setPageInput(String(n)) }}>
                                    Next<ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* EDIT MODE COLUMN PANEL */}
                {showColumnPanel && hasFullStudentAccess && (
                    <div className="glass rounded-xl border border-primary/20 sticky top-6 h-fit bg-slate-50 dark:bg-[#0f172a]/95 flex flex-col shadow-2xl animate-fade-in self-start relative z-10 w-full min-w-[280px]">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5 rounded-t-xl">
                            <h2 className="font-semibold flex items-center gap-2 text-[15px]">
                                <Settings className="w-4 h-4 text-primary" /> Manage Columns
                            </h2>
                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => setShowColumnPanel(false)}>
                                <X className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        
                        <div className="p-4 max-h-[70vh] overflow-y-auto overflow-x-hidden space-y-6">
                            
                            {/* Active Columns */}
                            <div>
                                <h3 className="font-medium text-xs text-muted-foreground mb-3 uppercase tracking-wider">Active Columns</h3>
                                <div className="space-y-1.5 list-none">
                                    {activeColumns.map((col, idx) => (
                                        <li key={col.id} className="flex items-center gap-2 p-1.5 rounded-md border border-border bg-background hover:border-primary/30 transition-colors shadow-sm">
                                            <div className="flex flex-col gap-0.5 w-5 shrink-0">
                                                <button onClick={() => moveColumn(idx, 'up')} disabled={idx === 0} className="text-slate-400 hover:text-foreground disabled:opacity-30"><GripVertical className="w-2.5 h-2.5 mx-auto rotate-90"/></button>
                                                <button onClick={() => moveColumn(idx, 'down')} disabled={idx === activeColumns.length - 1} className="text-slate-400 hover:text-foreground disabled:opacity-30"><GripVertical className="w-2.5 h-2.5 mx-auto rotate-90"/></button>
                                            </div>
                                            <span className="text-xs font-medium truncate flex-1 leading-tight">{col.label}</span>
                                            {col.locked ? (
                                                <div className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground bg-muted/50 shrink-0" title="Core field, cannot hide">
                                                    <Lock className="w-3 h-3" />
                                                </div>
                                            ) : (
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 shrink-0" onClick={() => removeColumn(col.id)} title="Hide Column">
                                                    <EyeOff className="w-3 h-3" />
                                                </Button>
                                            )}
                                        </li>
                                    ))}
                                </div>
                            </div>

                            {/* Hidden Columns */}
                            {unassignedColumnDefaults.length > 0 && (
                                <div>
                                    <h3 className="font-medium text-xs text-muted-foreground mb-3 uppercase tracking-wider border-t border-border pt-4">Hidden Standard Columns</h3>
                                    <div className="space-y-1.5 flex flex-wrap gap-1.5">
                                        {unassignedColumnDefaults.map(col => (
                                            <Button key={col.id} variant="outline" size="sm" className="h-7 text-xs gap-1.5 rounded-md flex-shrink-0" onClick={() => addColumn(col)}>
                                                <Eye className="w-3 h-3 text-muted-foreground" /> {col.label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Custom Column Adder */}
                            <div>
                                <h3 className="font-medium text-xs text-muted-foreground mb-3 uppercase tracking-wider border-t border-border pt-4">Add Custom Column</h3>
                                <form onSubmit={handleAddCustomColumn} className="space-y-2.5">
                                    <div>
                                        <Label className="text-[11px] text-muted-foreground mb-1 block">Column Field Label</Label>
                                        <Input 
                                            placeholder="e.g. Delivery Type" 
                                            value={newColumnLabel} 
                                            onChange={e => setNewColumnLabel(e.target.value)}
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>
                                    <Button type="submit" variant="secondary" size="sm" className="w-full gap-2 h-8 text-xs">
                                        <Plus className="w-3 h-3" /> Add from Details
                                    </Button>
                                    <p className="text-[10px] text-muted-foreground leading-tight px-1">
                                        Reads the label literally from the Order's nested fields schema.
                                    </p>
                                </form>
                            </div>
                            
                        </div>
                    </div>
                )}
            </div>

            {/* Assign Confirmation Modal */}
            {showAssignModal && assignmentDraft && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={closeAssignModal}>
                    <div className="glass rounded-2xl p-6 max-w-lg w-full border border-amber-500/20" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4 mb-5">
                            <div>
                                <h3 className="text-lg font-semibold">Assign to {assignmentDraft.member.fullName}</h3>
                                <p className="text-sm text-muted-foreground mt-1">Review assigning this order to {assignmentDraft.member.fullName}.</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={closeAssignModal}>
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        {/* Order summary (read-only info) */}
                        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 mb-5">
                            <div className="flex items-start justify-between gap-4 text-sm">
                                <span className="text-muted-foreground">Student</span>
                                <span className="font-medium text-right">{assignmentDraft.student.name}</span>
                            </div>
                            <div className="flex items-start justify-between gap-4 text-sm">
                                <span className="text-muted-foreground">Requirement</span>
                                <span className="font-medium text-right">{assignmentDraft.student.requirement || '—'}</span>
                            </div>
                            <div className="flex items-start justify-between gap-4 text-sm">
                                <span className="text-muted-foreground">Assigning To</span>
                                <span className="font-medium text-right">
                                    {assignmentDraft.member.fullName}
                                    <span className="text-muted-foreground font-normal ml-1">({guideRoleLabel(assignmentDraft.member.staffRole)})</span>
                                </span>
                            </div>
                            {assignmentDraft.student.decidedPrice && (
                                <div className="flex items-start justify-between gap-4 text-sm border-t border-border pt-3">
                                    <span className="text-muted-foreground">Decided Price</span>
                                    <span className="font-semibold text-amber-400 text-right">{formatPrice(assignmentDraft.student.decidedPrice)}</span>
                                </div>
                            )}
                        </div>

                        <form
                            onSubmit={e => {
                                e.preventDefault()
                                handleAssignSubmit()
                            }}
                            className="space-y-5"
                        >

                            <div className="flex items-center justify-end gap-3">
                                <Button type="button" variant="outline" onClick={closeAssignModal} disabled={assignMutation.isPending}>Cancel</Button>
                                <Button type="submit" className="gap-2 gradient-primary text-white" disabled={assignMutation.isPending}>
                                    {assignMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                                    Confirm Assignment
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
                    <div className="glass rounded-2xl p-6 max-w-md w-full mx-4 border border-red-500/20">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                                <Trash2 className="w-6 h-6 text-red-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">Delete Orders</h3>
                                <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6">
                            Are you sure you want to permanently delete <span className="font-medium text-foreground">{selectedIds.length}</span> order{selectedIds.length > 1 ? 's' : ''}?
                        </p>
                        <div className="flex items-center justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={bulkDeleteMutation.isPending}>Cancel</Button>
                            <Button
                                variant="destructive"
                                onClick={() => { bulkDeleteMutation.mutate(selectedIds); setShowDeleteConfirm(false) }}
                                disabled={bulkDeleteMutation.isPending}
                                className="gap-2"
                            >
                                <Trash2 className="w-4 h-4" />Yes, Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
