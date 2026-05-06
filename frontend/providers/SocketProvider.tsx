'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/stores/authStore'

interface SocketContextType {
    socket: Socket | null
    isConnected: boolean
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false })

export function useSocket() {
    return useContext(SocketContext)
}

// Helper to get token from zustand persisted storage
function getToken(): string | null {
    if (typeof window === 'undefined') return null
    try {
        const authStorage = localStorage.getItem('auth-storage')
        if (authStorage) {
            const parsed = JSON.parse(authStorage)
            return parsed?.state?.token || null
        }
    } catch (e) {
        console.error('Failed to parse auth storage', e)
    }
    return null
}

export function SocketProvider({ children }: { children: ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null)
    const [isConnected, setIsConnected] = useState(false)
    const { toast } = useToast()
    const toastRef = useRef(toast)
    const { isAuthenticated } = useAuthStore()

    // Keep toast ref current without causing re-renders
    useEffect(() => {
        toastRef.current = toast
    }, [toast])

    useEffect(() => {
        const token = getToken()

        // Only connect if we have a token and user is authenticated
        if (!token || !isAuthenticated) {
            return
        }

        // On local dev, connect directly to backend port 5000.
        // On production, connect to origin — nginx proxies /socket.io/ to backend.
        const hostname = window.location.hostname
        const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1'
            || /^192\.168\./.test(hostname) || /^10\./.test(hostname)
        const backendHost = isLocalDev
            ? `${window.location.protocol}//${hostname}:5000`
            : window.location.origin

        const socketInstance = io(backendHost, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 10000,
            timeout: 10000,
        })

        socketInstance.on('connect', () => {
            console.log('Socket connected:', socketInstance.id)
            setIsConnected(true)
        })

        socketInstance.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason)
            setIsConnected(false)
        })

        socketInstance.on('connect_error', (error) => {
            // Suppress noisy errors — just log quietly
            console.debug('Socket connection error:', error.message)
        })

        // Listen for task events
        socketInstance.on('task:created', (data) => {
            toastRef.current({ title: 'New Task', description: `Task "${data.task?.title}" created` })
        })

        socketInstance.on('task:updated', (_data) => {
            // Optionally show toast for updates
        })

        socketInstance.on('task:progress', (data) => {
            toastRef.current({ title: 'Task Progress', description: `Progress update on "${data.task?.title}"` })
        })

        // Listen for status changes
        socketInstance.on('status:changed', (_data) => {
            // Handle team status updates
        })

        // Listen for alerts (no update warning)
        socketInstance.on('alert:no-update', (data) => {
            toastRef.current({
                title: '⚠️ Task Alert',
                description: `No update for 2+ hours on: ${data.taskTitle}`,
                variant: 'destructive'
            })
        })

        setSocket(socketInstance)

        return () => {
            socketInstance.disconnect()
        }
    }, [isAuthenticated])

    // Heartbeat — uses relative /api path, proxied through Next.js (works on any device)
    useEffect(() => {
        if (!isConnected) return

        const token = getToken()
        if (!token) return

        const interval = setInterval(async () => {
            try {
                await fetch('/api/availability/heartbeat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                })
            } catch (e) {
                // Silently fail — backend may be temporarily unavailable
            }
        }, 60 * 1000) // Every 1 minute

        return () => clearInterval(interval)
    }, [isConnected])

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    )
}
