'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { appSettingsAPI, shiprocketAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import {
    Truck, KeyRound, MapPin, Package, Settings2,
    Save, RefreshCw, CheckCircle2, AlertCircle, Eye,
    EyeOff, Loader2, Tag, Zap, TestTube2, ExternalLink, Mail,
    Plus, Trash2, Hash,
} from 'lucide-react'

type OrderIdRule = {
    requirement: string
    prefix: string
}

function normalizeOrderIdPrefix(prefix: string) {
    const normalized = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    return (normalized.replace(/\d+$/g, '') || normalized).slice(0, 8)
}

export default function SettingsPage() {
    const { user } = useAuthStore()
    const queryClient = useQueryClient()
    const { toast } = useToast()

    const isAdmin = user?.role === 'ADMIN'

    // Fetch current settings
    const { data: settingsData, isLoading } = useQuery({
        queryKey: ['app-settings'],
        queryFn: async () => (await appSettingsAPI.get()).data.data,
        enabled: isAdmin,
    })

    const sr = settingsData?.shiprocket || {}

    const [form, setForm] = useState({
        email: '',
        password: '',
        pickupLocation: '',
        defaultWeight: '',
        defaultLength: '',
        defaultWidth: '',
        defaultHeight: '',
        defaultPaymentMethod: 'Prepaid',
        hardCopyKeywordsStr: '',
        emailUser: '',
        emailPass: '',
        emailFromName: '',
        emailBodyTemplate: '',
        invoiceTemplate: '',
        orderPdfTemplate: '',
        orderIdRules: [] as OrderIdRule[],
    })
    const [showPassword, setShowPassword] = useState(false)
    const [testStatus, setTestStatus] = useState<null | 'loading' | 'success' | 'error'>(null)
    const [testMsg, setTestMsg] = useState('')

    useEffect(() => {
        if (settingsData) {
            setForm({
                email: sr.email || '',
                password: sr.passwordSet ? '••••••••' : '',
                pickupLocation: sr.pickupLocation || 'Office',
                defaultWeight: sr.defaultWeight || '0.5',
                defaultLength: sr.defaultLength || '25',
                defaultWidth: sr.defaultWidth || '20',
                defaultHeight: sr.defaultHeight || '5',
                defaultPaymentMethod: sr.defaultPaymentMethod || 'Prepaid',
                hardCopyKeywordsStr: Array.isArray(sr.hardCopyKeywords)
                    ? sr.hardCopyKeywords.join(', ')
                    : 'hard copy',
                emailUser: settingsData?.emailConfig?.user || '',
                emailPass: settingsData?.emailConfig?.passSet ? '••••••••' : '',
                emailFromName: settingsData?.emailConfig?.fromName || 'CRM Admin',
                emailBodyTemplate: settingsData?.emailConfig?.bodyTemplate || '',
                invoiceTemplate: settingsData?.emailConfig?.invoiceTemplate || '',
                orderPdfTemplate: settingsData?.orderPdfConfig?.template || '',
                orderIdRules: Array.isArray(settingsData?.orderIdRules)
                    ? settingsData.orderIdRules
                    : [],
            })
        }
    }, [settingsData])

    const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))
    const updateOrderIdRule = (index: number, updates: Partial<OrderIdRule>) => {
        setForm(f => ({
            ...f,
            orderIdRules: f.orderIdRules.map((rule, idx) => idx === index ? { ...rule, ...updates } : rule),
        }))
    }
    const addOrderIdRule = () => {
        setForm(f => ({
            ...f,
            orderIdRules: [...f.orderIdRules, { requirement: '', prefix: '' }],
        }))
    }
    const removeOrderIdRule = (index: number) => {
        setForm(f => ({
            ...f,
            orderIdRules: f.orderIdRules.filter((_, idx) => idx !== index),
        }))
    }

    const saveMutation = useMutation({
        mutationFn: () => appSettingsAPI.update({
            shiprocket: {
                email: form.email,
                password: form.password,
                pickupLocation: form.pickupLocation,
                defaultWeight: form.defaultWeight,
                defaultLength: form.defaultLength,
                defaultWidth: form.defaultWidth,
                defaultHeight: form.defaultHeight,
                defaultPaymentMethod: form.defaultPaymentMethod,
                hardCopyKeywords: form.hardCopyKeywordsStr
                    .split(',')
                    .map(s => s.trim().toLowerCase())
                    .filter(Boolean),
            },
            emailConfig: {
                user: form.emailUser,
                pass: form.emailPass,
                fromName: form.emailFromName,
                bodyTemplate: form.emailBodyTemplate,
                invoiceTemplate: form.invoiceTemplate,
            },
            orderPdfConfig: {
                template: form.orderPdfTemplate,
            },
            orderIdRules: form.orderIdRules
                .map(rule => ({
                    requirement: rule.requirement.trim(),
                    prefix: normalizeOrderIdPrefix(rule.prefix),
                }))
                .filter(rule => rule.requirement && rule.prefix),
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['app-settings'] })
            queryClient.invalidateQueries({ queryKey: ['shiprocket-config'] })
            toast({ title: 'Settings Saved', description: 'Shiprocket configuration updated successfully.', variant: 'success' })
        },
        onError: (e: any) => {
            toast({ title: 'Save Failed', description: e?.response?.data?.message || 'Could not save settings', variant: 'destructive' })
        },
    })

    const handleTest = async () => {
        setTestStatus('loading')
        setTestMsg('')
        try {
            const res = await shiprocketAPI.getPickupAddresses()
            const addresses = res.data.data || []
            setTestStatus('success')
            setTestMsg(`✓ Connected! Found ${addresses.length} pickup address${addresses.length !== 1 ? 'es' : ''}: ${addresses.map((a: any) => a.pickup_location || a.address).join(', ')}`)
        } catch (e: any) {
            setTestStatus('error')
            setTestMsg(e?.response?.data?.message || e?.message || 'Connection failed. Check your credentials.')
        }
    }

    if (!isAdmin) {
        return (
            <div className="p-6 text-center text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-3 text-amber-400" />
                <p>Only Admins can access Settings.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6 pb-10 animate-fade-in">
            {/* Page Header */}
            <div className="glass sticky top-0 z-20 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/88 px-5 py-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 dark:shadow-none sm:px-6 sm:py-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent dark:via-white/40" />
                <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-orange-300/20 blur-3xl dark:bg-orange-500/10" />
                <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Settings</h1>
                            <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">Configure integrations and application defaults</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            onClick={() => saveMutation.mutate()}
                            disabled={saveMutation.isPending}
                            className="h-[42px] rounded-[10px] bg-blue-600 px-6 text-[14px] font-semibold text-white shadow-md hover:bg-blue-700 transition-all dark:bg-blue-600 dark:hover:bg-blue-700"
                        >
                            {saveMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : <><Save className="mr-2 h-4 w-4" />Save Changes</>}
                        </Button>
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20 gap-3 text-slate-500 dark:text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" /> Loading settings...
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                    
                    <div className="space-y-6 xl:col-span-4">
                        {/* Integration Details / Info Card */}
                        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20">
                                    <Truck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Shiprocket Setup</h3>
                                    <p className="text-[13px] text-slate-500 dark:text-slate-400">Logistics Integration</p>
                                </div>
                            </div>
                            
                            <div className="space-y-4 rounded-xl bg-slate-50/80 p-5 border border-slate-100 dark:bg-slate-800/50 dark:border-white/5">
                                <div className="flex items-start gap-3">
                                    <Zap className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">How it works</p>
                                        <ul className="text-[13px] text-slate-500 dark:text-slate-400 space-y-2 list-disc list-inside">
                                            <li><span className="-ml-1">"Hard Copy" orders show an orange <strong>Ship on Shiprocket</strong> button.</span></li>
                                            <li><span className="-ml-1">Opens a pre-filled form with customer details.</span></li>
                                            <li><span className="-ml-1">Submitting saves the AWB and tracking link automatically.</span></li>
                                            <li><span className="-ml-1">Tracking badge replaces the Ship button.</span></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Defaults Card */}
                        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                    <Settings2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">General Defaults</h3>
                                    <p className="text-[13px] text-slate-500 dark:text-slate-400">Standard operation rules</p>
                                </div>
                            </div>
                            
                            <div className="space-y-5">
                                <div>
                                    <Label className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-2 block">Default Payment Mode</Label>
                                    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 w-full border border-slate-200/50 dark:border-white/5">
                                        {(['Prepaid', 'COD'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => set('defaultPaymentMethod', mode)}
                                                className={`flex-1 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all ${
                                                    form.defaultPaymentMethod === mode
                                                        ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 dark:bg-slate-700 dark:border-slate-600 dark:text-white'
                                                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                                }`}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <Label htmlFor="sr-keywords" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block flex items-center gap-1.5">
                                        <Tag className="w-3.5 h-3.5 text-slate-400" /> Detection Keywords
                                    </Label>
                                    <Input
                                        id="sr-keywords"
                                        value={form.hardCopyKeywordsStr}
                                        onChange={e => set('hardCopyKeywordsStr', e.target.value)}
                                        placeholder="hard copy, printed copy, hc"
                                        className="h-10 rounded-xl border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 focus-visible:ring-1 focus-visible:ring-emerald-500"
                                    />
                                    <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                        Comma-separated list. If an order's requirement matches any, the logistics flow triggers.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                            <div className="mb-6 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                                        <Hash className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">Order ID Rules</h3>
                                        <p className="text-[13px] text-slate-500 dark:text-slate-400">Requirement based numbering</p>
                                    </div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={addOrderIdRule} className="h-8 gap-1.5 rounded-lg text-xs">
                                    <Plus className="h-3.5 w-3.5" /> Add
                                </Button>
                            </div>

                            <div className="space-y-3">
                                {form.orderIdRules.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                                        Add a requirement and prefix, for example Synopsis with SP.
                                    </div>
                                ) : form.orderIdRules.map((rule, index) => (
                                    <div key={index} className="grid grid-cols-[1fr_92px_32px] items-end gap-2">
                                        <div>
                                            <Label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Requirement</Label>
                                            <Input
                                                value={rule.requirement}
                                                onChange={e => updateOrderIdRule(index, { requirement: e.target.value })}
                                                placeholder="Synopsis"
                                                className="h-9 rounded-lg text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Prefix</Label>
                                            <Input
                                                value={rule.prefix}
                                                onChange={e => updateOrderIdRule(index, { prefix: normalizeOrderIdPrefix(e.target.value) })}
                                                placeholder="SP"
                                                maxLength={8}
                                                className="h-9 rounded-lg text-sm font-mono uppercase"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                                            onClick={() => removeOrderIdRule(index)}
                                            title="Remove rule"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                                <p className="text-[12px] leading-relaxed text-slate-400 dark:text-slate-500">
                                    New orders receive the next number automatically: prefix plus three digits, such as SP001. If the requirement changes to a different prefix, the order gets a new ID for that requirement.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="space-y-6 xl:col-span-8">
                        {/* API Credentials */}
                        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                            <div className="flex items-start sm:items-center justify-between mb-6 flex-col sm:flex-row gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
                                        <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">API Credentials</h3>
                                        <p className="text-[13px] text-slate-500 dark:text-slate-400">Your Shiprocket connection</p>
                                    </div>
                                </div>
                                <a
                                    href="https://app.shiprocket.in/settings/api"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                                >
                                    Get API Keys <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <Label htmlFor="sr-email" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">API Email *</Label>
                                    <Input
                                        id="sr-email"
                                        type="email"
                                        value={form.email}
                                        onChange={e => set('email', e.target.value)}
                                        placeholder="your-api-user@email.com"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:ring-1 focus-visible:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="sr-password" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">API Password *</Label>
                                    <div className="relative">
                                        <Input
                                            id="sr-password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.password}
                                            onChange={e => set('password', e.target.value)}
                                            placeholder={sr.passwordSet ? 'Saved — enter new to update' : 'Enter password'}
                                            className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:ring-1 focus-visible:ring-blue-500 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center gap-3 pt-5 border-t border-slate-100 dark:border-white/5">
                                <Button
                                    variant="outline"
                                    className="h-9 gap-2 rounded-lg border-blue-200 bg-blue-50 text-[13px] font-semibold text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20"
                                    onClick={handleTest}
                                    disabled={testStatus === 'loading'}
                                >
                                    {testStatus === 'loading'
                                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing Connection...</>
                                        : <><TestTube2 className="w-3.5 h-3.5" /> Test Connection</>
                                    }
                                </Button>
                                {testStatus === 'success' && (
                                    <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20"><CheckCircle2 className="w-3.5 h-3.5" /></div>
                                        {testMsg}
                                    </span>
                                )}
                                {testStatus === 'error' && (
                                    <span className="text-[13px] font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/20"><AlertCircle className="w-3.5 h-3.5" /></div>
                                        {testMsg}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Additional Logistics Configuration */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Pickup Location Card */}
                            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 border border-violet-500/20">
                                        <MapPin className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">Pickup Warehouse</h3>
                                        <p className="text-[13px] text-slate-500 dark:text-slate-400">Registered on Shiprocket</p>
                                    </div>
                                </div>
                                
                                <div>
                                    <Label htmlFor="sr-pickup" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Location Name *</Label>
                                    <Input
                                        id="sr-pickup"
                                        value={form.pickupLocation}
                                        onChange={e => set('pickupLocation', e.target.value)}
                                        placeholder="e.g. Primary Office"
                                        className="h-11 rounded-xl border-slate-200 bg-white text-sm dark:border-slate-700 dark:bg-slate-800 focus-visible:ring-1 focus-visible:ring-violet-500"
                                    />
                                    <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 p-3.5 text-[12.5px] leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200/80">
                                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <p>Must exactly match the alias created in your Shiprocket <strong>Manage Pickup Address</strong> settings.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Default Package Dimensions */}
                            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                        <Package className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">Package Dimensions</h3>
                                        <p className="text-[13px] text-slate-500 dark:text-slate-400">Pre-fills the shipping form</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="sr-weight" className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Weight (kg)</Label>
                                        <Input id="sr-weight" type="number" step="0.1" min="0.1" value={form.defaultWeight} onChange={e => set('defaultWeight', e.target.value)} placeholder="0.5" className="h-10 rounded-lg text-sm border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus-visible:ring-1 focus-visible:ring-cyan-500" />
                                    </div>
                                    <div>
                                        <Label htmlFor="sr-len" className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Length (cm)</Label>
                                        <Input id="sr-len" type="number" value={form.defaultLength} onChange={e => set('defaultLength', e.target.value)} placeholder="25" className="h-10 rounded-lg text-sm border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus-visible:ring-1 focus-visible:ring-cyan-500" />
                                    </div>
                                    <div>
                                        <Label htmlFor="sr-wid" className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Width (cm)</Label>
                                        <Input id="sr-wid" type="number" value={form.defaultWidth} onChange={e => set('defaultWidth', e.target.value)} placeholder="20" className="h-10 rounded-lg text-sm border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus-visible:ring-1 focus-visible:ring-cyan-500" />
                                    </div>
                                    <div>
                                        <Label htmlFor="sr-hei" className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-1 block">Height (cm)</Label>
                                        <Input id="sr-hei" type="number" value={form.defaultHeight} onChange={e => set('defaultHeight', e.target.value)} placeholder="5" className="h-10 rounded-lg text-sm border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus-visible:ring-1 focus-visible:ring-cyan-500" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    
{/* Email SMTP Configuration */}
                        <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-slate-900/70">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/20">
                                    <Mail className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">Email SMTP Setup</h3>
                                    <p className="text-[13px] text-slate-500 dark:text-slate-400">For staff payment notifications</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <Label htmlFor="email-user" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Email Address *</Label>
                                    <Input
                                        id="email-user"
                                        type="email"
                                        value={form.emailUser}
                                        onChange={e => set('emailUser', e.target.value)}
                                        placeholder="e.g. notifications@yourdomain.com"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:ring-1 focus-visible:ring-purple-500"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="email-pass" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">App Password *</Label>
                                    <div className="relative">
                                        <Input
                                            id="email-pass"
                                            type={showPassword ? 'text' : 'password'}
                                            value={form.emailPass}
                                            onChange={e => set('emailPass', e.target.value)}
                                            placeholder={settingsData?.emailConfig?.passSet ? 'Saved — enter new to update' : 'Enter app password'}
                                            className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:ring-1 focus-visible:ring-purple-500 pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="sm:col-span-2">
                                    <Label htmlFor="email-from" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Sender Name</Label>
                                    <Input
                                        id="email-from"
                                        value={form.emailFromName}
                                        onChange={e => set('emailFromName', e.target.value)}
                                        placeholder="e.g. CRM Admin"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:ring-1 focus-visible:ring-purple-500"
                                    />
                                    <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                        For Gmail, you <strong>must</strong> use an "App Password" (2FA must be enabled on your Google account).
                                    </p>
                                </div>
                                <div className="sm:col-span-2 pt-4 border-t border-slate-100 dark:border-white/5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Payment Email Template</h4>
                                        <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">CSS Supported</span>
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="email-body" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Email Body (HTML & CSS)</Label>
                                            <textarea
                                                id="email-body"
                                                value={form.emailBodyTemplate}
                                                onChange={e => set('emailBodyTemplate', e.target.value)}
                                                placeholder="<!DOCTYPE html><html><head><style>body { color: blue; }</style></head><body>...</body></html>"
                                                rows={12}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500 resize-y font-mono leading-relaxed"
                                            />
                                            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                                Available variables: <code>{`{memberName}`}</code>, <code>{`{invoiceUrl}`}</code>.<br />
                                                You can write full HTML including <code>&lt;style&gt;</code> blocks or use inline CSS (e.g. <code>style="color: red"</code>).
                                            </p>
                                        </div>
                                        
                                        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Invoice PDF Template</h4>
                                                <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">CSS Supported</span>
                                            </div>
                                            <Label htmlFor="invoice-body" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Invoice HTML Template</Label>
                                            <textarea
                                                id="invoice-body"
                                                value={form.invoiceTemplate}
                                                onChange={e => set('invoiceTemplate', e.target.value)}
                                                placeholder="<!DOCTYPE html><html><head><style>body { color: blue; }</style></head><body>...</body></html>"
                                                rows={12}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500 resize-y font-mono leading-relaxed"
                                            />
                                            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                                Available variables: <code>{`{invoiceId}`}</code>, <code>{`{date}`}</code>, <code>{`{memberName}`}</code>, <code>{`{memberRole}`}</code>, <code>{`{memberEmail}`}</code>, <code>{`{memberAccount}`}</code>, <code>{`{breakdownTableRows}`}</code>, <code>{`{totalAmount}`}</code>, <code>{`{noteSection}`}</code>.
                                            </p>
                                        </div>

                                        <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Order PDF Template</h4>
                                                <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">HTML + CSS</span>
                                            </div>
                                            <Label htmlFor="order-pdf-body" className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Order PDF HTML Template</Label>
                                            <textarea
                                                id="order-pdf-body"
                                                value={form.orderPdfTemplate}
                                                onChange={e => set('orderPdfTemplate', e.target.value)}
                                                placeholder="<!DOCTYPE html><html><head><style>body { color: blue; }</style></head><body>...</body></html>"
                                                rows={16}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] focus:bg-white dark:border-slate-700 dark:bg-slate-800/50 dark:focus:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-purple-500 resize-y font-mono leading-relaxed"
                                            />
                                            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                                Available variables: <code>{`{documentTitle}`}</code>, <code>{`{brandName}`}</code>, <code>{`{orderId}`}</code>, <code>{`{fullName}`}</code>, <code>{`{email}`}</code>, <code>{`{phone}`}</code>, <code>{`{programName}`}</code>, <code>{`{status}`}</code>, <code>{`{source}`}</code>, <code>{`{createdAt}`}</code>, <code>{`{updatedAt}`}</code>, <code>{`{allDetailsTable}`}</code>, <code>{`{contactSection}`}</code>, <code>{`{academicSection}`}</code>, <code>{`{assignmentSection}`}</code>, <code>{`{recordSection}`}</code>, <code>{`{extraSection}`}</code>.
                                            </p>
                                            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-2 leading-relaxed">
                                                For compact single-page PDFs, use <code>{`{allDetailsTable}`}</code>. The section variables are still available if you want a multi-block layout.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        </div>
                </div>
            )}
        </div>
    )
}
