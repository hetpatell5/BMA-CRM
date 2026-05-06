'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface ThemeStore {
    theme: Theme
    setTheme: (t: Theme) => void
    toggle: () => void
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set, get) => ({
            theme: 'light',
            setTheme: (theme) => set({ theme }),
            toggle: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
        }),
        { name: 'crm-theme' }
    )
)
