'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { 
    ArrowLeft, Loader2, User, CreditCard, 
    ShoppingCart, Calculator, CheckCircle2,
    Settings, Plus, GripVertical, Trash2, X, Save
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { studentsAPI, teamAPI, orderFormConfigAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const PAYMENT_MODES = [
    'UPI',
    'Bank Transfer',
    'Cash',
    'Payment Gateway',
]

type FormField = {
    id: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'textarea' | 'dropdown' | 'checkbox';
    options?: string[];
    placeholder?: string;
    required?: boolean;
    width?: 'full' | 'half';
    showWhen?: string;
}

type FormConfig = {
    requirementOptions: string[];
    customFields: FormField[];
}

export default function NewOrderPage() {
    const router = useRouter()
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { user: currentUser } = useAuthStore()

    const canEditForm = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'
    const [isEditMode, setIsEditMode] = useState(false)

    // Base Fields
    const [fullName, setFullName] = useState('')
    const [enrollmentNo, setEnrollmentNo] = useState('')
    const [programme, setProgramme] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [alternatePhone, setAlternatePhone] = useState('')
    const [assignedGuideId, setAssignedGuideId] = useState<string>('')
    
    // Core custom fields that might still be stored under customFields JSON payload but statically mapped based on previous code
    const [state, setState] = useState('')
    const [city, setCity] = useState('')
    const [address, setAddress] = useState('')
    const [semester, setSemester] = useState('')
    const [batchYear, setBatchYear] = useState('')
    const [subjectCodes, setSubjectCodes] = useState('')
    
    const [productType, setProductType] = useState('')

    // Payment/computations
    const [totalAmount, setTotalAmount] = useState('')
    const [advancePaid, setAdvancePaid] = useState('')
    const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES[0])
    const [deliveryDeadline, setDeliveryDeadline] = useState('')

    // Dynamic field values map
    const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({})

    // Config draft for Edit Mode
    const [draftConfig, setDraftConfig] = useState<FormConfig | null>(null)
    const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null)

    // Fetch Config
    const { data: configData, isLoading: isLoadingConfig } = useQuery({
        queryKey: ['order-form-config'],
        queryFn: async () => {
            const res = await orderFormConfigAPI.get()
            return res.data.data as FormConfig
        },
    })

    const config = draftConfig || configData

    useEffect(() => {
        if (configData && !draftConfig && !isEditMode) {
            setDraftConfig(JSON.parse(JSON.stringify(configData))) // deep copy
            if (!productType && configData.requirementOptions && configData.requirementOptions.length > 0) {
                setProductType(configData.requirementOptions[0])
            }
        }
    }, [configData, isEditMode, productType])

    // Fetch Experts/Guides
    const { data: guidesData } = useQuery({
        queryKey: ['guides-available'],
        queryFn: async () => (await teamAPI.getGuides()).data.data,
    })
    const guides = guidesData || []

    const createMutation = useMutation({
        mutationFn: async (payload: any) => {
            return studentsAPI.create(payload)
        },
        onSuccess: () => {
            toast({
                title: 'Success!',
                description: 'Order created successfully',
                variant: 'success',
            })
            router.push('/orders')
        },
        onError: (error: any) => {
            toast({
                title: 'Error',
                description: error.response?.data?.message || 'Failed to create order',
                variant: 'destructive',
            })
        },
    })

    const updateConfigMutation = useMutation({
        mutationFn: async (payload: FormConfig) => {
            return orderFormConfigAPI.update(payload)
        },
        onSuccess: () => {
            toast({ title: 'Success', description: 'Form configuration updated', variant: 'success' })
            queryClient.invalidateQueries({ queryKey: ['order-form-config'] })
            setIsEditMode(false)
        },
        onError: () => {
            toast({ title: 'Error', description: 'Failed to update form config', variant: 'destructive' })
        }
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!fullName || !phone) {
            toast({ title: 'Error', description: 'Full Name and Phone are required', variant: 'destructive' })
            return
        }

        const amountNum = Number(totalAmount) || 0
        const advanceNum = Number(advancePaid) || 0
        
        let expertCostNum = 0;
        // See if we have an explicit expert payment custom field
        const expertPaymentField = config?.customFields.find(f => f.label.toLowerCase().includes('expert payment'));
        if (expertPaymentField && customFieldValues[expertPaymentField.id]) {
            expertCostNum = Number(customFieldValues[expertPaymentField.id]) || 0;
        }

        // Gather static core custom fields
        const finalCustomFields: Record<string, any> = {
            'State': state,
            'City': city,
            'Subject Codes': subjectCodes,
            'Decided Price': amountNum,
            'Advance Paid': advanceNum,
            'Payment Mode': paymentMode,
            'Delivery Deadline': deliveryDeadline,
            'Requirement of': productType,
        }

        // Add dynamic custom fields
        config?.customFields.forEach(field => {
            if (customFieldValues[field.id] !== undefined && customFieldValues[field.id] !== '') {
                finalCustomFields[field.label] = customFieldValues[field.id]
            }
        })

        // Clean up empty fields
        Object.keys(finalCustomFields).forEach(k => {
            if (finalCustomFields[k] === '' || finalCustomFields[k] === null || finalCustomFields[k] === undefined) {
                delete finalCustomFields[k]
            }
        })

        const payload = {
            fullName,
            enrollmentNo,
            programme,
            course: programme,
            phone,
            email,
            alternatePhone,
            address,
            semester: semester ? Number(semester) : null,
            batchYear: batchYear ? Number(batchYear) : null,
            status: 'NEW_LEAD',
            source: 'manual',
            assignedGuideId: assignedGuideId ? Number(assignedGuideId) : null,
            customFields: finalCustomFields
        }

        createMutation.mutate(payload)
    }

    const saveConfig = () => {
        if (!draftConfig) return;
        const configToSave = { ...draftConfig };
        configToSave.customFields = configToSave.customFields.map(f => {
            if (f.type === 'dropdown' && f.options) {
                return { ...f, options: f.options.map(o => o.trim()).filter(Boolean) }
            }
            return f;
        });
        updateConfigMutation.mutate(configToSave)
    }

    const toggleEditMode = () => {
        if (isEditMode) {
            // Discard draft
            setDraftConfig(configData ? JSON.parse(JSON.stringify(configData)) : null)
            setExpandedFieldId(null)
        } else {
            // Enter edit mode
            setDraftConfig(configData ? JSON.parse(JSON.stringify(configData)) : { requirementOptions: [], customFields: [] })
        }
        setIsEditMode(!isEditMode)
    }

    const addRequirementOption = () => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        conf.requirementOptions.push('New Option')
        setDraftConfig(conf)
    }

    const removeRequirementOption = (idx: number) => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        conf.requirementOptions.splice(idx, 1)
        setDraftConfig(conf)
    }

    const updateRequirementOption = (idx: number, val: string) => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        conf.requirementOptions[idx] = val
        setDraftConfig(conf)
    }

    const addCustomField = () => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        const newId = `cf_${Date.now()}`
        conf.customFields.push({
            id: newId,
            label: 'New Field',
            type: 'text',
            required: false,
            width: 'full',
            showWhen: 'always'
        })
        setDraftConfig(conf)
        setExpandedFieldId(newId)
    }

    const removeCustomField = (id: string) => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        conf.customFields = conf.customFields.filter(f => f.id !== id)
        setDraftConfig(conf)
    }

    const updateCustomField = (id: string, updates: Partial<FormField>) => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        const idx = conf.customFields.findIndex(f => f.id === id)
        if (idx !== -1) {
            conf.customFields[idx] = { ...conf.customFields[idx], ...updates }
            setDraftConfig(conf)
        }
    }

    const moveField = (index: number, direction: 'up' | 'down') => {
        if (!draftConfig) return;
        const conf = { ...draftConfig }
        if (direction === 'up' && index > 0) {
            const temp = conf.customFields[index]
            conf.customFields[index] = conf.customFields[index - 1]
            conf.customFields[index - 1] = temp
        } else if (direction === 'down' && index < conf.customFields.length - 1) {
            const temp = conf.customFields[index]
            conf.customFields[index] = conf.customFields[index + 1]
            conf.customFields[index + 1] = temp
        }
        setDraftConfig(conf)
    }

    // Computations for summary
    const amountNum = Number(totalAmount) || 0
    const advanceNum = Number(advancePaid) || 0
    let expertCostNum = 0;
    if (config?.customFields) {
        const expertPaymentField = config.customFields.find(f => f.label.toLowerCase().includes('expert payment'));
        if (expertPaymentField && customFieldValues[expertPaymentField.id]) {
            expertCostNum = Number(customFieldValues[expertPaymentField.id]) || 0;
        }
    }
    const balanceRemaining = Math.max(0, amountNum - advanceNum)
    const netProfit = amountNum - expertCostNum

    const isProject = productType.toLowerCase().includes('project')

    if (isLoadingConfig) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto animate-fade-in pb-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href="/orders">
                        <Button variant="ghost" size="icon" className="rounded-full">
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold">Add New Order</h1>
                        <p className="text-muted-foreground">Create a direct sale or requirement order</p>
                    </div>
                </div>
                {canEditForm && (
                    <Button onClick={toggleEditMode} variant={isEditMode ? "secondary" : "outline"} className="gap-2">
                        {isEditMode ? <><X className="w-4 h-4"/> Exit Edit Mode</> : <><Settings className="w-4 h-4"/> Edit Form</>}
                    </Button>
                )}
            </div>

            <div className={cn(
                "grid gap-6 transition-all duration-300",
                isEditMode ? "grid-cols-1 xl:grid-cols-[1fr_450px]" : "grid-cols-1 lg:grid-cols-1"
            )}>
                
                {/* FORM LEFT SIDE */}
                <form onSubmit={handleSubmit} className={cn("grid grid-cols-1 gap-6 items-start", !isEditMode && "lg:grid-cols-12")}>
                    
                    <div className={cn("flex flex-col gap-6", !isEditMode && "lg:col-span-7")}>
                        {/* Student Details */}
                        <div className="glass rounded-xl p-5 border border-border">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <User className="w-4 h-4 text-blue-500" /> Student Details
                                </h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <Label>Student Name *</Label>
                                    <Input 
                                        value={fullName} onChange={e => setFullName(e.target.value)} 
                                        placeholder="Full name" required className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Enrollment No.</Label>
                                    <Input 
                                        value={enrollmentNo} onChange={e => setEnrollmentNo(e.target.value)} 
                                        placeholder="IGNOU enrollment" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Phone *</Label>
                                    <Input 
                                        value={phone} onChange={e => setPhone(e.target.value)} 
                                        placeholder="10-digit number" required className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Alternate Contact</Label>
                                    <Input 
                                        value={alternatePhone} onChange={e => setAlternatePhone(e.target.value)} 
                                        placeholder="Optional" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Email Id</Label>
                                    <Input 
                                        type="email"
                                        value={email} onChange={e => setEmail(e.target.value)} 
                                        placeholder="Email address" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <Label>Program</Label>
                                    <Input 
                                        value={programme} onChange={e => setProgramme(e.target.value)} 
                                        placeholder="e.g. MBAFM" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="grid grid-cols-2 col-span-2 sm:col-span-1 gap-3">
                                    <div>
                                        <Label>Semester</Label>
                                        <Input 
                                            value={semester} onChange={e => setSemester(e.target.value)} 
                                            placeholder="e.g. 1" className="mt-1" type="number" disabled={isEditMode}
                                        />
                                    </div>
                                    <div>
                                        <Label>Batch Year</Label>
                                        <Input 
                                            value={batchYear} onChange={e => setBatchYear(e.target.value)} 
                                            placeholder="e.g. 2024" className="mt-1" type="number" disabled={isEditMode}
                                        />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <Label>Postal Address</Label>
                                    <Input 
                                        value={address} onChange={e => setAddress(e.target.value)} 
                                        placeholder="Full address" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div className="grid grid-cols-2 col-span-2 sm:col-span-1 gap-3">
                                    <div>
                                        <Label>State</Label>
                                        <Input 
                                            value={state} onChange={e => setState(e.target.value)} 
                                            placeholder="State" className="mt-1" disabled={isEditMode}
                                        />
                                    </div>
                                    <div>
                                        <Label>City</Label>
                                        <Input 
                                            value={city} onChange={e => setCity(e.target.value)} 
                                            placeholder="City" className="mt-1" disabled={isEditMode}
                                        />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <Label>Subject Codes</Label>
                                    <Input 
                                        value={subjectCodes} onChange={e => setSubjectCodes(e.target.value)} 
                                        placeholder="e.g. MMPC-001, MMPC-002" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Payment Details */}
                        <div className="glass rounded-xl p-5 border border-border">
                            <div className="flex items-center mb-5">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-emerald-500" /> Payment Details
                                </h3>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>Decided Price (₹)</Label>
                                    <Input 
                                        type="number" min="0" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} 
                                        placeholder="e.g. 5000" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div>
                                    <Label>Advance Paid (₹)</Label>
                                    <Input 
                                        type="number" min="0" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)} 
                                        placeholder="e.g. 2000" className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                                <div>
                                    <Label>Payment Mode</Label>
                                    <select 
                                        value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                                        disabled={isEditMode}
                                    >
                                        {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label>Delivery Deadline</Label>
                                    <Input 
                                        type="date" value={deliveryDeadline} onChange={e => setDeliveryDeadline(e.target.value)} 
                                        className="mt-1" disabled={isEditMode}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={cn("flex flex-col gap-6", !isEditMode && "lg:col-span-5")}>

                        {/* Product & Assignment */}
                        <div className="glass rounded-xl p-5 border border-border relative">
                            {isEditMode && (
                                <div className="absolute inset-0 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-primary/50 z-10 pointer-events-none" />
                            )}
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <ShoppingCart className="w-4 h-4 text-purple-500" /> Product & Assignment
                                </h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <Label>Requirement of</Label>
                                    <select 
                                        value={productType} onChange={e => setProductType(e.target.value)}
                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                                        disabled={isEditMode}
                                    >
                                        {config?.requirementOptions?.map(m => <option key={m} value={m}>{m}</option>)}
                                        {(!config?.requirementOptions || config.requirementOptions.length === 0) && (
                                            <option value="">No options available</option>
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <Label>Assign Expert</Label>
                                    <select 
                                        value={assignedGuideId} onChange={e => setAssignedGuideId(e.target.value)}
                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                                        disabled={isEditMode}
                                    >
                                        <option value="">-- Leave Unassigned --</option>
                                        {guides.map((g: any) => (
                                            <option key={g.id} value={g.id}>{g.fullName} ({g.staffRole})</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="w-full h-px bg-border my-4" />
                                
                                {/* DYNAMIC CUSTOM FIELDS RENDER */}
                                <div className="grid grid-cols-2 gap-4">
                                    {config?.customFields?.map(field => {
                                        // Conditional rendering logic
                                        if (field.showWhen === 'requirement_is_project' && !isProject) return null;
                                        
                                        const isHalf = field.width === 'half'

                                        return (
                                            <div key={field.id} className={cn(isHalf ? "col-span-1" : "col-span-2")}>
                                                <Label>{field.label} {field.required && '*'}</Label>
                                                
                                                {field.type === 'text' && (
                                                    <Input 
                                                        placeholder={field.placeholder}
                                                        value={customFieldValues[field.id] || ''}
                                                        onChange={e => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.value}))}
                                                        required={field.required}
                                                        className="mt-1"
                                                        disabled={isEditMode}
                                                    />
                                                )}
                                                {field.type === 'number' && (
                                                    <Input 
                                                        type="number"
                                                        placeholder={field.placeholder}
                                                        value={customFieldValues[field.id] || ''}
                                                        onChange={e => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.value}))}
                                                        required={field.required}
                                                        className="mt-1"
                                                        disabled={isEditMode}
                                                    />
                                                )}
                                                {field.type === 'date' && (
                                                    <Input 
                                                        type="date"
                                                        value={customFieldValues[field.id] || ''}
                                                        onChange={e => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.value}))}
                                                        required={field.required}
                                                        className="mt-1"
                                                        disabled={isEditMode}
                                                    />
                                                )}
                                                {field.type === 'textarea' && (
                                                    <textarea 
                                                        placeholder={field.placeholder}
                                                        value={customFieldValues[field.id] || ''}
                                                        onChange={e => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.value}))}
                                                        required={field.required}
                                                        rows={3}
                                                        className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-sm resize-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                                                        disabled={isEditMode}
                                                    />
                                                )}
                                                {field.type === 'dropdown' && (
                                                    <select 
                                                        value={customFieldValues[field.id] || ''}
                                                        onChange={e => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.value}))}
                                                        required={field.required}
                                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                                                        disabled={isEditMode}
                                                    >
                                                        <option value="">-- Select --</option>
                                                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                )}
                                                {field.type === 'checkbox' && (
                                                    <div className="mt-3 flex items-center gap-2">
                                                        <input 
                                                            type="checkbox"
                                                            checked={!!customFieldValues[field.id]}
                                                            onChange={e => setCustomFieldValues(prev => ({...prev, [field.id]: e.target.checked}))}
                                                            disabled={isEditMode}
                                                            className="rounded border-input text-primary focus:ring-primary"
                                                        />
                                                        <span className="text-sm">Yes</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Live Cost & Profit Summary */}
                        <div className="glass rounded-xl p-0 overflow-hidden border border-border">
                            <div className="bg-amber-500/10 px-5 py-3 border-b border-white/5 flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-amber-500" />
                                <h3 className="font-semibold text-amber-600 dark:text-amber-400">Live Cost & Profit Summary</h3>
                            </div>
                            
                            <div className="p-5 space-y-3 font-mono text-sm">
                                <div className="flex justify-between items-center text-muted-foreground">
                                    <span>Decided Price</span>
                                    <span className="font-bold text-foreground">₹{amountNum.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-muted-foreground">
                                    <span>Advance Collected</span>
                                    <span className="font-bold text-emerald-500">₹{advanceNum.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-muted-foreground pb-3 border-b border-border/50">
                                    <span>Balance Remaining</span>
                                    <span className="font-bold text-amber-500">₹{balanceRemaining.toLocaleString()}</span>
                                </div>
                                
                                <div className="flex justify-between items-center pt-2 text-muted-foreground">
                                    <span>Expert Payment</span>
                                    <span className="font-bold text-red-500">₹{expertCostNum.toLocaleString()}</span>
                                </div>
                                
                                <div className="flex justify-between items-center pt-3 pb-1 border-t border-border mt-3 text-base">
                                    <span className="font-bold">Net Profit</span>
                                    <span className="font-bold text-emerald-500">₹{netProfit.toLocaleString()}</span>
                                </div>
                            </div>
                            
                            <div className="p-4 bg-muted/30 border-t border-border">
                                <Button 
                                    type="submit" 
                                    className="w-full gap-2 gradient-primary"
                                    disabled={createMutation.isPending || isEditMode}
                                >
                                    {createMutation.isPending ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                                    ) : (
                                        <><CheckCircle2 className="w-4 h-4" /> Create Order</>
                                    )}
                                </Button>
                            </div>
                        </div>

                    </div>
                </form>

                {/* EDIT MODE CONFIG PANEL */}
                {isEditMode && draftConfig && (
                    <div className="glass rounded-xl border border-primary/20 sticky top-6 h-fit bg-slate-50 dark:bg-[#0f172a]/95 overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-border flex items-center justify-between bg-primary/5">
                            <h2 className="font-semibold flex items-center gap-2">
                                <Settings className="w-4 h-4 text-primary" /> Edit Form Config
                            </h2>
                        </div>
                        
                        <div className="p-4 max-h-[70vh] overflow-y-auto space-y-6">
                            
                            {/* Requirement Options Editor */}
                            <div>
                                <h3 className="font-medium text-sm text-muted-foreground mb-3 uppercase tracking-wider">Requirement Options</h3>
                                <div className="space-y-2">
                                    {draftConfig.requirementOptions.map((opt, idx) => (
                                        <div key={idx} className="flex gap-2 items-center">
                                            <Input 
                                                value={opt} 
                                                onChange={e => updateRequirementOption(idx, e.target.value)} 
                                                className="h-8 text-sm"
                                            />
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-500/10 flex-shrink-0" onClick={() => removeRequirementOption(idx)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button variant="outline" size="sm" className="w-full gap-2 mt-2 h-8 border-dashed" onClick={addRequirementOption}>
                                        <Plus className="w-3 h-3" /> Add Option
                                    </Button>
                                </div>
                            </div>

                            <hr className="border-border" />

                            {/* Custom Fields Editor */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Custom Fields</h3>
                                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-dashed" onClick={addCustomField}>
                                        <Plus className="w-3 h-3" /> Add Field
                                    </Button>
                                </div>
                                
                                <div className="space-y-3">
                                    {draftConfig.customFields.map((field, idx) => {
                                        const isExpanded = expandedFieldId === field.id;
                                        return (
                                            <div key={field.id} className="border border-border bg-background rounded-md overflow-hidden">
                                                <div className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedFieldId(isExpanded ? null : field.id)}>
                                                    <div className="flex flex-col gap-1 w-6">
                                                        <button onClick={(e) => { e.stopPropagation(); moveField(idx, 'up') }} disabled={idx === 0} className="text-slate-400 hover:text-foreground disabled:opacity-30"><GripVertical className="w-3 h-3 mx-auto rotate-90"/></button>
                                                        <button onClick={(e) => { e.stopPropagation(); moveField(idx, 'down') }} disabled={idx === draftConfig.customFields.length - 1} className="text-slate-400 hover:text-foreground disabled:opacity-30"><GripVertical className="w-3 h-3 mx-auto rotate-90"/></button>
                                                    </div>
                                                    <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono uppercase w-16 text-center">{field.type}</span>
                                                    <span className="text-sm font-medium truncate flex-1">{field.label || 'Untitled Field'}</span>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-500 hover:bg-red-500/10 flex-shrink-0" onClick={(e) => { e.stopPropagation(); removeCustomField(field.id) }}>
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </div>

                                                {isExpanded && (
                                                    <div className="p-3 border-t border-border bg-muted/10 space-y-3">
                                                        <div>
                                                            <Label className="text-xs">Field Label</Label>
                                                            <Input value={field.label} onChange={e => updateCustomField(field.id, { label: e.target.value })} className="h-8 text-sm mt-1" />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <Label className="text-xs">Type</Label>
                                                                <select 
                                                                    value={field.type} 
                                                                    onChange={e => updateCustomField(field.id, { type: e.target.value as any })}
                                                                    className="h-8 px-2 mt-1 w-full text-sm border rounded"
                                                                >
                                                                    <option value="text">Text</option>
                                                                    <option value="number">Number</option>
                                                                    <option value="date">Date</option>
                                                                    <option value="dropdown">Dropdown</option>
                                                                    <option value="textarea">Textarea</option>
                                                                    <option value="checkbox">Checkbox</option>
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <Label className="text-xs">Width</Label>
                                                                <select 
                                                                    value={field.width || 'full'} 
                                                                    onChange={e => updateCustomField(field.id, { width: e.target.value as any })}
                                                                    className="h-8 px-2 mt-1 w-full text-sm border rounded"
                                                                >
                                                                    <option value="full">Full width</option>
                                                                    <option value="half">Half width</option>
                                                                </select>
                                                            </div>
                                                        </div>

                                                        {field.type === 'dropdown' && (
                                                            <div>
                                                                <Label className="text-xs">Dropdown Options (comma separated)</Label>
                                                                <Input 
                                                                    value={field.options?.join(',') || ''} 
                                                                    onChange={e => updateCustomField(field.id, { options: e.target.value.split(',') })} 
                                                                    className="h-8 text-sm mt-1" 
                                                                    placeholder="Option 1, Option 2, Option 3"
                                                                />
                                                            </div>
                                                        )}

                                                        {(field.type === 'text' || field.type === 'number' || field.type === 'textarea') && (
                                                            <div>
                                                                <Label className="text-xs">Placeholder Details</Label>
                                                                <Input value={field.placeholder || ''} onChange={e => updateCustomField(field.id, { placeholder: e.target.value })} className="h-8 text-sm mt-1" />
                                                            </div>
                                                        )}

                                                        <div>
                                                            <Label className="text-xs">Show Condition</Label>
                                                            <select 
                                                                value={field.showWhen || 'always'} 
                                                                onChange={e => updateCustomField(field.id, { showWhen: e.target.value })}
                                                                className="h-8 px-2 mt-1 w-full text-sm border rounded"
                                                            >
                                                                <option value="always">Always Default</option>
                                                                <option value="requirement_is_project">When 'Requirement' is Project</option>
                                                            </select>
                                                        </div>

                                                        <div className="flex items-center gap-2 pt-1">
                                                            <input 
                                                                type="checkbox" 
                                                                id={`req_${field.id}`}
                                                                checked={field.required || false}
                                                                onChange={e => updateCustomField(field.id, { required: e.target.checked })}
                                                            />
                                                            <Label htmlFor={`req_${field.id}`} className="text-xs cursor-pointer">Required Field</Label>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-border bg-muted/30 flex gap-3 mt-auto">
                            <Button className="flex-1 gap-2" onClick={saveConfig} disabled={updateConfigMutation.isPending}>
                                {updateConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4" />}
                                Save Config
                            </Button>
                            <Button variant="outline" className="flex-[0.5]" onClick={toggleEditMode} disabled={updateConfigMutation.isPending}>
                                Discard
                            </Button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    )
}

