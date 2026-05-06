'use client'

import { FileBarChart, Construction } from 'lucide-react'

export default function ReportsPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
            <div className="glass rounded-2xl p-6 md:p-12 text-center max-w-md">
                <div className="w-16 md:w-20 h-16 md:h-20 rounded-2xl gradient-primary mx-auto mb-4 md:mb-6 flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <FileBarChart className="w-8 md:w-10 h-8 md:h-10 text-white" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold mb-2">Reports</h1>
                <p className="text-sm text-muted-foreground mb-6">
                    Generate detailed reports and analytics about your students and leads.
                </p>
                <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
                    <Construction className="w-4 h-4" />
                    <span>Coming soon</span>
                </div>
            </div>
        </div>
    )
}

