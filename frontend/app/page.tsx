'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'

export default function Home() {
    const router = useRouter()
    const { isAuthenticated } = useAuthStore()

    useEffect(() => {
        if (isAuthenticated) {
            router.push('/dashboard')
        } else {
            router.push('/login')
        }
    }, [isAuthenticated, router])

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-pulse">
                <div className="w-16 h-16 rounded-full gradient-primary" />
            </div>
        </div>
    )
}
