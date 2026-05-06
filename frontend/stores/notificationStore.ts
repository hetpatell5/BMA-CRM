import { create } from 'zustand'

export interface Notification {
    id: string
    userId: number
    type: string
    title: string
    message: string
    link?: string | null
    isRead: boolean
    createdAt: string
}

interface NotificationStore {
    notifications: Notification[]
    unreadCount: number
    setNotifications: (notifications: Notification[]) => void
    setUnreadCount: (count: number) => void
    addNotification: (n: Notification) => void
    markRead: (ids: string[]) => void
    markAllRead: () => void
    removeNotification: (id: string) => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
    notifications: [],
    unreadCount: 0,

    setNotifications: (notifications) => set({ notifications }),
    setUnreadCount: (unreadCount) => set({ unreadCount }),

    addNotification: (n) =>
        set((state) => ({
            notifications: [n, ...state.notifications].slice(0, 50),
            unreadCount: state.unreadCount + 1,
        })),

    markRead: (ids) =>
        set((state) => ({
            notifications: state.notifications.map((n) =>
                ids.includes(n.id) ? { ...n, isRead: true } : n
            ),
            unreadCount: Math.max(
                0,
                state.unreadCount - ids.filter((id) =>
                    state.notifications.find((n) => n.id === id && !n.isRead)
                ).length
            ),
        })),

    markAllRead: () =>
        set((state) => ({
            notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
            unreadCount: 0,
        })),

    removeNotification: (id) =>
        set((state) => {
            const target = state.notifications.find((n) => n.id === id)
            return {
                notifications: state.notifications.filter((n) => n.id !== id),
                unreadCount: target && !target.isRead
                    ? Math.max(0, state.unreadCount - 1)
                    : state.unreadCount,
            }
        }),
}))
