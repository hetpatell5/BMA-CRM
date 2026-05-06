'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { SocketProvider } from '@/providers/SocketProvider'
import { cn } from '@/lib/utils'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    const { isAuthenticated, _hasHydrated } = useAuthStore()
    const { isOpen } = useSidebarStore()

    // Redirect to login only after hydration is complete and user is not authenticated
    useEffect(() => {
        if (_hasHydrated && !isAuthenticated) {
            router.push('/login')
        }
    }, [_hasHydrated, isAuthenticated, router])

    // Show loading state while hydrating
    if (!_hasHydrated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse w-16 h-16 rounded-full gradient-primary" />
            </div>
        )
    }

    // Show loading while redirecting to login
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse w-16 h-16 rounded-full gradient-primary" />
            </div>
        )
    }

    return (
        <SocketProvider>
            <div className="min-h-screen bg-background flex">
                <Sidebar />
                <div
                    className={cn(
                        "flex-1 min-w-0 flex flex-col transition-all duration-300 ease-in-out",
                        // Desktop: adjust margin based on sidebar state
                        isOpen ? "lg:ml-[240px]" : "lg:ml-[68px]",
                        // Mobile: no margin (sidebar overlays)
                        "ml-0"
                    )}
                >
                    <Header />
                    <main className="flex-1 min-w-0 md:px-0 md:py-4 md:mr-4 overflow-y-auto overflow-x-hidden transition-all duration-300">
                        {children}
                    </main>
                </div>
            </div>
        </SocketProvider>
    )
}

