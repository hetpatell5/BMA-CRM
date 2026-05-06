'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { 
    ArrowLeft, Save, Loader2, User, CreditCard, 
    ShoppingCart, Calculator, CheckCircle2 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { studentsAPI, teamAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

const PRODUCT_TYPES = [
    'Project (Synopsis + Report + Guide)',
    'Project (Synopsis)',
    'Project (Report)',
    'Project (Guide)',
    'Handwritten Assignment',
    'Handwritten Practical',
    'Guess Paper',
    'In-Depth Study Guide',
    'Quick Readable Notes',
]

const PAYMENT_MODES = [
    'UPI',
    'Bank Transfer',
    'Cash',
    'Payment Gateway',
]

import { useEffect } from 'react';

export default function EditOrderPage({ params }: { params: { id: string } }) {
    const { id } = params;
    const router = useRouter()
    const { toast } = useToast()

    // Base Fields
    const [fullName, setFullName] = useState('')
    const [enrollmentNo, setEnrollmentNo] = useState('')
    const [programme, setProgramme] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [alternatePhone, setAlternatePhone] = useState('')
    const [assignedGuideId, setAssignedGuideId] = useState<string>('')
    
    // Custom Fields
    const [state, setState] = useState('')
    const [city, setCity] = useState('')
    const [address, setAddress] = useState('')
    const [semester, setSemester] = useState('')
    const [batchYear, setBatchYear] = useState('')
    const [subjectCodes, setSubjectCodes] = useState('')
    
    const [productType, setProductType] = useState(PRODUCT_TYPES[0])
    const [deliveryType, setDeliveryType] = useState('Soft Copy')
    const [projectTopic, setProjectTopic] = useState('')
    const [expertPayment, setExpertPayment] = useState('')
    const [telecaller, setTelecaller] = useState('')
    const [priority, setPriority] = useState('NORMAL')
    const [specialInstructions, setSpecialInstructions] = useState('')

    const [totalAmount, setTotalAmount] = useState('')
    const [advancePaid, setAdvancePaid] = useState('')
    const [paymentMode, setPaymentMode] = useState(PAYMENT_MODES[0])
    const [deliveryDeadline, setDeliveryDeadline] = useState('')
    const [synopsisDeadline, setSynopsisDeadline] = useState('')
    const [reportDeadline, setReportDeadline] = useState('')

    // Computations
    const amountNum = Number(totalAmount) || 0
    const advanceNum = Number(advancePaid) || 0
    const expertCostNum = Number(expertPayment) || 0
    const balanceRemaining = Math.max(0, amountNum - advanceNum)
    // Removed 10% TC commission deduction to keep it simple exactly as requested by net profit formula mentioned: "Net Profit | Order Amount (no expert cost for now)"
    // Or let's just do Order Amount - Expert Cost if they put it in.
    const netProfit = amountNum - expertCostNum

    const isProject = productType.includes('Project')

    // Fetch Experts/Guides
    const { data: guidesData } = useQuery({
        queryKey: ['guides-available'],
        queryFn: async () => (await teamAPI.getGuides()).data.data,
    })
    const guides = guidesData || []

    
    const { data: studentRes, isLoading: isFetching } = useQuery({
        queryKey: ['student', id],
        queryFn: () => studentsAPI.getById(id),
    })

    useEffect(() => {
        if (studentRes?.data?.data) {
            const s = studentRes.data.data;
            const cf = s.customFields || {};
            setFullName(s.fullName || '');
            setEnrollmentNo(s.enrollmentNo || '');
            setProgramme(s.programme || s.course || '');
            setPhone(s.phone || '');
            setEmail(s.email || '');
            setAlternatePhone(s.alternatePhone || '');
            setAddress(s.address || '');
            setSemester(s.semester || '');
            setBatchYear(s.batchYear || '');
            setAssignedGuideId(s.assignedGuideId?.toString() || '');
            
            setState(cf['State'] || '');
            setCity(cf['City'] || '');
            setSubjectCodes(cf['Subject Codes'] || '');
            const reqKey = Object.keys(cf).find(k => 
                k.toLowerCase().includes('requirement of') || 
                k.toLowerCase().includes('requirement in') || 
                k.toLowerCase() === 'product type'
            );
            let initialReq = reqKey ? cf[reqKey] : PRODUCT_TYPES[0];
            if (Array.isArray(initialReq)) initialReq = initialReq[0];
            
            let finalReq = String(initialReq || '').trim();
            // Fuzzy match logic to map plural/spaced Google form variations to exact dropdown standard
            const matchedStandard = PRODUCT_TYPES.find(pt => {
                const standardLower = pt.toLowerCase().replace(/s$/, ''); // Remove trailing s for matching
                const valLower = finalReq.toLowerCase().replace(/s$/, '');
                return valLower.includes(standardLower) || standardLower.includes(valLower);
            });
            if (matchedStandard) {
                finalReq = matchedStandard;
            } else if (!finalReq) {
                finalReq = PRODUCT_TYPES[0];
            }

            setProductType(finalReq);
            setDeliveryType(cf['Delivery Type'] || 'Soft Copy');
            setExpertPayment(cf['Expert Payment'] || '');
            setTelecaller(cf['Telecaller'] || '');
            setPriority(cf['Priority'] || 'NORMAL');
            setSpecialInstructions(cf['Special Instructions'] || '');
            setTotalAmount(cf['Decided Price'] || '');
            setAdvancePaid(cf['Advance Paid'] || '');
            setPaymentMode(cf['Payment Mode'] || PAYMENT_MODES[0]);
            setDeliveryDeadline(cf['Delivery Deadline'] || '');
            
            setProjectTopic(cf['Project Topic'] || '');
            setSynopsisDeadline(cf['Synopsis Deadline'] || '');
            setReportDeadline(cf['Report Deadline'] || '');
        }
    }, [studentRes]);

    const createMutation = useMutation({
        mutationFn: async (payload: any) => {
            return studentsAPI.update(id, payload)
        },
        onSuccess: () => {
            toast({
                title: 'Success!',
                description: 'Order updated successfully',
                variant: 'success',
            })
            router.push('/orders')
        },
        onError: (error: any) => {
            toast({
                title: 'Error',
                description: error.response?.data?.message || 'Failed to update order',
                variant: 'destructive',
            })
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!fullName || !phone) {
            toast({ title: 'Error', description: 'Full Name and Phone are required', variant: 'destructive' })
            return
        }

        const customFields: Record<string, any> = {
            'State': state,
            'City': city,
            'Subject Codes': subjectCodes,
            // 'Requirement of' will be set below after cleanup
            'Delivery Type': deliveryType,
            'Expert Payment': expertCostNum,
            'Telecaller': telecaller,
            'Priority': priority,
            'Special Instructions': specialInstructions,
            'Decided Price': amountNum,
            'Advance Paid': advanceNum,
            'Payment Mode': paymentMode,
            'Delivery Deadline': deliveryDeadline,
        }

        if (isProject) {
            if (projectTopic) customFields['Project Topic'] = projectTopic
            if (synopsisDeadline) customFields['Synopsis Deadline'] = synopsisDeadline
            if (reportDeadline) customFields['Report Deadline'] = reportDeadline
        }

        // Clean up empty fields or legacy requirement keys
        Object.keys(customFields).forEach(k => {
            if (customFields[k] === '' || customFields[k] === null || customFields[k] === undefined) {
                delete customFields[k]
            }
            if (k.toLowerCase().includes('requirement of') || k.toLowerCase().includes('requirement in') || k === 'Product Type') {
                delete customFields[k]
            }
        })
        
        customFields['Requirement of'] = productType;

        const payload = {
            fullName,
            enrollmentNo,
            programme,
            course: programme, // Fallback for old schema
            phone,
            email,
            alternatePhone,
            address,
            semester: semester ? Number(semester) : null,
            batchYear: batchYear ? Number(batchYear) : null,
            assignedGuideId: assignedGuideId ? Number(assignedGuideId) : null,
            customFields
        }

        createMutation.mutate(payload)
    }

    return (
        <div className="max-w-6xl mx-auto animate-fade-in pb-10">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/orders">
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Edit Order</h1>
                    <p className="text-muted-foreground">Update order details</p>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* LEFT COLUMN (Student & Payment) */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                        
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
                                        placeholder="Full name" required className="mt-1" 
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Enrollment No.</Label>
                                    <Input 
                                        value={enrollmentNo} onChange={e => setEnrollmentNo(e.target.value)} 
                                        placeholder="IGNOU enrollment" className="mt-1" 
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Phone *</Label>
                                    <Input 
                                        value={phone} onChange={e => setPhone(e.target.value)} 
                                        placeholder="10-digit number" required className="mt-1" 
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Alternate Contact</Label>
                                    <Input 
                                        value={alternatePhone} onChange={e => setAlternatePhone(e.target.value)} 
                                        placeholder="Optional" className="mt-1" 
                                    />
                                </div>
                                <div className="col-span-1">
                                    <Label>Email Id</Label>
                                    <Input 
                                        type="email"
                                        value={email} onChange={e => setEmail(e.target.value)} 
                                        placeholder="Email address" className="mt-1" 
                                    />
                                </div>
                                <div className="col-span-2 sm:col-span-1">
                                    <Label>Program</Label>
                                    <Input 
                                        value={programme} onChange={e => setProgramme(e.target.value)} 
                                        placeholder="e.g. MBAFM" className="mt-1" 
                                    />
                                </div>
                                <div className="grid grid-cols-2 col-span-2 sm:col-span-1 gap-3">
                                    <div>
                                        <Label>Semester</Label>
                                        <Input 
                                            value={semester} onChange={e => setSemester(e.target.value)} 
                                            placeholder="e.g. 1" className="mt-1" type="number"
                                        />
                                    </div>
                                    <div>
                                        <Label>Batch Year</Label>
                                        <Input 
                                            value={batchYear} onChange={e => setBatchYear(e.target.value)} 
                                            placeholder="e.g. 2024" className="mt-1" type="number"
                                        />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <Label>Postal Address</Label>
                                    <Input 
                                        value={address} onChange={e => setAddress(e.target.value)} 
                                        placeholder="Full address" className="mt-1" 
                                    />
                                </div>
                                <div className="grid grid-cols-2 col-span-2 sm:col-span-1 gap-3">
                                    <div>
                                        <Label>State</Label>
                                        <Input 
                                            value={state} onChange={e => setState(e.target.value)} 
                                            placeholder="State" className="mt-1" 
                                        />
                                    </div>
                                    <div>
                                        <Label>City</Label>
                                        <Input 
                                            value={city} onChange={e => setCity(e.target.value)} 
                                            placeholder="City" className="mt-1" 
                                        />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <Label>Subject Codes</Label>
                                    <Input 
                                        value={subjectCodes} onChange={e => setSubjectCodes(e.target.value)} 
                                        placeholder="e.g. MMPC-001, MMPC-002" className="mt-1" 
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
                                        placeholder="e.g. 5000" className="mt-1" 
                                    />
                                </div>
                                <div>
                                    <Label>Advance Paid (₹)</Label>
                                    <Input 
                                        type="number" min="0" value={advancePaid} onChange={e => setAdvancePaid(e.target.value)} 
                                        placeholder="e.g. 2000" className="mt-1" 
                                    />
                                </div>
                                <div>
                                    <Label>Payment Mode</Label>
                                    <select 
                                        value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                                    >
                                        {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label>Delivery Deadline</Label>
                                    <Input 
                                        type="date" value={deliveryDeadline} onChange={e => setDeliveryDeadline(e.target.value)} 
                                        className="mt-1" 
                                    />
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* RIGHT COLUMN (Product & Summary) */}
                    <div className="lg:col-span-5 flex flex-col gap-6">

                        {/* Product & Assignment */}
                        <div className="glass rounded-xl p-5 border border-border">
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
                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                                    >
                                        {!PRODUCT_TYPES.includes(productType) && productType && (
                                            <option value={productType}>{productType} (Custom)</option>
                                        )}
                                        {PRODUCT_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>

                                {isProject && (
                                    <div>
                                        <Label>Project Topic</Label>
                                        <Input 
                                            value={projectTopic} onChange={e => setProjectTopic(e.target.value)}
                                            placeholder="Enter full topic title..." className="mt-1"
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label>Delivery Type</Label>
                                        <select 
                                            value={deliveryType} onChange={e => setDeliveryType(e.target.value)}
                                            className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="Soft Copy">Soft Copy</option>
                                            <option value="Hard Copy">Hard Copy</option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label>Priority</Label>
                                        <select 
                                            value={priority} onChange={e => setPriority(e.target.value)}
                                            className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="LOW">Low</option>
                                            <option value="NORMAL">Normal</option>
                                            <option value="HIGH">High</option>
                                            <option value="URGENT">Urgent!</option>
                                        </select>
                                    </div>
                                </div>

                                {isProject && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label>Synopsis Deadline</Label>
                                            <Input type="date" value={synopsisDeadline} onChange={e => setSynopsisDeadline(e.target.value)} className="mt-1" />
                                        </div>
                                        <div>
                                            <Label>Report Deadline</Label>
                                            <Input type="date" value={reportDeadline} onChange={e => setReportDeadline(e.target.value)} className="mt-1" />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <Label>Assign Expert</Label>
                                    <select 
                                        value={assignedGuideId} onChange={e => setAssignedGuideId(e.target.value)}
                                        className="mt-1 w-full h-10 px-3 rounded-md bg-background border border-input text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="">-- Leave Unassigned --</option>
                                        {guides.map((g: any) => (
                                            <option key={g.id} value={g.id}>{g.fullName} ({g.staffRole})</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <Label>Expert Payment (₹)</Label>
                                    <Input 
                                        type="number" min="0" value={expertPayment} onChange={e => setExpertPayment(e.target.value)}
                                        placeholder="Amount to pay expert" className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>Telecaller / Lead Closer</Label>
                                    <Input 
                                        value={telecaller} onChange={e => setTelecaller(e.target.value)}
                                        placeholder="e.g. Priya Sharma" className="mt-1"
                                    />
                                </div>

                                <div>
                                    <Label>Special Instructions</Label>
                                    <textarea 
                                        value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)}
                                        placeholder="Any specific requirements..." rows={3}
                                        className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-sm resize-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    />
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
                                    disabled={createMutation.isPending}
                                >
                                    {createMutation.isPending ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Updating...</>
                                    ) : (
                                        <><CheckCircle2 className="w-4 h-4" /> Update Order</>
                                    )}
                                </Button>
                            </div>
                        </div>

                    </div>
                </div>
            </form>
        </div>
    )
}
