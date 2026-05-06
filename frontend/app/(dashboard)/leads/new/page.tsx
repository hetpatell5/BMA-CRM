'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Save, Loader2, User, Phone, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { leadsAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

export default function NewLeadPage() {
    const router = useRouter()
    const { toast } = useToast()

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        phone: '',
        alternatePhone: '',
        interestedCourse: '',
        source: 'MANUAL',
        sourceDetails: '',
        priority: 'MEDIUM',
        nextFollowUp: '',
        followUpNotes: '',
    })

    const createMutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            return leadsAPI.create(data)
        },
        onSuccess: () => {
            toast({
                title: 'Success!',
                description: 'Lead created successfully',
                variant: 'success',
            })
            router.push('/leads')
        },
        onError: (error: any) => {
            toast({
                title: 'Error',
                description: error.response?.data?.message || 'Failed to create lead',
                variant: 'destructive',
            })
        },
    })

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!formData.fullName || !formData.phone) {
            toast({
                title: 'Error',
                description: 'Full name and phone are required',
                variant: 'destructive',
            })
            return
        }
        createMutation.mutate(formData)
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Link href="/leads">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Add New Lead</h1>
                    <p className="text-muted-foreground">Create a new lead for your sales pipeline</p>
                </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Contact Information */}
                <div className="glass rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="font-semibold">Contact Information</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="fullName">Full Name *</Label>
                            <Input
                                id="fullName"
                                name="fullName"
                                value={formData.fullName}
                                onChange={handleChange}
                                placeholder="Enter full name"
                                className="mt-1"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="phone">Phone *</Label>
                            <Input
                                id="phone"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="9876543210"
                                className="mt-1"
                                required
                            />
                        </div>
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="lead@example.com"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="alternatePhone">Alternate Phone</Label>
                            <Input
                                id="alternatePhone"
                                name="alternatePhone"
                                value={formData.alternatePhone}
                                onChange={handleChange}
                                placeholder="Optional"
                                className="mt-1"
                            />
                        </div>
                    </div>
                </div>

                {/* Lead Details */}
                <div className="glass rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <Target className="w-5 h-5 text-purple-400" />
                        </div>
                        <h2 className="font-semibold">Lead Details</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="interestedCourse">Interested Course</Label>
                            <Input
                                id="interestedCourse"
                                name="interestedCourse"
                                value={formData.interestedCourse}
                                onChange={handleChange}
                                placeholder="e.g., BCA, MBA"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="source">Lead Source</Label>
                            <select
                                id="source"
                                name="source"
                                value={formData.source}
                                onChange={handleChange}
                                className="mt-1 w-full h-10 px-3 rounded-lg bg-background/50 border border-input text-sm"
                            >
                                <option value="MANUAL">Manual Entry</option>
                                <option value="WEBSITE">Website</option>
                                <option value="REFERRAL">Referral</option>
                                <option value="SOCIAL_MEDIA">Social Media</option>
                                <option value="PHONE_INQUIRY">Phone Inquiry</option>
                                <option value="WALK_IN">Walk In</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="priority">Priority</Label>
                            <select
                                id="priority"
                                name="priority"
                                value={formData.priority}
                                onChange={handleChange}
                                className="mt-1 w-full h-10 px-3 rounded-lg bg-background/50 border border-input text-sm"
                            >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="URGENT">Urgent</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="nextFollowUp">Next Follow-up Date</Label>
                            <Input
                                id="nextFollowUp"
                                name="nextFollowUp"
                                type="date"
                                value={formData.nextFollowUp}
                                onChange={handleChange}
                                className="mt-1"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Label htmlFor="followUpNotes">Notes</Label>
                            <textarea
                                id="followUpNotes"
                                name="followUpNotes"
                                value={formData.followUpNotes}
                                onChange={handleChange}
                                placeholder="Any additional notes about this lead..."
                                rows={3}
                                className="mt-1 w-full px-3 py-2 rounded-lg bg-background/50 border border-input text-sm resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Submit Button */}
                <div className="flex items-center justify-end gap-4">
                    <Link href="/leads">
                        <Button type="button" variant="outline">
                            Cancel
                        </Button>
                    </Link>
                    <Button
                        type="submit"
                        className="gap-2 gradient-primary"
                        disabled={createMutation.isPending}
                    >
                        {createMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Create Lead
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </div>
    )
}

