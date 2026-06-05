'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import axios from 'axios'
import { CheckCircle, AlertCircle, Loader2, Send, GraduationCap } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

type FieldType =
    | 'short_text' | 'long_text' | 'email' | 'number' | 'date'
    | 'dropdown' | 'multiple_choice' | 'checkboxes' | 'file_upload' | 'section_header'

interface FormField {
    id: string
    type: FieldType
    label: string
    description?: string
    required: boolean
    options?: string[]
    placeholder?: string
}

interface FormTemplate {
    id: number
    name: string
    description: string
    fields: FormField[]
}

export default function PublicFormPage({ params }: { params: { id: string } }) {
    const { id } = params
    const searchParams = useSearchParams()
    const telecallerId = searchParams.get('ref')
    const [responses, setResponses] = useState<Record<string, any>>({})
    const [submitted, setSubmitted] = useState(false)
    const [errors, setErrors] = useState<Record<string, string>>({})

    const { data, isLoading, isError } = useQuery({
        queryKey: ['public-form', id],
        queryFn: async () => {
            const res = await axios.get(`${API}/templates/public/${id}`)
            return res.data.data as FormTemplate
        },
        retry: false,
    })

    const submitMutation = useMutation({
        mutationFn: async (responses: Record<string, any>) => {
            const res = await axios.post(`${API}/templates/public/${id}/submit`, {
                responses,
                ...(telecallerId && { telecallerId }),
            })
            return res.data
        },
        onSuccess: () => setSubmitted(true),
    })

    const handleChange = (label: string, value: any) => {
        setResponses(prev => ({ ...prev, [label]: value }))
        if (errors[label]) {
            setErrors(prev => { const e = { ...prev }; delete e[label]; return e })
        }
    }

    const handleCheckbox = (label: string, option: string, checked: boolean) => {
        setResponses(prev => {
            const current: string[] = prev[label] || []
            return { ...prev, [label]: checked ? [...current, option] : current.filter(o => o !== option) }
        })
    }

    const validate = () => {
        const newErrors: Record<string, string> = {}
        data?.fields?.forEach(field => {
            if (field.type === 'section_header') return
            if (field.required) {
                const val = responses[field.label]
                if (!val || (Array.isArray(val) && val.length === 0) || String(val).trim() === '') {
                    newErrors[field.label] = 'This field is required'
                }
            }
        })
        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!validate()) return
        submitMutation.mutate(responses)
    }

    // ── Loading ──
    if (isLoading) return (
        <div className="min-h-screen bg-[#f0ebff] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#7c4dff]" />
        </div>
    )

    // ── Not found ──
    if (isError || !data) return (
        <div className="min-h-screen bg-[#f0ebff] flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-800 mb-2">Form not found</h2>
                <p className="text-gray-500">This form is either unavailable or has been deactivated.</p>
            </div>
        </div>
    )

    // ── Success ──
    if (submitted) return (
        <div className="min-h-screen bg-[#f0ebff] flex items-center justify-center p-6">
            <div className="bg-white rounded-2xl shadow-md p-10 max-w-md w-full text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-3">Thank you!</h2>
                <p className="text-gray-500 text-sm">
                    Your response to <strong className="text-gray-700">{data.name}</strong> has been received.
                    Our team will get back to you shortly.
                </p>
            </div>
        </div>
    )

    // ── Form ──
    return (
        <div className="min-h-screen bg-[#f0ebff] py-8 px-4 font-sans">
            <div className="max-w-2xl mx-auto">

                {/* Branding */}
                <div className="flex items-center gap-2 mb-6 justify-center opacity-60">
                    <GraduationCap className="w-4 h-4 text-[#7c4dff]" />
                    <span className="text-xs text-gray-600 font-medium">Powered by BMA CRM</span>
                </div>

                {/* Header card */}
                <div className="bg-white rounded-xl shadow-sm border-t-8 border-[#7c4dff] mb-4 overflow-hidden">
                    <div className="p-6 pb-5">
                        <h1 className="text-2xl font-bold text-gray-800">{data.name}</h1>
                        {data.description && <p className="text-sm text-gray-500 mt-1">{data.description}</p>}
                        <p className="text-xs text-red-500 mt-3">* Required</p>
                    </div>
                </div>

                {/* Fields */}
                <form onSubmit={handleSubmit} className="space-y-3">
                    {data.fields.map(field => (
                        <div key={field.id} className="bg-white rounded-xl shadow-sm p-5">
                            {field.type === 'section_header' ? (
                                <div className="border-b border-gray-200 pb-3">
                                    <h2 className="text-base font-semibold text-gray-800">{field.label}</h2>
                                    {field.description && <p className="text-sm text-gray-500 mt-0.5">{field.description}</p>}
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-800 mb-2">
                                        {field.label}
                                        {field.required && <span className="text-red-500 ml-1">*</span>}
                                    </label>
                                    {field.description && (
                                        <p className="text-xs text-gray-500 mb-2">{field.description}</p>
                                    )}

                                    {/* Short text / email / number */}
                                    {(field.type === 'short_text' || field.type === 'email' || field.type === 'number') && (
                                        <input
                                            type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                                            value={responses[field.label] || ''}
                                            onChange={e => handleChange(field.label, e.target.value)}
                                            placeholder={field.placeholder || 'Your answer'}
                                            className="w-full border-b border-gray-300 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-[#7c4dff] focus:outline-none bg-transparent transition-colors"
                                        />
                                    )}

                                    {/* Long text */}
                                    {field.type === 'long_text' && (
                                        <textarea
                                            value={responses[field.label] || ''}
                                            onChange={e => handleChange(field.label, e.target.value)}
                                            placeholder={field.placeholder || 'Your answer'}
                                            rows={3}
                                            className="w-full border-b border-gray-300 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-[#7c4dff] focus:outline-none bg-transparent transition-colors resize-none"
                                        />
                                    )}

                                    {/* Date */}
                                    {field.type === 'date' && (
                                        <input
                                            type="date"
                                            value={responses[field.label] || ''}
                                            onChange={e => handleChange(field.label, e.target.value)}
                                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:border-[#7c4dff] focus:ring-1 focus:ring-[#7c4dff] focus:outline-none bg-white"
                                        />
                                    )}

                                    {/* Dropdown */}
                                    {field.type === 'dropdown' && (
                                        <select
                                            value={responses[field.label] || ''}
                                            onChange={e => handleChange(field.label, e.target.value)}
                                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:border-[#7c4dff] focus:ring-1 focus:ring-[#7c4dff] focus:outline-none bg-white"
                                        >
                                            <option value="">Choose an option</option>
                                            {field.options?.map((opt, i) => (
                                                <option key={i} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    )}

                                    {/* Multiple choice */}
                                    {field.type === 'multiple_choice' && field.options?.map((opt, i) => (
                                        <label key={i} className="flex items-center gap-3 mb-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name={field.label}
                                                value={opt}
                                                checked={responses[field.label] === opt}
                                                onChange={() => handleChange(field.label, opt)}
                                                className="w-4 h-4 accent-[#7c4dff]"
                                            />
                                            <span className="text-sm text-gray-700">{opt}</span>
                                        </label>
                                    ))}

                                    {/* Checkboxes */}
                                    {field.type === 'checkboxes' && field.options?.map((opt, i) => (
                                        <label key={i} className="flex items-center gap-3 mb-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={(responses[field.label] || []).includes(opt)}
                                                onChange={e => handleCheckbox(field.label, opt, e.target.checked)}
                                                className="w-4 h-4 rounded accent-[#7c4dff]"
                                            />
                                            <span className="text-sm text-gray-700">{opt}</span>
                                        </label>
                                    ))}

                                    {/* File upload (UI only — actual upload out of scope) */}
                                    {field.type === 'file_upload' && (
                                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center text-sm text-gray-400">
                                            Click to upload or drag & drop
                                        </div>
                                    )}

                                    {/* Error */}
                                    {errors[field.label] && (
                                        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> {errors[field.label]}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Submit */}
                    <div className="flex items-center justify-between pt-2 pb-10">
                        <button
                            type="submit"
                            disabled={submitMutation.isPending}
                            className="flex items-center gap-2 bg-[#7c4dff] hover:bg-[#6a3ff3] text-white text-sm font-semibold px-8 py-3 rounded-lg transition-colors disabled:opacity-70"
                        >
                            {submitMutation.isPending
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                                : <><Send className="w-4 h-4" /> Submit</>
                            }
                        </button>
                        <button type="button" onClick={() => setResponses({})} className="text-sm text-gray-400 hover:text-gray-600">
                            Clear form
                        </button>
                    </div>

                    {submitMutation.isError && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            Something went wrong. Please try again.
                        </div>
                    )}
                </form>
            </div>
        </div>
    )
}
