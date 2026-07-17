"use client"

import React, { useMemo } from 'react'
import dynamic from 'next/dynamic'

// CSS is imported globally in layout.tsx to avoid SSR issues with dynamic imports
const ReactQuill = dynamic(() => import('react-quill'), { 
    ssr: false,
    loading: () => (
        <div className="h-[150px] w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center text-sm text-muted-foreground animate-pulse">
            Loading editor...
        </div>
    )
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
        <>
            {/* 
                NOTE: overflow must NOT be hidden here — Quill's color picker dropdown 
                renders inside the toolbar and will be clipped if the parent has overflow:hidden 
            */}
            <div className="rich-text-editor w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-sm">
                <ReactQuill 
                    theme="snow"
                    value={value}
                    onChange={onChange}
                    modules={modules}
                    placeholder={placeholder || 'Type description here...'}
                    className="[&_.ql-toolbar]:border-none [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 [&_.ql-toolbar]:dark:border-white/10 [&_.ql-toolbar]:bg-white/50 [&_.ql-toolbar]:dark:bg-black/20 [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:rounded-b-xl [&_.ql-editor]:min-h-[100px] [&_.ql-editor]:max-h-[300px] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:text-sm [&_.ql-editor]:text-slate-800 [&_.ql-editor]:dark:text-slate-200"
                />
            </div>
            <style>{`
                /* Ensure picker dropdowns appear above modal overlays */
                .ql-snow .ql-picker-options {
                    z-index: 9999 !important;
                    position: absolute !important;
                }
                .ql-snow .ql-color-picker .ql-picker-options {
                    width: 152px !important;
                    padding: 4px 0 !important;
                }
                /* Toolbar icon colors */
                .ql-snow .ql-stroke { stroke: currentColor; }
                .ql-snow .ql-fill { fill: currentColor; }
                .ql-snow .ql-picker { color: inherit; }
                /* Dark mode picker dropdown */
                .dark .ql-snow .ql-picker-options {
                    background-color: #1a1f2e !important;
                    border-color: rgba(255,255,255,0.1) !important;
                }
                .dark .ql-snow .ql-picker-label {
                    color: rgba(255,255,255,0.7) !important;
                }
                .dark .ql-toolbar.ql-snow .ql-picker-label:hover,
                .dark .ql-toolbar.ql-snow button:hover .ql-stroke {
                    stroke: white !important;
                }
            `}</style>
        </>
    )
}
