import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import Cookies from 'js-cookie'
import api from '@/lib/api'

interface User {
    id: number
    email: string
    fullName: string
    role: string
    staffRole?: string
    degree?: string
    avatar?: string
}

interface AuthState {
    user: User | null
    token: string | null
    isAuthenticated: boolean
    _hasHydrated: boolean
    login: (user: User, token: string, rememberMe?: boolean) => void
    logout: () => Promise<void>
    updateUser: (user: Partial<User>) => void
    setHasHydrated: (state: boolean) => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            _hasHydrated: false,

            login: (user, token, rememberMe = true) => {
                if (rememberMe) {
                    Cookies.set('token', token, { expires: 7 })
                } else {
                    Cookies.set('token', token)
                }
                set({ user, token, isAuthenticated: true })
            },

            logout: async () => {
                // Call backend logout endpoint to mark user as offline
                try {
                    const token = get().token
                    if (token) {
                        await api.post('/auth/logout')
                    }
                } catch (error) {
                    // Ignore errors - user might already be logged out
                    console.log('Logout API call failed (user may already be logged out)')
                }

                // Clear local state
                Cookies.remove('token')
                set({ user: null, token: null, isAuthenticated: false })
            },

            updateUser: (userData) => {
                set((state) => ({
                    user: state.user ? { ...state.user, ...userData } : null,
                }))
            },

            setHasHydrated: (state) => {
                set({ _hasHydrated: state })
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                isAuthenticated: state.isAuthenticated,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true)
            },
        }
    )
)
