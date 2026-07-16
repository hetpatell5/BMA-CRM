'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templatesAPI } from '@/lib/api'
import {
    Plus, Trash2, Edit, FileText, Type, CheckSquare,
    List, Calendar, Image as ImageIcon, ExternalLink,
    Save, ArrowLeft, Eye, EyeOff, GripVertical, Copy,
    ClipboardList, ToggleLeft, AlignLeft, Hash, Radio,
    X, ChevronUp, ChevronDown, Loader2, Share2, Link2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/authStore'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type FieldType =
    | 'short_text'
    | 'long_text'
    | 'email'
    | 'number'
    | 'date'
    | 'dropdown'
    | 'multiple_choice'   // radio
    | 'checkboxes'        // multi-select
    | 'file_upload'
    | 'section_header'    // decorative divider/title

interface FormField {
    id: string
    type: FieldType
    label: string
    description?: string
    required: boolean
    options?: string[]      // for dropdown / multiple_choice / checkboxes
    placeholder?: string
}

interface FormTemplate {
    id: number
    name: string
    description: string
    fields: FormField[]
    isActive: boolean
    createdAt?: string
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const FIELD_DEFS: { type: FieldType; label: string; icon: React.ElementType; color: string }[] = [
    { type: 'short_text',      label: 'Short Answer',     icon: Type,           color: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-800' },
    { type: 'long_text',       label: 'Paragraph',        icon: AlignLeft,      color: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-400 dark:border-indigo-800' },
    { type: 'email',           label: 'Email',            icon: ExternalLink,   color: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-400 dark:border-cyan-800' },
    { type: 'number',          label: 'Number',           icon: Hash,           color: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-400 dark:border-purple-800' },
    { type: 'date',            label: 'Date',             icon: Calendar,       color: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-400 dark:border-rose-800' },
    { type: 'dropdown',        label: 'Dropdown',         icon: List,           color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800' },
    { type: 'multiple_choice', label: 'Multiple Choice',  icon: Radio,          color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-400 dark:border-green-800' },
    { type: 'checkboxes',      label: 'Checkboxes',       icon: CheckSquare,    color: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-400 dark:border-teal-800' },
    { type: 'file_upload',     label: 'File Upload',      icon: ImageIcon,      color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-800' },
    { type: 'section_header',  label: 'Section Header',   icon: ClipboardList,  color: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700' },
]

const getFieldDef = (type: FieldType) => FIELD_DEFS.find(d => d.type === type)!
const uid = () => Math.random().toString(36).slice(2, 11)

// ─────────────────────────────────────────────
// Preview Component (Google-Forms look)
// ─────────────────────────────────────────────
function FormPreview({ name, description, fields }: { name: string; description: string; fields: FormField[] }) {
    return (
        <div className="max-w-2xl mx-auto font-sans">
            {/* Header card */}
            <div className="rounded-t-xl border-t-8 border-[#7c4dff] bg-white shadow-md mb-4 overflow-hidden">
                <div className="p-6">
                    <h1 className="text-2xl font-semibold text-gray-800">{name || 'Untitled Form'}</h1>
                    {description && <p className="text-sm text-gray-600 mt-1">{description}</p>}
                    <p className="text-xs text-red-500 mt-3">* Required</p>
                </div>
            </div>

            {/* Fields */}
            <div className="space-y-3">
                {fields.map(field => (
                    <div key={field.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                        {field.type === 'section_header' ? (
                            <div>
                                <h2 className="text-lg font-medium text-gray-800 border-b pb-2">{field.label}</h2>
                                {field.description && <p className="text-sm text-gray-500 mt-1">{field.description}</p>}
                            </div>
                        ) : (
                            <div>
                                <p className="text-sm text-gray-800 mb-1 font-medium">
                                    {field.label}
                                    {field.required && <span className="text-red-500 ml-1">*</span>}
                                </p>
                                {field.description && <p className="text-xs text-gray-500 mb-2">{field.description}</p>}

                                {(field.type === 'short_text' || field.type === 'email' || field.type === 'number') && (
                                    <input type="text" placeholder={field.placeholder || 'Your answer'} readOnly
                                        className="w-full border-b border-gray-400 outline-none text-sm py-1 bg-transparent text-gray-400 placeholder-gray-400" />
                                )}
                                {field.type === 'long_text' && (
                                    <textarea readOnly placeholder={field.placeholder || 'Your answer'}
                                        className="w-full border-b border-gray-400 outline-none text-sm py-1 bg-transparent text-gray-400 placeholder-gray-400 resize-none" rows={2} />
                                )}
                                {field.type === 'date' && (
                                    <div className="flex items-center gap-2 border-b border-gray-400 pb-1">
                                        <span className="text-sm text-gray-400">dd/mm/yyyy</span>
                                        <Calendar className="w-4 h-4 text-gray-400 ml-auto" />
                                    </div>
                                )}
                                {field.type === 'dropdown' && (
                                    <select disabled className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-400 bg-white">
                                        <option>Choose</option>
                                        {field.options?.map((o, i) => <option key={i}>{o}</option>)}
                                    </select>
                                )}
                                {field.type === 'multiple_choice' && field.options?.map((opt, i) => (
                                    <label key={i} className="flex items-center gap-2 mb-1.5 text-sm text-gray-700">
                                        <input type="radio" disabled className="accent-[#7c4dff]" /> {opt}
                                    </label>
                                ))}
                                {field.type === 'checkboxes' && field.options?.map((opt, i) => (
                                    <label key={i} className="flex items-center gap-2 mb-1.5 text-sm text-gray-700">
                                        <input type="checkbox" disabled className="accent-[#7c4dff]" /> {opt}
                                    </label>
                                ))}
                                {field.type === 'file_upload' && (
                                    <div className="mt-1 border-2 border-dashed border-gray-300 rounded p-3 text-center text-xs text-gray-400">
                                        Click to upload file
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between mt-5 mb-10">
                <button disabled className="bg-[#7c4dff] text-white text-sm font-medium px-8 py-2 rounded opacity-70 cursor-default">
                    Submit
                </button>
                <span className="text-xs text-gray-400">Page 1 of 1</span>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// Single Field Editor Row
// ─────────────────────────────────────────────
function FieldEditor({
    field, index, total,
    onChange, onRemove, onMove,
}: {
    field: FormField
    index: number
    total: number
    onChange: (updates: Partial<FormField>) => void
    onRemove: () => void
    onMove: (dir: -1 | 1) => void
}) {
    const def = getFieldDef(field.type)
    const Icon = def.icon
    const hasOptions = ['dropdown', 'multiple_choice', 'checkboxes'].includes(field.type)

    const addOption = () => {
        onChange({ options: [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`] })
    }
    const updateOption = (i: number, val: string) => {
        const opts = [...(field.options || [])]
        opts[i] = val
        onChange({ options: opts })
    }
    const removeOption = (i: number) => {
        onChange({ options: (field.options || []).filter((_, idx) => idx !== i) })
    }

    return (
        <div className="glass rounded-xl border border-white/10 p-4 group transition-all hover:border-white/20">
            <div className="flex items-start gap-3">
                {/* Drag handle + move */}
                <div className="flex flex-col items-center gap-0.5 pt-1 text-muted-foreground">
                    <button onClick={() => onMove(-1)} disabled={index === 0}
                        className="hover:text-foreground disabled:opacity-20 p-0.5">
                        <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <GripVertical className="w-4 h-4 opacity-40" />
                    <button onClick={() => onMove(1)} disabled={index === total - 1}
                        className="hover:text-foreground disabled:opacity-20 p-0.5">
                        <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="flex-1 space-y-3">
                    {/* Type badge + label */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${def.color}`}>
                            <Icon className="w-3 h-3" /> {def.label}
                        </span>
                        {field.type !== 'section_header' && (
                            <div className="flex items-center gap-1.5 ml-auto">
                                <span className="text-xs text-muted-foreground">Required</span>
                                <Switch
                                    checked={field.required}
                                    onCheckedChange={v => onChange({ required: v })}
                                    className="scale-75"
                                />
                            </div>
                        )}
                    </div>

                    {/* Label */}
                    <Input
                        value={field.label}
                        onChange={e => onChange({ label: e.target.value })}
                        placeholder={field.type === 'section_header' ? 'Section title…' : 'Question label…'}
                        className="bg-white/5 border-white/10 text-sm font-medium"
                    />

                    {/* Description */}
                    <Input
                        value={field.description || ''}
                        onChange={e => onChange({ description: e.target.value })}
                        placeholder="Description / hint (optional)"
                        className="bg-white/5 border-white/10 text-xs text-muted-foreground"
                    />

                    {/* Placeholder for text fields */}
                    {['short_text', 'long_text', 'email', 'number'].includes(field.type) && (
                        <Input
                            value={field.placeholder || ''}
                            onChange={e => onChange({ placeholder: e.target.value })}
                            placeholder="Placeholder text (e.g. Your answer)"
                            className="bg-white/5 border-white/10 text-xs"
                        />
                    )}

                    {/* Options */}
                    {hasOptions && (
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">Options</p>
                            {(field.options || []).map((opt, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    {field.type === 'multiple_choice' && <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground shrink-0" />}
                                    {field.type === 'checkboxes' && <div className="w-3.5 h-3.5 rounded border-2 border-muted-foreground shrink-0" />}
                                    {field.type === 'dropdown' && <span className="text-xs text-muted-foreground shrink-0">{i + 1}.</span>}
                                    <Input
                                        value={opt}
                                        onChange={e => updateOption(i, e.target.value)}
                                        placeholder={`Option ${i + 1}`}
                                        className="h-8 bg-white/5 border-white/10 text-xs"
                                    />
                                    <button onClick={() => removeOption(i)} className="text-muted-foreground hover:text-red-400">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            <button onClick={addOption}
                                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1">
                                <Plus className="w-3 h-3" /> Add option
                            </button>
                        </div>
                    )}
                </div>

                {/* Remove */}
                <button onClick={onRemove}
                    className="text-muted-foreground hover:text-red-400 mt-1 transition-colors opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// Form Builder (full-page editor view)
// ─────────────────────────────────────────────
function FormBuilder({
    initialData,
    onDone,
}: {
    initialData: FormTemplate | null
    onDone: () => void
}) {
    const queryClient = useQueryClient()
    const { toast } = useToast()

    const [name,        setName]        = useState(initialData?.name        || '')
    const [description, setDescription] = useState(initialData?.description || '')
    const [isActive,    setIsActive]    = useState(initialData?.isActive    ?? true)
    const [fields,      setFields]      = useState<FormField[]>(initialData?.fields || [])
    const [preview,     setPreview]     = useState(false)
    const [showBackConfirm, setShowBackConfirm] = useState(false)
    const [savedOnce,   setSavedOnce]   = useState(!!initialData)

    const addField = (type: FieldType) => {
        const def = getFieldDef(type)
        const hasOptions = ['dropdown', 'multiple_choice', 'checkboxes'].includes(type)
        setFields(prev => [...prev, {
            id: uid(),
            type,
            label: type === 'section_header' ? 'New Section' : `${def.label} Question`,
            description: '',
            required: type !== 'section_header',
            placeholder: '',
            options: hasOptions ? ['Option 1', 'Option 2'] : undefined,
        }])
    }

    const updateField = useCallback((index: number, updates: Partial<FormField>) => {
        setFields(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f))
    }, [])

    const removeField = useCallback((index: number) => {
        setFields(prev => prev.filter((_, i) => i !== index))
    }, [])

    const moveField = useCallback((index: number, dir: -1 | 1) => {
        setFields(prev => {
            const arr = [...prev]
            const target = index + dir
            if (target < 0 || target >= arr.length) return arr
            ;[arr[index], arr[target]] = [arr[target], arr[index]]
            return arr
        })
    }, [])

    const saveMutation = useMutation({
        mutationFn: async (draft: boolean) => {
            const activeValue = draft ? false : isActive
            const payload = { name, description, fields, isActive: activeValue }
            if (initialData) return templatesAPI.update(initialData.id, payload)
            return templatesAPI.create(payload)
        },
        onSuccess: (_data, draft) => {
            queryClient.invalidateQueries({ queryKey: ['templates'] })
            setSavedOnce(true)
            toast({
                title: draft ? 'Saved as Draft!' : (initialData ? 'Template updated!' : 'Template created!'),
                description: draft ? 'You can activate it later from the template gallery.' : undefined,
            })
            onDone()
        },
        onError: (err: any) => {
            toast({
                title: 'Error saving template',
                description: err.response?.data?.message || err.message,
                variant: 'destructive'
            })
        }
    })

    const handleBack = () => {
        // If nothing entered, just go back
        if (!name.trim() && fields.length === 0) {
            onDone()
            return
        }
        setShowBackConfirm(true)
    }

    return (
        <div className="flex flex-col">
            {/* ── Back Confirm Modal ── */}
            {showBackConfirm && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex items-center justify-center z-50 p-4">
                    <div className="glass rounded-2xl p-6 max-w-sm w-full border border-white/10 space-y-4 animate-fade-in">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                <ArrowLeft className="w-5 h-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold">Leave without saving?</h3>
                                <p className="text-sm text-muted-foreground">Your form has unsaved changes.</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Button
                                className="w-full gradient-primary gap-2"
                                disabled={saveMutation.isPending || !name.trim()}
                                onClick={() => { setShowBackConfirm(false); saveMutation.mutate(false) }}
                            >
                                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Save & Exit
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full gap-2 border-white/10"
                                disabled={saveMutation.isPending || !name.trim()}
                                onClick={() => { setShowBackConfirm(false); saveMutation.mutate(true) }}
                            >
                                <FileText className="w-4 h-4" />
                                Save as Draft & Exit
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => { setShowBackConfirm(false); onDone() }}
                            >
                                Discard & Leave
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full text-muted-foreground"
                                onClick={() => setShowBackConfirm(false)}
                            >
                                Keep Editing
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top bar */}
            <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-10 py-5 flex items-center justify-between gap-3 transition-all">
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="hidden sm:block">
                        <p className="text-sm font-semibold text-foreground/90 truncate max-w-[200px]">{name || 'Untitled Form'}</p>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">
                            {saveMutation.isPending ? 'Saving...' : savedOnce ? 'Saved' : 'Draft'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground hidden sm:block">Active</span>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                    <button
                        onClick={() => setPreview(p => !p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border
                            ${preview
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-white/5 text-muted-foreground border-white/10 hover:text-foreground'}`}
                    >
                        {preview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        <span className="hidden sm:inline">{preview ? 'Builder' : 'Preview'}</span>
                    </button>
                    {/* Save as Draft */}
                    <Button
                        variant="outline"
                        onClick={() => saveMutation.mutate(true)}
                        disabled={saveMutation.isPending || !name.trim()}
                        className="gap-2 border-white/10 hidden sm:flex"
                        title="Save without activating"
                    >
                        {saveMutation.isPending
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <FileText className="w-4 h-4" />
                        }
                        Draft
                    </Button>
                    {/* Save & Publish */}
                    <Button
                        onClick={() => saveMutation.mutate(false)}
                        disabled={saveMutation.isPending || !name.trim()}
                        className="gap-2 gradient-primary"
                    >
                        {saveMutation.isPending
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                            : <><Save className="w-4 h-4" /> Save</>
                        }
                    </Button>
                </div>
            </div>

            <div className="flex-1 p-6">
                {preview ? (
                    /* ═══ PREVIEW ═══ */
                    <div className="bg-[#f0ebff] min-h-screen rounded-xl p-6">
                        <FormPreview name={name} description={description} fields={fields} />
                    </div>
                ) : (
                    /* ═══ BUILDER ═══ */
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Form Header (Clean, Document Style) */}
                        <div className="py-4 sm:py-8 space-y-4 mb-2">
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Form Title"
                                className="w-full bg-transparent border-none text-4xl sm:text-5xl font-bold tracking-tight px-0 py-2 focus:ring-0 focus:outline-none placeholder:text-white/20 text-foreground"
                            />
                            <div className="h-px w-24 bg-primary/30" />
                            <input
                                type="text"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Briefly describe what this form is for..."
                                className="w-full bg-transparent border-none text-lg text-muted-foreground px-0 py-2 focus:ring-0 focus:outline-none placeholder:text-white/20"
                            />
                        </div>

                        {/* Field picker */}
                        <div className="glass rounded-2xl border border-white/10 p-5">
                            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                Add Field
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                {FIELD_DEFS.map(fd => {
                                    const Icon = fd.icon
                                    return (
                                        <button
                                            key={fd.type}
                                            onClick={() => addField(fd.type)}
                                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium
                                                transition-all hover:scale-105 active:scale-95 ${fd.color}`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            {fd.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Fields list */}
                        <div className="space-y-3">
                            {fields.length === 0 && (
                                <div className="glass rounded-2xl border-2 border-dashed border-white/10 p-12 text-center">
                                    <ClipboardList className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                                    <p className="text-muted-foreground">No fields yet — click a type above to add your first question</p>
                                </div>
                            )}
                            {fields.map((field, index) => (
                                <FieldEditor
                                    key={field.id}
                                    field={field}
                                    index={index}
                                    total={fields.length}
                                    onChange={updates => updateField(index, updates)}
                                    onRemove={() => removeField(index)}
                                    onMove={dir => moveField(index, dir)}
                                />
                            ))}
                        </div>

                        {fields.length > 0 && (
                            <div className="text-center text-xs text-muted-foreground">
                                {fields.length} field{fields.length !== 1 ? 's' : ''} · Click a type above to add more
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────
// Main Page — Template Gallery
// ─────────────────────────────────────────────
export default function FormTemplatesPage() {
    const { toast } = useToast()
    const queryClient = useQueryClient()
    const { user: currentUser } = useAuthStore()
    const canManageTemplates = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER'

    const [editing, setEditing] = useState<FormTemplate | null>(null)
    const [building, setBuilding] = useState(false)

    // Share template — generate public URL and copy to clipboard
    const shareTemplate = (t: FormTemplate) => {
        const url = `${window.location.origin}/form/${t.id}`
        navigator.clipboard.writeText(url).then(() => {
            toast({ title: '🔗 Link copied!', description: url })
        }).catch(() => {
            toast({ title: 'Share URL', description: url })
        })
    }

    // Fetch
    const { data, isLoading } = useQuery({
        queryKey: ['templates'],
        queryFn: async () => {
            const res = await templatesAPI.getAll()
            return (res.data?.data || []) as FormTemplate[]
        },
        enabled: canManageTemplates,
    })

    const templates = data || []

    // Delete
    const deleteMutation = useMutation({
        mutationFn: (id: number) => templatesAPI.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['templates'] })
            toast({ title: 'Template deleted' })
        },
        onError: (err: any) => {
            toast({ title: 'Delete failed', description: err.response?.data?.message, variant: 'destructive' })
        }
    })

    // Duplicate
    const duplicateMutation = useMutation({
        mutationFn: (t: FormTemplate) => templatesAPI.create({
            name: `${t.name} (Copy)`,
            description: t.description,
            fields: t.fields,
            isActive: false,
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['templates'] })
            toast({ title: 'Template duplicated as Draft!' })
        }
    })

    if (!canManageTemplates) {
        return (
            <div className="glass rounded-2xl border border-white/10 p-12 text-center">
                <ClipboardList className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
                <h2 className="text-lg font-semibold mb-2">Form Templates</h2>
                <p className="text-sm text-muted-foreground">Only admins and leaders can access this page.</p>
            </div>
        )
    }

    if (building) {
        return (
            // Break out of main's padding (p-3 sm:p-4 md:p-6) to go edge-to-edge
            <div className="-mx-3 sm:-mx-4 md:-mx-6 -mt-3 sm:-mt-4 md:-mt-6">
                <FormBuilder
                    initialData={editing}
                    onDone={() => { setBuilding(false); setEditing(null) }}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">
                        Form Templates
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Build dynamic enquiry forms to send to customers — inspired by Google Forms
                    </p>
                </div>
                <Button
                    onClick={() => { setEditing(null); setBuilding(true) }}
                    className="gap-2 gradient-primary shadow-lg"
                >
                    <Plus className="w-4 h-4" />
                    New Template
                </Button>
            </div>

            {/* Template Cards */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-52 rounded-2xl" />)}
                </div>
            ) : templates.length === 0 ? (
                <div className="glass rounded-2xl border-2 border-dashed border-white/10 p-16 text-center">
                    <ClipboardList className="w-14 h-14 mx-auto mb-4 text-muted-foreground opacity-30" />
                    <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                    <p className="text-muted-foreground mb-6">Create your first Google Forms-style enquiry template</p>
                    <Button onClick={() => { setEditing(null); setBuilding(true) }} className="gradient-primary gap-2">
                        <Plus className="w-4 h-4" /> Create First Template
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {templates.map(t => {
                        // count field types
                        const typeCount = t.fields.reduce<Record<string, number>>((acc, f) => {
                            acc[f.type] = (acc[f.type] || 0) + 1
                            return acc
                        }, {})
                        const topTypes = Object.entries(typeCount).slice(0, 3)

                        return (
                            <div key={t.id}
                                className="glass rounded-2xl border border-white/10 p-5 flex flex-col gap-4 hover:border-white/20 transition-all hover:shadow-lg hover:shadow-violet-500/5 group">
                                {/* Card header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-600/30 flex items-center justify-center border border-violet-500/20">
                                            <ClipboardList className="w-5 h-5 text-violet-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-foreground/90 text-sm leading-tight">{t.name}</h3>
                                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full mt-0.5 border
                                                ${t.isActive
                                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                                : 'bg-white/5 text-muted-foreground border-white/10'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${t.isActive ? 'bg-green-500 animate-pulse' : 'bg-white/30'}`} />
                                                {t.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {t.isActive && (
                                            <button
                                                onClick={() => shareTemplate(t)}
                                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-green-500/20 flex items-center justify-center text-muted-foreground hover:text-green-400 transition-colors"
                                                title="Share — copy public link">
                                                <Share2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => duplicateMutation.mutate(t)}
                                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                                            title="Duplicate">
                                            <Copy className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => { setEditing(t); setBuilding(true) }}
                                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-blue-500/20 flex items-center justify-center text-muted-foreground hover:text-blue-400 transition-colors"
                                            title="Edit">
                                            <Edit className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => deleteMutation.mutate(t.id)}
                                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-red-500/20 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors"
                                            title="Delete">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Description */}
                                {t.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                                )}

                                {/* Fields preview */}
                                <div className="flex-1">
                                    <div className="space-y-1.5">
                                        {t.fields.slice(0, 4).map((f, i) => {
                                            const def = getFieldDef(f.type)
                                            const FieldIcon = def.icon
                                            return (
                                                <div key={f.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <FieldIcon className="w-3 h-3 shrink-0" />
                                                    <span className="truncate">{f.label}</span>
                                                    {f.required && <span className="text-red-400 shrink-0">*</span>}
                                                </div>
                                            )
                                        })}
                                        {t.fields.length > 4 && (
                                            <p className="text-xs text-muted-foreground ml-5">+{t.fields.length - 4} more fields</p>
                                        )}
                                    </div>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                    <div className="flex gap-1.5 flex-wrap">
                                        {topTypes.map(([type, count]) => {
                                            const def = getFieldDef(type as FieldType)
                                            return (
                                                <span key={type} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${def.color}`}>
                                                    {count}× {def.label}
                                                </span>
                                            )
                                        })}
                                    </div>
                                    <span className="text-xs font-semibold text-muted-foreground">{t.fields.length} fields</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

