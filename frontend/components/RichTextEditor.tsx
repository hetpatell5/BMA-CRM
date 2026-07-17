"use client"

import React, { useMemo } from 'react'
import dynamic from 'next/dynamic'
import 'react-quill/dist/quill.snow.css'

// Next.js doesn't support SSR for react-quill
const ReactQuill = dynamic(() => import('react-quill'), { 
    ssr: false,
    loading: () => <div className="h-[142px] w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center text-sm text-muted-foreground animate-pulse">Loading editor...</div>
})

interface RichTextEditorProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
    const modules = useMemo(() => ({
        toolbar: [
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'color': [] }, { 'background': [] }],
            ['clean']
        ]
    }), [])

    return (
        <div className="rich-text-editor w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 overflow-hidden transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-sm">
            <ReactQuill 
                theme="snow"
                value={value}
                onChange={onChange}
                modules={modules}
                placeholder={placeholder || 'Type description here...'}
                className="[&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 [&_.ql-toolbar]:dark:border-white/10 [&_.ql-toolbar]:bg-white/50 [&_.ql-toolbar]:dark:bg-black/20 [&_.ql-container]:border-none [&_.ql-editor]:min-h-[100px] [&_.ql-editor]:max-h-[300px] [&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-800 [&_.ql-editor]:dark:text-slate-200 [&_.ql-picker-options]:dark:bg-[#1a1f2e] [&_.ql-picker-options]:dark:border-white/10"
            />
            {/* Global styles to fix Quill dark mode if needed */}
            <style jsx global>{`
                .ql-snow .ql-stroke { stroke: currentColor; }
                .ql-snow .ql-fill { fill: currentColor; }
                .ql-snow .ql-picker { color: currentColor; }
                .dark .ql-snow .ql-picker-options { background-color: #1a1f2e; border-color: rgba(255,255,255,0.1); }
            `}</style>
        </div>
    )
}
