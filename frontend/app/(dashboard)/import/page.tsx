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
    const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update'>('skip')
    const [progress, setProgress] = useState({ progress: 0, imported: 0, failed: 0 })
    const [result, setResult] = useState<any>(null)

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
            const response = await importAPI.delete(importId, deleteRecords)
            return response.data
        },
        onSuccess: (data) => {
            refetchHistory()
            toast({
                title: 'Import deleted',
                description: data.data?.deletedOrdersCount
                    ? `Removed ${data.data.deletedOrdersCount} records`
                    : 'The import has been removed',
                variant: 'success',
            })
        },
        onError: (error: any) => {
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
            const response = await importAPI.upload(file, importType)
            return response.data.data
        },
        onSuccess: (data) => {
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
            toast({
                title: 'Upload failed',
                description: error.response?.data?.message || 'Failed to upload file',
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
                        <div className="flex flex-wrap items-center gap-4">
                            <Button variant={duplicateHandling === 'skip' ? 'default' : 'outline'} onClick={() => setDuplicateHandling('skip')}>
                                Skip Duplicates
                            </Button>
                            <Button variant={duplicateHandling === 'update' ? 'default' : 'outline'} onClick={() => setDuplicateHandling('update')}>
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
                <div className="glass rounded-xl p-12 text-center animate-fade-in">
                    <div className="relative w-24 h-24 mx-auto mb-8">
                        <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                        <FileSpreadsheet className="absolute inset-0 m-auto w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold mb-3">Processing Intelligent Import</h3>
                    <p className="text-muted-foreground mb-10 max-w-md mx-auto">
                        We are importing records, handling duplicates, and parsing custom fields automatically.
                    </p>

                    <div className="max-w-md mx-auto mb-8 p-6 bg-black/20 rounded-2xl border border-white/5">
                        <div className="flex items-center justify-between text-sm mb-3">
                            <span className="font-medium">Total Progress</span>
                            <span className="font-mono text-primary font-bold">{progress.progress}%</span>
                        </div>
                        <div className="h-4 bg-white/5 rounded-full overflow-hidden mb-4 border border-white/5">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-primary transition-all duration-300 ease-out relative"
                                style={{ width: `${Math.max(progress.progress, 0)}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 w-full animate-pulse"></div>
                            </div>
                        </div>
                        {uploadData?.totalRows && (
                            <p className="text-sm text-muted-foreground">
                                Processing row {(progress.imported + progress.failed).toLocaleString()} of {uploadData.totalRows.toLocaleString()}
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-center gap-8 text-sm">
                        <div className="px-6 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <p className="text-3xl font-bold text-emerald-400 font-mono mb-1">{progress.imported.toLocaleString()}</p>
                            <p className="text-emerald-500/80 font-medium tracking-wide text-xs uppercase">Imported</p>
                        </div>
                        <div className="px-6 py-4 rounded-xl bg-red-500/10 border border-red-500/20">
                            <p className="text-3xl font-bold text-red-400 font-mono mb-1">{progress.failed.toLocaleString()}</p>
                            <p className="text-red-500/80 font-medium tracking-wide text-xs uppercase">Errors</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 4: Complete */}
            {step === 'complete' && result && (
                 <div className="glass rounded-xl p-10 text-center animate-fade-in">
                 <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6 border-4 border-emerald-500/30">
                     <CheckCircle className="w-10 h-10 text-emerald-400" />
                 </div>
                 <h3 className="text-2xl font-bold mb-3">Import Successfully Completed</h3>
                 <p className="text-muted-foreground mb-8">
                     Your data has been intelligently parsed and saved.
                 </p>

                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-10">
                     <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
                         <p className="text-4xl font-bold text-emerald-400 font-mono mb-2">{formatNumber(result.imported)}</p>
                         <p className="text-sm font-medium text-emerald-500/80 uppercase tracking-wider">New</p>
                     </div>
                     <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
                         <p className="text-4xl font-bold text-blue-400 font-mono mb-2">{formatNumber(result.updated || 0)}</p>
                         <p className="text-sm font-medium text-blue-500/80 uppercase tracking-wider">Updated</p>
                     </div>
                     <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6">
                         <p className="text-4xl font-bold text-yellow-400 font-mono mb-2">{formatNumber(result.skipped || 0)}</p>
                         <p className="text-sm font-medium text-yellow-500/80 uppercase tracking-wider">Skipped</p>
                     </div>
                     <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                         <p className="text-4xl font-bold text-red-400 font-mono mb-2">{formatNumber(result.failed)}</p>
                         <p className="text-sm font-medium text-red-500/80 uppercase tracking-wider">Failed</p>
                     </div>
                 </div>

                 {result.errors?.length > 0 && (
                     <div className="max-w-3xl mx-auto mb-10 text-left">
                         <h4 className="font-semibold mb-3 flex items-center gap-2 text-red-400 bg-red-500/10 p-3 rounded-t-xl border-x border-t border-red-500/20">
                             <AlertCircle className="w-5 h-5" /> Import Errors ({result.errors.length})
                         </h4>
                         <div className="max-h-56 overflow-y-auto bg-black/40 border-x border-b border-red-500/20 rounded-b-xl p-4 text-sm font-mono scrollbar-thin">
                             {result.errors.map((error: any, i: number) => (
                                 <div key={i} className="mb-2 pb-2 border-b border-red-500/10 last:border-0 last:mb-0 last:pb-0">
                                     <span className="text-red-300/60 mr-4">Row {error.row}</span> 
                                     <span className="text-red-400">{error.error}</span>
                                 </div>
                             ))}
                         </div>
                     </div>
                 )}

                 <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                     <Button variant="outline" onClick={handleReset} className="gap-2 px-6">
                         <Upload className="w-4 h-4" /> Import Another File
                     </Button>
                     <Button onClick={() => window.location.href = importType === 'STUDENTS' ? `/import-preview?batchId=${uploadData?.importId || ''}` : '/leads'} className="gap-2 gradient-primary text-white px-8">
                         View {importType === 'STUDENTS' ? 'Import Preview' : 'Leads'} <ArrowRight className="w-4 h-4" />
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
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${imp.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : imp.status === 'PROCESSING' ? 'bg-blue-500/20 text-blue-400' : imp.status === 'FAILED' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                                {imp.status}
                                            </span>
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
                                                    <Button variant="ghost" size="sm" onClick={() => {
                                                        if (imp.status === 'COMPLETED') {
                                                            if (confirm(`Delete this import?\n\nClick OK to also delete ${imp.importedCount} imported records.\nClick Cancel to keep this message.`)) {
                                                                if (confirm(`⚠️ WARNING: This will permanently delete ${imp.importedCount} order records!\n\nAre you absolutely sure?`)) {
                                                                    deleteMutation.mutate({ importId: imp.id, deleteRecords: true })
                                                                }
                                                            }
                                                        } else {
                                                            if (confirm('Are you sure you want to delete this import?')) {
                                                                deleteMutation.mutate({ importId: imp.id })
                                                            }
                                                        }
                                                    }} disabled={deleteMutation.isPending} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 h-8 w-8" title={imp.status === 'COMPLETED' ? 'Delete import and records' : 'Delete import'}>
                                                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
    )
}

