'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { shiprocketAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X, Package, Truck, CheckCircle2, Loader2, AlertCircle, ExternalLink } from 'lucide-react'

interface ShiprocketModalProps {
    orderId: string
    prefill: {
        customerName?: string
        customerPhone?: string
        shippingAddress?: string
        shippingCity?: string
        shippingState?: string
        shippingPincode?: string
        declaredValue?: string
    }
    onClose: () => void
    onSuccess: (data: any) => void
}

export default function ShiprocketModal({
    orderId,
    prefill,
    onClose,
    onSuccess,
}: ShiprocketModalProps) {
    const { toast } = useToast()

    // Fetch dynamic defaults from backend settings
    const { data: configData } = useQuery({
        queryKey: ['shiprocket-config'],
        queryFn: async () => (await shiprocketAPI.getConfig()).data.data,
        staleTime: 60 * 1000,
    })
    const config = configData || {}

    const [form, setForm] = useState({
        customerName: prefill.customerName || '',
        customerPhone: prefill.customerPhone || '',
        shippingAddress: prefill.shippingAddress || '',
        shippingCity: prefill.shippingCity || '',
        shippingState: prefill.shippingState || '',
        shippingPincode: prefill.shippingPincode || '',
        declaredValue: prefill.declaredValue || '',
        paymentMethod: 'Prepaid' as 'Prepaid' | 'COD',
        weight: '',
        length: '25',
        width: '20',
        height: '5',
        pickupLocationName: 'Office',
    })

    // Apply defaults from settings once config loads
    useEffect(() => {
        if (config.defaultPaymentMethod) {
            setForm(f => ({ ...f, paymentMethod: config.defaultPaymentMethod }))
        }
        if (config.defaultWeight) setForm(f => ({ ...f, weight: config.defaultWeight }))
        if (config.defaultLength) setForm(f => ({ ...f, length: config.defaultLength }))
        if (config.defaultWidth) setForm(f => ({ ...f, width: config.defaultWidth }))
        if (config.defaultHeight) setForm(f => ({ ...f, height: config.defaultHeight }))
        if (config.pickupLocation) setForm(f => ({ ...f, pickupLocationName: config.pickupLocation }))
    }, [config.defaultPaymentMethod, config.defaultWeight, config.defaultLength, config.defaultWidth, config.defaultHeight, config.pickupLocation])

    const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }))

    // Fetch pickup addresses from backend (which fetches from Shiprocket)
    const { data: pickupData, isLoading: loadingPickup } = useQuery({
        queryKey: ['shiprocket-pickups'],
        queryFn: async () => (await shiprocketAPI.getPickupAddresses()).data.data,
        staleTime: 5 * 60 * 1000,
    })
    const pickupAddresses: any[] = pickupData || []

    // Auto-select the first pickup address
    useEffect(() => {
        if (pickupAddresses.length > 0 && !form.pickupLocationName) {
            set('pickupLocationName', pickupAddresses[0].pickup_location || pickupAddresses[0].address)
        }
    }, [pickupAddresses])

    const createMutation = useMutation({
        mutationFn: () => shiprocketAPI.createShipment(orderId, {
            ...form,
            declaredValue: Number(form.declaredValue) || 0,
            weight: Number(form.weight),
            length: Number(form.length),
            width: Number(form.width),
            height: Number(form.height),
        }),
        onSuccess: (res) => {
            toast({
                title: 'Shipment Created!',
                description: `AWB: ${res.data.data?.awb || 'Assigned by Shiprocket'}`,
                variant: 'success',
            })
            onSuccess(res.data.data)
        },
        onError: (err: any) => {
            toast({
                title: 'Shipment Failed',
                description: err?.response?.data?.message || 'Could not create shipment on Shiprocket',
                variant: 'destructive',
            })
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.weight) {
            toast({ title: 'Weight required', description: 'Please enter the package weight in kg', variant: 'destructive' })
            return
        }
        if (!form.pickupLocationName) {
            toast({ title: 'Pickup location required', description: 'Please select a pickup location', variant: 'destructive' })
            return
        }
        createMutation.mutate()
    }

    return (
        <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 !mt-0 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="glass rounded-2xl w-full max-w-2xl border border-orange-500/20 shadow-2xl shadow-orange-500/10 max-h-[90vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold">Ship via Shiprocket</h3>
                            <p className="text-xs text-muted-foreground">Create a shipment for this hard copy order</p>
                        </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-6 space-y-6">

                    {/* Customer Details */}
                    <section>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Package className="w-3.5 h-3.5" /> Customer Details
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="sr-name" className="text-xs mb-1.5 block">Customer Name *</Label>
                                <Input id="sr-name" value={form.customerName} onChange={e => set('customerName', e.target.value)} required placeholder="Full name" />
                            </div>
                            <div>
                                <Label htmlFor="sr-phone" className="text-xs mb-1.5 block">Phone *</Label>
                                <Input id="sr-phone" value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} required placeholder="10-digit mobile" />
                            </div>
                            <div className="sm:col-span-2">
                                <Label htmlFor="sr-addr" className="text-xs mb-1.5 block">Shipping Address *</Label>
                                <Input id="sr-addr" value={form.shippingAddress} onChange={e => set('shippingAddress', e.target.value)} required placeholder="House No, Street, Area" />
                            </div>
                            <div>
                                <Label htmlFor="sr-city" className="text-xs mb-1.5 block">City *</Label>
                                <Input id="sr-city" value={form.shippingCity} onChange={e => set('shippingCity', e.target.value)} required placeholder="City" />
                            </div>
                            <div>
                                <Label htmlFor="sr-state" className="text-xs mb-1.5 block">State *</Label>
                                <Input id="sr-state" value={form.shippingState} onChange={e => set('shippingState', e.target.value)} required placeholder="State" />
                            </div>
                            <div>
                                <Label htmlFor="sr-pin" className="text-xs mb-1.5 block">Pincode *</Label>
                                <Input id="sr-pin" value={form.shippingPincode} onChange={e => set('shippingPincode', e.target.value)} required placeholder="6-digit pincode" maxLength={6} />
                            </div>
                        </div>
                    </section>

                    {/* Package Details */}
                    <section>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Package className="w-3.5 h-3.5" /> Package Details
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                                <Label htmlFor="sr-weight" className="text-xs mb-1.5 block">Weight (kg) *</Label>
                                <Input id="sr-weight" type="number" step="0.01" min="0.1" value={form.weight} onChange={e => set('weight', e.target.value)} required placeholder="e.g. 0.5" />
                            </div>
                            <div>
                                <Label htmlFor="sr-length" className="text-xs mb-1.5 block">Length (cm)</Label>
                                <Input id="sr-length" type="number" value={form.length} onChange={e => set('length', e.target.value)} placeholder="25" />
                            </div>
                            <div>
                                <Label htmlFor="sr-width" className="text-xs mb-1.5 block">Width (cm)</Label>
                                <Input id="sr-width" type="number" value={form.width} onChange={e => set('width', e.target.value)} placeholder="20" />
                            </div>
                            <div>
                                <Label htmlFor="sr-height" className="text-xs mb-1.5 block">Height (cm)</Label>
                                <Input id="sr-height" type="number" value={form.height} onChange={e => set('height', e.target.value)} placeholder="5" />
                            </div>
                        </div>
                    </section>

                    {/* Payment & Value */}
                    <section>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Payment
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <Label className="text-xs mb-1.5 block">Payment Mode *</Label>
                                <div className="flex rounded-lg border border-border overflow-hidden">
                                    {(['Prepaid', 'COD'] as const).map(mode => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => set('paymentMethod', mode)}
                                            className={`flex-1 py-2 text-sm font-medium transition-colors ${
                                                form.paymentMethod === mode
                                                    ? 'bg-orange-500 text-white'
                                                    : 'text-muted-foreground hover:bg-white/5'
                                            }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Label htmlFor="sr-value" className="text-xs mb-1.5 block">
                                    Order Value (₹) {form.paymentMethod === 'COD' && <span className="text-orange-400">*</span>}
                                </Label>
                                <Input
                                    id="sr-value"
                                    type="number"
                                    min="0"
                                    value={form.declaredValue}
                                    onChange={e => set('declaredValue', e.target.value)}
                                    placeholder="Amount in ₹"
                                    required={form.paymentMethod === 'COD'}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Pickup Location */}
                    <section>
                        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                            Pickup Location *
                        </h4>
                        {loadingPickup ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" /> Fetching your Shiprocket pickup addresses...
                            </div>
                        ) : pickupAddresses.length === 0 ? (
                            <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                No pickup addresses found. Please configure one in your Shiprocket account.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {pickupAddresses.map((addr: any, i: number) => {
                                    const locationName = addr.pickup_location || addr.address || `Location ${i + 1}`
                                    return (
                                        <label
                                            key={i}
                                            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                                                form.pickupLocationName === locationName
                                                    ? 'border-orange-500/40 bg-orange-500/10'
                                                    : 'border-border hover:bg-white/5'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="pickupLocation"
                                                value={locationName}
                                                checked={form.pickupLocationName === locationName}
                                                onChange={() => set('pickupLocationName', locationName)}
                                                className="mt-0.5 accent-orange-500"
                                            />
                                            <div>
                                                <p className="text-sm font-medium">{locationName}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {[addr.address, addr.city, addr.state, addr.pin_code].filter(Boolean).join(', ')}
                                                </p>
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        )}
                    </section>
                </form>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 shrink-0 flex items-center justify-between gap-4">
                    <p className="text-xs text-muted-foreground">
                        This will create an order in your Shiprocket account and save the AWB back here.
                    </p>
                    <div className="flex items-center gap-3 shrink-0">
                        <Button variant="ghost" onClick={onClose} disabled={createMutation.isPending}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={createMutation.isPending || loadingPickup}
                            className="gap-2 bg-orange-500 hover:bg-orange-600 text-white border-0 rounded-lg"
                        >
                            {createMutation.isPending ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Creating Shipment...</>
                            ) : (
                                <><Truck className="w-4 h-4" /> Create Shipment</>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
