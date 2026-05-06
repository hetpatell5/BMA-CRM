'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationProgress() {
    const pathname = usePathname()
    const [progress, setProgress] = useState(0)
    const [visible, setVisible] = useState(false)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const prevPathRef = useRef(pathname)

    const clearTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current)
    }

    const startProgress = () => {
        setProgress(0)
        setVisible(true)

        let current = 0
        clearTimer()
        timerRef.current = setInterval(() => {
            // Increment fast at start, slow down near 90%
            current += current < 30 ? 6 : current < 60 ? 3 : current < 80 ? 1.5 : 0.4
            if (current >= 90) current = 90
            setProgress(current)
        }, 80)
    }

    const completeProgress = () => {
        clearTimer()
        setProgress(100)
        setTimeout(() => {
            setVisible(false)
            setProgress(0)
        }, 400)
    }

    // Detect navigation start by intercepting link clicks
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest('a')
            if (!target) return
            const href = target.getAttribute('href')
            if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto')) return
            if (href !== pathname) {
                startProgress()
            }
        }

        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [pathname])

    // Detect navigation complete when pathname changes
    useEffect(() => {
        if (prevPathRef.current !== pathname) {
            prevPathRef.current = pathname
            completeProgress()
        }
    }, [pathname])

    if (!visible) return null

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-[4px] pointer-events-none">
            <div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(139,92,246,0.9)] dark:shadow-[0_0_8px_rgba(139,92,246,0.6)] transition-all"
                style={{
                    width: `${progress}%`,
                    transitionDuration: progress === 100 ? '200ms' : '80ms',
                    transitionTimingFunction: 'ease-out',
                }}
            />
        </div>
    )
}

