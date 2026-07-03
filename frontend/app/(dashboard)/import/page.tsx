'use client'

import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
    Upload,
    FileSpreadsheet,
    CheckCircle,
    XCircle,
    AlertCircle,
    ArrowRight,
    ArrowLeft,
    Loader2,
    Download,
    Clock,
    RefreshCw,
    Trash2,
    PlayCircle,
    CheckSquare,
    Check,
    HelpCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { importAPI } from '@/lib/api'
import { formatNumber, formatDateTime } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { io } from 'socket.io-client'

type ImportStep = 'upload' | 'mapping' | 'processing' | 'complete'

export default function ImportPage() {
    const { toast } = useToast()

    // State
    const [step, setStep] = useState<ImportStep>('upload')
    const [importType, setImportType] = useState<'STUDENTS' | 'LEADS'>('STUDENTS')
    const [uploadData, setUploadData] = useState<any>(null)
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
    const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update' | 'force'>('force')
    const [progress, setProgress] = useState({ progress: 0, imported: 0, failed: 0 })
    const [result, setResult] = useState<any>(null)
    // Track which import IDs are being deleted (background delete runs after HTTP response)
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

    // Upload progress popup state
    const [uploadingFile, setUploadingFile] = useState<{ name: string; size: number } | null>(null)
    const [uploadPct, setUploadPct] = useState(0)       // 0-100 = uploading, -1 = analysing

    // Fetch import history
    const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery({
        queryKey: ['import-history'],
        queryFn: async () => {
            const response = await importAPI.getHistory({ page: 1, limit: 10 })
            return response.data.data
        },
    })

    // Delete import mutation
    const deleteMutation = useMutation({
        mutationFn: async ({ importId, deleteRecords = false }: { importId: string; deleteRecords?: boolean }) => {
            // Mark this row as deleting BEFORE the request
            setDeletingIds(prev => new Set(prev).add(importId))
            const response = await importAPI.delete(importId, deleteRecords)
            return { data: response.data, importId, deleteRecords }
        },
        onSuccess: ({ data, importId, deleteRecords }) => {
            if (deleteRecords) {
                // Background delete: keep spinner on, poll history until the row disappears
                const poll = setInterval(() => {
                    refetchHistory().then((res: any) => {
                        const stillExists = res.data?.data?.some((h: any) => h.id === importId)
                        if (!stillExists) {
                            clearInterval(poll)
                            setDeletingIds(prev => { const s = new Set(prev); s.delete(importId); return s })
                            toast({ title: 'Deleted', description: 'All records have been permanently removed.', variant: 'success' })
                        }
                    })
                }, 3000) // poll every 3s
                // Safety: stop after 10 min no matter what
                setTimeout(() => {
                    clearInterval(poll)
                    setDeletingIds(prev => { const s = new Set(prev); s.delete(importId); return s })
                    refetchHistory()
                }, 600000)
            } else {
                setDeletingIds(prev => { const s = new Set(prev); s.delete(importId); return s })
                refetchHistory()
                toast({ title: 'Import record deleted', description: 'The import history entry has been removed.', variant: 'success' })
            }
        },
        onError: (error: any, { importId }: any) => {
            setDeletingIds(prev => { const s = new Set(prev); s.delete(importId); return s })
            toast({
                title: 'Delete failed',
                description: error.response?.data?.message || 'Failed to delete import',
                variant: 'destructive',
            })
        },
    })

    // Resume import mutation
    const resumeMutation = useMutation({
        mutationFn: async (importId: string) => {
            const response = await importAPI.resume(importId)
            return response.data.data
        },
        onSuccess: (data) => {
            setUploadData(data)
            setImportType(data.importType)
            // Use suggested mappings array exactly
            setColumnMapping(data.suggestedMappings || {})
            setStep('mapping')
            toast({
                title: 'Import resumed',
                description: `Continuing with ${data.fileName}`,
                variant: 'success',
            })
        },
        onError: (error: any) => {
            toast({
                title: 'Resume failed',
                description: error.response?.data?.message || 'Failed to resume import',
                variant: 'destructive',
            })
            refetchHistory()
        },
    })

    // Upload mutation
    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            setUploadingFile({ name: file.name, size: file.size })
            setUploadPct(0)
            
            let simInterval: NodeJS.Timeout

            const response = await importAPI.upload(file, importType, (pct) => {
                if (pct < 100) {
                    // Phase 1: Network Upload (0% -> 50%)
                    setUploadPct(Math.round(pct * 0.5))
                } else if (pct === 100) {
                    // Phase 2: Server Processing (50% -> 95%)
                    setUploadPct(prev => {
                        // Prevent starting multiple intervals
                        if (prev > 50) return prev;
                        
                        simInterval = setInterval(() => {
                            setUploadPct(curr => {
                                const next = curr + (Math.random() * 1.5)
                                return next >= 95 ? 95 : next // Cap at 95% until complete
                            })
                        }, 600)
                        return 50
                    })
                }
            })
            
            // Phase 3: Complete!
            if (simInterval!) clearInterval(simInterval!)
            setUploadPct(100)
            
            // Brief pause to let user see 100% before transitioning
            await new Promise(r => setTimeout(r, 600))

            return response.data.data
        },
        onSuccess: (data) => {
            setUploadingFile(null)
            setUploadPct(0)
            setUploadData(data)
            setColumnMapping(data.suggestedMappings || {})
            setStep('mapping')
            toast({
                title: 'File uploaded',
                description: `${data.totalRows} rows found`,
                variant: 'success',
            })
        },
        onError: (error: any) => {
            setUploadingFile(null)
            setUploadPct(0)
            const status = error.response?.status
            const msg = error.response?.data?.message
                || (status === 413 ? 'File too large — ask admin to increase nginx upload limit' : null)
                || (status === 400 ? 'File type not accepted' : null)
                || (status ? `Server error ${status}` : 'Network error — file may be too large for server')
            toast({
                title: 'Upload failed',
                description: msg,
                variant: 'destructive',
            })
        },
    })

    // Process mutation
    const processMutation = useMutation({
        mutationFn: async () => {
            const response = await importAPI.process(uploadData.importId, {
                columnMapping,
                duplicateHandling,
                filePath: uploadData.filePath,
            })
            return response.data.data
        },
        onSuccess: (data) => {
            // Save successful mappings for learning
            importAPI.saveMapping(
                Object.fromEntries(
                    Object.entries(columnMapping)
                        .map(([idx, val]) => [uploadData.headers[Number(idx)], val])
                )
            ).catch(err => console.error('Failed to save mapping memory', err));

            setResult(data)
            setStep('complete')
            refetchHistory()
            toast({
                title: 'Import complete!',
                description: `${data.imported} records imported`,
                variant: 'success',
            })
        },
        onError: (error: any) => {
            toast({
                title: 'Import failed',
                description: error.response?.data?.message || 'Failed to process import',
                variant: 'destructive',
            })
        },
    })

    // Dropzone config
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            uploadMutation.mutate(acceptedFiles[0])
        }
    }, [uploadMutation])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls'],
            'text/csv': ['.csv'],
        },
        maxFiles: 1,
        maxSize: 100 * 1024 * 1024,
    })

    // Warn user if they try to leave during processing
    useEffect(() => {
        if (step !== 'processing') return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = 'Import is in progress. Leaving now will not cancel it — it will continue on the server.'
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [step])

    // Socket.IO for real-time progress
    useEffect(() => {
        if (step === 'processing' && uploadData?.importId) {
            const hostname = window.location.hostname
            const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1'
                || /^192\.168\./.test(hostname) || /^10\./.test(hostname)
            const backendHost = isLocalDev
                ? `${window.location.protocol}//${hostname}:5000`
                : window.location.origin

            const socket = io(backendHost, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 2000,
                reconnectionDelayMax: 10000,
            })

            socket.on('connect', () => {
                socket.emit('join-import-room', uploadData.importId)
            })

            socket.on('import-progress', (data) => {
                setProgress(prev => ({
                    progress: Math.max(prev.progress, data.progress || 0),
                    imported: Math.max(prev.imported, data.imported || 0),
                    failed: Math.max(prev.failed, data.failed || 0),
                }))
            })

            socket.on('import-complete', (data) => {
                setResult(data)
                setProgress({
                    progress: 100,
                    imported: data.imported || 0,
                    failed: data.failed || 0,
                })
                setStep('complete')
                refetchHistory()
            })

            socket.on('connect_error', (error) => {
                console.error('Socket connection error:', error)
            })

            // Polling fallback
            const pollInterval = setInterval(async () => {
                try {
                    const response = await importAPI.getDetails(uploadData.importId)
                    const importData = response.data.data

                    if (importData) {
                        const total = importData.totalRecords || 1
                        const processed = (importData.importedCount || 0) + (importData.skippedCount || 0) + (importData.failedCount || 0)
                        const progressPercent = Math.min(Math.round((processed / total) * 100), 99)

                        setProgress(prev => ({
                            progress: Math.max(prev.progress, progressPercent),
                            imported: Math.max(prev.imported, importData.importedCount || 0),
                            failed: Math.max(prev.failed, importData.failedCount || 0),
                        }))

                        if (importData.status === 'COMPLETED' || importData.status === 'FAILED') {
                            clearInterval(pollInterval)
                        }
                    }
                } catch (error) {
                    console.error('Polling error:', error)
                }
            }, 1000)

            return () => {
                socket.disconnect()
                clearInterval(pollInterval)
            }
        }
    }, [step, uploadData?.importId])

    const handleStartProcessing = () => {
        setStep('processing')
        processMutation.mutate()
    }

    const handleReset = () => {
        setStep('upload')
        setUploadData(null)
        setColumnMapping({})
        setProgress({ progress: 0, imported: 0, failed: 0 })
        setResult(null)
    }

    // --- MAPPING UI HELPERS ---

    const getMappingState = (result: any) => {
        const val = columnMapping[result.index]
        if (!val || val === '__skip__') return { type: 'skipped', color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-100/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700' }
        if (val.startsWith('customField.')) return { type: 'custom', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-500/30' }
        // If user changed it or system is confident
        if (val !== result.field || result.confidence >= 65) return { type: 'mapped', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-500/30' }
        return { type: 'review', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-500/30' }
    }

    const mappingStats = { mapped: 0, custom: 0, review: 0, skipped: 0 }
    if (uploadData?.mappingResults) {
        uploadData.mappingResults.forEach((r: any) => {
            const state = getMappingState(r).type
            mappingStats[state as keyof typeof mappingStats]++
        })
    }

    return (
        <>
        <div className="space-y-6 animate-fade-in">
            <div>
                <h1 className="text-xl md:text-2xl font-bold">Import Data</h1>
                <p className="text-sm text-muted-foreground">Upload Excel files to import order or lead data</p>
            </div>

            <div className="glass rounded-xl p-3 md:p-4">
                <div className="flex items-center justify-between max-w-2xl mx-auto overflow-x-auto">
                    {[
                        { key: 'upload', label: 'Upload', icon: Upload },
                        { key: 'mapping', label: 'Smart Map', icon: FileSpreadsheet },
                        { key: 'processing', label: 'Process', icon: Clock },
                        { key: 'complete', label: 'Complete', icon: CheckCircle },
                    ].map((s, i) => {
                        const isActive = s.key === step
                        const isPast = ['upload', 'mapping', 'processing', 'complete'].indexOf(step) > i

                        return (
                            <div key={s.key} className="flex items-center">
                                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isActive
                                    ? 'bg-primary/20 text-primary'
                                    : isPast
                                        ? 'text-emerald-400'
                                        : 'text-muted-foreground'
                                    }`}>
                                    <s.icon className="w-5 h-5" />
                                    <span className="font-medium hidden sm:inline">{s.label}</span>
                                </div>
                                {i < 3 && (
                                    <ArrowRight className={`w-5 h-5 mx-2 ${isPast ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Step 1: Upload */}
            {step === 'upload' && (
                <div className="glass rounded-xl p-6 space-y-6">


                    <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${isDragActive ? 'border-primary bg-primary/10' : 'border-white/20 hover:border-primary/50 hover:bg-white/5'}`}>
                        <input {...getInputProps()} />
                        {uploadMutation.isPending ? (
                            <div className="flex flex-col items-center">
                                <Loader2 className="w-10 h-10 text-primary mb-3 animate-spin" />
                                <p className="text-base font-medium">Uploading & Analyzing...</p>
                                <p className="text-sm text-muted-foreground">Please wait while smart mapper analyzes columns</p>
                            </div>
                        ) : (
                            <>
                                <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? 'text-primary' : 'text-muted-foreground'}`} />
                                <p className="text-base font-medium mb-1">{isDragActive ? 'Drop your file here' : 'Drag & drop your Excel file here'}</p>
                                <p className="text-sm text-muted-foreground mb-3">or click to browse</p>
                                <p className="text-xs text-muted-foreground">Supports .xlsx, .xls, .csv files up to 100MB</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Step 2: Smart Mapping */}
            {step === 'mapping' && uploadData && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-5 glass rounded-xl gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/20 text-primary rounded-xl">
                                <FileSpreadsheet className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">{uploadData.fileName}</h3>
                                <p className="text-sm text-muted-foreground">{formatNumber(uploadData.totalRows)} rows detected</p>
                            </div>
                        </div>
                        
                        {/* Summary Bar */}
                        <div className="flex flex-wrap gap-3">
                            <div className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-sm flex items-center gap-2 font-medium shadow-sm">
                                <Check className="w-4 h-4"/> {mappingStats.mapped} Auto-Mapped
                            </div>
                            <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-500 rounded-lg text-sm flex items-center gap-2 font-medium shadow-sm">
                                <FileSpreadsheet className="w-4 h-4"/> {mappingStats.custom} Custom Fields
                            </div>
                            <div className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 text-yellow-600 dark:text-yellow-500 rounded-lg text-sm flex items-center gap-2 font-medium shadow-sm">
                                <HelpCircle className="w-4 h-4"/> {mappingStats.review} Review
                            </div>
                            <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-500/10 border border-slate-200 dark:border-slate-500/20 text-slate-600 dark:text-slate-400 rounded-lg text-sm font-medium shadow-sm">
                                {mappingStats.skipped} Skipped
                            </div>
                        </div>
                    </div>

                    <div className="glass rounded-xl p-6">
                        <h3 className="font-semibold mb-4 text-lg">Intelligent Column Mapping</h3>
                        <p className="text-sm text-muted-foreground mb-6">
                            Our smart AI has matched your columns automatically. Unknown columns are marked as <span className="text-amber-500">Custom Fields</span> so you never lose any data.
                        </p>

                        <div className="space-y-3">
                            {uploadData.mappingResults?.map((res: any) => {
                                const state = getMappingState(res)
                                const isCustom = columnMapping[res.index]?.startsWith('customField.')
                                
                                return (
                                    <div key={res.index} className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-sm ${state.bg}`}>
                                        <div className="flex-1 min-w-0 flex items-center gap-3">
                                            <div className="min-w-[150px]">
                                                <p className="text-sm font-bold truncate text-foreground" title={res.displayLabel}>
                                                    {res.displayLabel}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`text-[10px] uppercase font-bold tracking-wider ${state.color}`}>Match: {res.matchType}</span>
                                                    {res.confidence > 0 && (
                                                        <span className={`text-[10px] uppercase font-bold tracking-wider ${res.confidence >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                                            {res.confidence}% Conf.
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block opacity-40" />
                                        </div>

                                        <div className="flex-shrink-0 w-full sm:w-64">
                                            <div className="relative">
                                                <select
                                                    value={columnMapping[res.index] || '__skip__'}
                                                    onChange={(e) => setColumnMapping({ ...columnMapping, [res.index]: e.target.value })}
                                                    className={`w-full h-10 pl-3 pr-8 rounded-lg bg-white dark:bg-black/40 border border-slate-200 dark:border-white/10 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all cursor-pointer font-semibold shadow-sm appearance-none ${state.color}`}
                                                >
                                                    <option value="__skip__" className="text-slate-500">-- Skip Column --</option>
                                                    <optgroup label="Custom Field (No loss)" className="text-foreground">
                                                        <option value={`customField.${res.customFieldKey || 'unknown'}`} className="text-amber-600 dark:text-amber-500">
                                                            📦 Custom Field: {res.customFieldKey}
                                                        </option>
                                                    </optgroup>
                                                    <optgroup label="CRM Fields" className="text-foreground">
                                                        {uploadData.availableFields.map((field: string) => (
                                                            <option key={field} value={field} className="text-foreground">✓ {field}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="glass rounded-xl p-6">
                        <h3 className="font-semibold mb-4">Duplicate Handling Strategy</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <Button variant={duplicateHandling === 'force' ? 'default' : 'outline'} onClick={() => setDuplicateHandling('force')} className="gap-2">
                                Import As-Is
                            </Button>
                            <Button variant={duplicateHandling === 'skip' ? 'default' : 'outline'} onClick={() => setDuplicateHandling('skip')} className="gap-2">
                                Skip Duplicates
                            </Button>
                            <Button variant={duplicateHandling === 'update' ? 'default' : 'outline'} onClick={() => setDuplicateHandling('update')} className="gap-2">
                                Update Existing Records
                            </Button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <Button variant="ghost" onClick={handleReset} className="gap-2">
                            <ArrowLeft className="w-4 h-4" /> Cancel
                        </Button>
                        <Button onClick={handleStartProcessing} className="gap-2 gradient-primary text-white shadow-md transition-all">
                            Start Data Import <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 3: Processing */}
            {step === 'processing' && (
                <div className="relative rounded-[32px] border border-slate-200 dark:border-white/5 bg-white/90 dark:bg-[#12141D]/80 backdrop-blur-3xl shadow-xl dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-500 p-14 text-center max-w-2xl mx-auto mt-10">

                    {/* Ambient glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-500/15 blur-[100px] rounded-full pointer-events-none" />

                    {/* Custom drip loader */}
                    <div className="flex justify-center mb-10 relative z-10">
                        <div className="import-loader" />
                    </div>

                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-2 relative z-10">Processing Import</h3>
                    <p className="text-slate-500 dark:text-white/45 mb-10 max-w-sm mx-auto relative z-10 text-sm leading-relaxed">
                        Importing records and handling duplicates automatically.<br/>Please do not close this window.
                    </p>

                    {/* Progress bar */}
                    <div className="max-w-sm mx-auto mb-10 relative z-10">
                        <div className="flex items-center justify-between text-xs mb-2">
                            <span className="text-slate-500 dark:text-white/50 font-medium">Progress</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold tabular-nums">{progress.progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 shadow-[0_0_8px_rgba(99,102,241,0.5)] dark:shadow-[0_0_8px_rgba(99,102,241,0.7)] transition-all duration-500 ease-out"
                                style={{ width: `${Math.max(progress.progress, 0)}%` }}
                            />
                        </div>
                        {uploadData?.totalRows && (
                            <p className="text-[11px] text-slate-400 dark:text-white/30 mt-2 tabular-nums">
                                {formatNumber(progress.imported + progress.failed)} of {formatNumber(uploadData.totalRows)} rows
                            </p>
                        )}
                    </div>

                    {/* Live counters */}
                    <div className="flex items-stretch justify-center gap-4 relative z-10">
                        <div className="flex-1 max-w-[140px] py-5 px-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
                            <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight mb-1">{formatNumber(progress.imported)}</p>
                            <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Imported</p>
                        </div>
                        <div className="flex-1 max-w-[140px] py-5 px-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
                            <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight mb-1">{formatNumber(progress.failed)}</p>
                            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-widest">Errors</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 4: Complete */}
            {step === 'complete' && result && (
                <div className="relative rounded-[32px] border border-slate-200 dark:border-white/5 bg-white/90 dark:bg-[#12141D]/80 backdrop-blur-3xl shadow-xl dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-95 duration-500 p-12 text-center max-w-3xl mx-auto mt-10">

                    {/* Ambient glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 bg-emerald-500/5 dark:bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

                    {/* Success icon */}
                    <div className="relative w-20 h-20 mx-auto mb-7 flex items-center justify-center">
                        <div className="absolute inset-0 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full animate-ping opacity-30" />
                        <div className="relative w-20 h-20 bg-emerald-50 dark:bg-[#0b1f15] border border-emerald-500/20 dark:border-emerald-500/30 rounded-full flex items-center justify-center shadow-[0_0_32px_rgba(16,185,129,0.1)] dark:shadow-[0_0_32px_rgba(16,185,129,0.25)]">
                            <CheckCircle className="w-10 h-10 text-emerald-500 dark:text-emerald-400" />
                        </div>
                    </div>

                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight mb-2 relative z-10">Import Successfully Completed</h3>
                    <p className="text-slate-500 dark:text-white/45 mb-10 max-w-md mx-auto relative z-10 text-sm">
                        Your data has been parsed, deduplicated, and securely stored.
                    </p>

                    {/* Stat cards — 4 equal columns */}
                    <div className="grid grid-cols-4 gap-3 mb-10 relative z-10">
                        {[
                            { value: result.imported,        label: 'New',     color: 'emerald' },
                            { value: result.updated  || 0,  label: 'Updated',  color: 'blue'    },
                            { value: result.skipped  || 0,  label: 'Skipped',  color: 'amber'   },
                            { value: result.failed,          label: 'Failed',   color: 'red'     },
                        ].map(({ value, label, color }) => (
                            <div key={label} className={`relative flex flex-col items-center justify-center py-6 px-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-${color}-500/20 overflow-hidden`}>
                                {/* top accent line */}
                                <div className={`absolute top-0 inset-x-0 h-[2px] bg-${color}-500/60 dark:bg-${color}-400/60 rounded-t-2xl`} />
                                <p className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight leading-none mb-3">
                                    {formatNumber(value)}
                                </p>
                                <span className={`text-[10px] font-bold uppercase tracking-widest text-${color}-600 dark:text-${color}-400`}>{label}</span>
                            </div>
                        ))}
                    </div>

                    {result.errors?.length > 0 && (
                        <div className="mb-10 text-left relative z-10">
                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 p-3.5 rounded-t-2xl border-x border-t border-red-200 dark:border-red-500/20">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <h4 className="text-sm font-semibold">Import Errors ({formatNumber(result.errors.length)})</h4>
                            </div>
                            <div className="max-h-52 overflow-y-auto bg-red-50/50 dark:bg-[#0a0a0f]/80 border-x border-b border-red-200 dark:border-red-500/20 rounded-b-2xl p-4 text-[12px] font-mono scrollbar-thin">
                                {result.errors.map((error: any, i: number) => (
                                    <div key={i} className="mb-2.5 pb-2.5 border-b border-red-100 dark:border-white/5 last:border-0 flex gap-4">
                                        <span className="text-red-400 dark:text-white/25 shrink-0">Row {error.row}</span>
                                        <span className="text-red-600 dark:text-red-300/70">{error.error}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
                        <Button variant="outline" onClick={handleReset} className="h-11 px-7 rounded-full border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 gap-2 text-sm font-medium text-slate-700 dark:text-white/70">
                            <Upload className="w-4 h-4" /> Import Another File
                        </Button>
                        <Button onClick={() => window.location.href = importType === 'STUDENTS' ? `/import-preview?batchId=${uploadData?.importId || ''}` : '/leads'} className="h-11 px-8 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:opacity-90 text-white border-0 gap-2 text-sm font-semibold shadow-[0_0_24px_rgba(16,185,129,0.35)]">
                            View {importType === 'STUDENTS' ? 'Data' : 'Leads'} <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Import History */}
            <div className="glass rounded-xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="font-semibold">Import History</h2>
                    <Button variant="ghost" size="sm" onClick={() => refetchHistory()} className="gap-2">
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </Button>
                </div>

                <div className="overflow-x-auto rounded-lg border border-white/5">
                    <table className="w-full text-sm">
                        <thead className="bg-white/5">
                            <tr className="text-left text-muted-foreground border-b border-white/5">
                                <th className="p-3 font-medium">File Name</th>
                                <th className="p-3 font-medium">Type</th>
                                <th className="p-3 font-medium">Total</th>
                                <th className="p-3 font-medium">Imported</th>
                                <th className="p-3 font-medium">Failed</th>
                                <th className="p-3 font-medium">Status</th>
                                <th className="p-3 font-medium">Date</th>
                                <th className="p-3 font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {historyLoading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i}>
                                        <td className="p-3"><Skeleton className="h-4 w-48" /></td>
                                        <td className="p-3"><Skeleton className="h-4 w-20" /></td>
                                        <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                                        <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                                        <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                                        <td className="p-3"><Skeleton className="h-6 w-20" /></td>
                                        <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                                        <td className="p-3"><Skeleton className="h-8 w-8" /></td>
                                    </tr>
                                ))
                            ) : historyData?.imports?.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8 text-center text-muted-foreground">No import history yet</td>
                                </tr>
                            ) : (
                                historyData?.imports?.map((imp: any) => (
                                    <tr key={imp.id} className="hover:bg-white/5 transition-colors">
                                        <td className="p-3 font-medium">{imp.fileName}</td>
                                        <td className="p-3 capitalize">{imp.importType?.toLowerCase()}</td>
                                        <td className="p-3 font-mono">{formatNumber(imp.totalRecords)}</td>
                                        <td className="p-3 text-emerald-400 font-mono font-medium">{formatNumber(imp.importedCount)}</td>
                                        <td className="p-3 text-red-400 font-mono font-medium">{formatNumber(imp.failedCount)}</td>
                                        <td className="p-3">
                                            {deletingIds.has(imp.id) ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Deleting…
                                                </span>
                                            ) : (
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${imp.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : imp.status === 'PROCESSING' ? 'bg-blue-500/20 text-blue-400' : imp.status === 'FAILED' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                    {imp.status}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-muted-foreground">{formatDateTime(imp.createdAt)}</td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-1">
                                                {imp.status === 'PENDING' && (
                                                    <Button variant="ghost" size="sm" onClick={() => resumeMutation.mutate(imp.id)} disabled={resumeMutation.isPending} className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 p-2 h-8 w-8" title="Resume import">
                                                        {resumeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                                    </Button>
                                                )}
                                                {['PENDING', 'FAILED', 'COMPLETED', 'PROCESSING'].includes(imp.status) && (
                                                    <Button
                                                        variant="ghost" size="sm"
                                                        disabled={deletingIds.has(imp.id)}
                                                        onClick={() => {
                                                            if (imp.status === 'COMPLETED') {
                                                                if (confirm(`Delete this import?\n\nClick OK to also delete ${formatNumber(imp.importedCount)} imported records.\nClick Cancel to go back.`)) {
                                                                    if (confirm(`⚠️ WARNING: This will permanently delete ${formatNumber(imp.importedCount)} student records!\n\nAre you absolutely sure?`)) {
                                                                        deleteMutation.mutate({ importId: imp.id, deleteRecords: true })
                                                                    }
                                                                }
                                                            } else {
                                                                if (confirm('Are you sure you want to delete this import record?')) {
                                                                    deleteMutation.mutate({ importId: imp.id })
                                                                }
                                                            }
                                                        }}
                                                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 h-8 w-8"
                                                        title={imp.status === 'COMPLETED' ? 'Delete import and all records' : 'Delete import'}
                                                    >
                                                        {deletingIds.has(imp.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

            {/* ── Unique Minimalist Glass Upload Modal ─────────────────── */}
            {uploadingFile && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050505]/60 backdrop-blur-md animate-in fade-in duration-500">
                    <div className="relative w-[320px] rounded-[36px] border border-white/5 bg-white/[0.02] backdrop-blur-3xl shadow-[0_24px_80px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-500">
                        
                        {/* Soft inner glow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/10 blur-[60px] rounded-full pointer-events-none" />

                        <div className="flex flex-col items-center pt-10 pb-10 px-6 text-center relative z-10">
                            
                            {/* Single Clean Circular Progress */}
                            <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                                <svg className="absolute inset-0 w-full h-full -rotate-90 overflow-visible" viewBox="0 0 100 100">
                                    <circle 
                                        cx="50" cy="50" r="47" fill="transparent" 
                                        stroke="rgba(255,255,255,0.03)" strokeWidth="2" 
                                    />
                                    <circle 
                                        cx="50" cy="50" r="47" fill="transparent" 
                                        stroke="url(#progressGradient)" strokeWidth="4" strokeLinecap="round"
                                        className="transition-all duration-300 ease-out" 
                                        style={{ filter: 'drop-shadow(0 0 10px rgba(16,185,129,0.4))' }}
                                        strokeDasharray={`${(uploadPct * 295.31) / 100} 295.31`} 
                                    />
                                    <defs>
                                        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#34d399" />
                                            <stop offset="100%" stopColor="#059669" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                
                                {/* Inner Content */}
                                <div className="flex flex-col items-center justify-center gap-1">
                                    <FileSpreadsheet className={`w-7 h-7 text-emerald-400/80 ${uploadPct >= 50 && uploadPct < 100 ? 'animate-pulse' : ''}`} />
                                    <span className="text-xl font-bold text-white tracking-tight">
                                        {Math.round(uploadPct)}<span className="text-xs text-white/50 ml-0.5">%</span>
                                    </span>
                                </div>
                            </div>

                            <h3 className="text-base font-semibold text-white/90 mb-1.5">
                                {uploadPct >= 100 ? 'Upload Complete' : uploadPct >= 50 ? 'Processing Data...' : 'Uploading File...'}
                            </h3>
                            <p className="text-xs text-white/40 max-w-[220px] truncate">
                                {uploadingFile.name}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
