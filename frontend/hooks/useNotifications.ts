'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/authStore'
import { useNotificationStore, Notification } from '@/stores/notificationStore'
import api from '@/lib/api'

let socket: Socket | null = null

export function useNotifications() {
    const { user } = useAuthStore()
    const qc = useQueryClient()
    const {
        setNotifications,
        setUnreadCount,
        addNotification,
        markRead: markReadStore,
        markAllRead: markAllReadStore,
        removeNotification,
    } = useNotificationStore()

    // ── Fetch initial list ────────────────────────────────────────────────────
    const { data, isLoading } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            const res = await api.get('/notifications?limit=20')
            return res.data.data
        },
        enabled: !!user,
        staleTime: 30_000,
    })

    useEffect(() => {
        if (data?.notifications) {
            setNotifications(data.notifications)
        }
    }, [data, setNotifications])

    // ── Fetch unread count ────────────────────────────────────────────────────
    const { data: countData } = useQuery({
        queryKey: ['notifications-count'],
        queryFn: async () => {
            const res = await api.get('/notifications/unread-count')
            return res.data.data.count as number
        },
        enabled: !!user,
        staleTime: 15_000,
        refetchInterval: 60_000, // fallback poll every 60s
    })

    useEffect(() => {
        if (typeof countData === 'number') setUnreadCount(countData)
    }, [countData, setUnreadCount])

    // ── Socket.IO — real-time push ────────────────────────────────────────────
    useEffect(() => {
        if (!user?.id) return

        const hostname = window.location.hostname
        const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1'
            || /^192\.168\./.test(hostname) || /^10\./.test(hostname)
        const backendHost = isLocalDev
            ? `${window.location.protocol}//${hostname}:5000`
            : window.location.origin

        socket = io(backendHost, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
        })

        socket.on('connect', () => {
            socket?.emit('join-user-room', user.id)
        })

        socket.on('new-notification', (n: Notification) => {
            addNotification(n)
            qc.invalidateQueries({ queryKey: ['notifications-count'] })
        })

        return () => {
            socket?.disconnect()
            socket = null
        }
    }, [user?.id, addNotification, qc])

    // ── Mutations ─────────────────────────────────────────────────────────────
    const markReadMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await api.put('/notifications/mark-read', { ids })
        },
        onMutate: (ids) => markReadStore(ids),
        onSettled: () => qc.invalidateQueries({ queryKey: ['notifications-count'] }),
    })

    const markAllReadMutation = useMutation({
        mutationFn: async () => {
            await api.put('/notifications/mark-all-read')
        },
        onMutate: () => markAllReadStore(),
        onSettled: () => qc.invalidateQueries({ queryKey: ['notifications-count'] }),
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await api.delete(`/notifications/${id}`)
        },
        onMutate: (id) => removeNotification(id),
    })

    return {
        isLoading,
        markRead: markReadMutation.mutate,
        markAllRead: markAllReadMutation.mutate,
        deleteNotification: deleteMutation.mutate,
    }
}
