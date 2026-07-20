'use client'

import { FileBarChart, Construction } from 'lucide-react'

export default function ReportsPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="glass rounded-2xl p-6 md:p-12 text-center max-w-md">
                <div className="w-16 md:w-20 h-16 md:h-20 rounded-2xl icon-badge-primary border border-primary/20 mx-auto mb-4 md:mb-6 flex items-center justify-center">
                    <FileBarChart className="w-8 md:w-10 h-8 md:h-10" />
                </div>
                <h1 className="page-title mb-2">Reports</h1>
                <p className="page-subtitle mb-6">
                    Generate detailed reports and analytics about your students and leads.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold status-warning">
                    <Construction className="w-4 h-4" />
                    <span>Coming soon</span>
                </div>
            </div>
        </div>
    )
}
