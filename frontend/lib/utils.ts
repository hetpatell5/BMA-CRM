import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
    if (num >= 100000) {
        return (num / 100000).toFixed(1) + 'L'
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
}

export function formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

export function formatDateTime(date: string | Date): string {
    return new Date(date).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function getInitials(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
}

export function getStageColor(stage: string): string {
    const colors: Record<string, string> = {
        NEW: 'bg-blue-500',
        CONTACTED: 'bg-yellow-500',
        QUALIFIED: 'bg-purple-500',
        PROPOSAL: 'bg-orange-500',
        NEGOTIATION: 'bg-pink-500',
        WON: 'bg-emerald-500',
        LOST: 'bg-red-500',
    }
    return colors[stage] || 'bg-gray-500'
}

export function getPriorityColor(priority: string): string {
    const colors: Record<string, string> = {
        LOW:    'text-gray-500 dark:text-gray-400',
        MEDIUM: 'text-blue-600 dark:text-blue-400',
        HIGH:   'text-orange-600 dark:text-orange-400',
        URGENT: 'text-red-600 dark:text-red-400',
    }
    return colors[priority] || 'text-gray-500 dark:text-gray-400'
}

export function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
        NEW_LEAD: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/25',
        SYNOPSIS_SENT: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/25',
        GUIDE_ASSIGNED: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/25',
        REPORT_IN_PROGRESS: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/25',
        SHIPPED: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border border-orange-500/25',
        ALL_DONE: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30',
    }
    return colors[status] || 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20'
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
    }
}
