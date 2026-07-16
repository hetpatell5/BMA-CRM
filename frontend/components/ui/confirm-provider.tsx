'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Button } from './button'
import { AlertCircle, Trash2, Info } from 'lucide-react'

type ConfirmOptions = {
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'destructive'
}

type ConfirmContextType = {
    confirm: (options: ConfirmOptions | string) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined)

export const useConfirm = () => {
    const context = useContext(ConfirmContext)
    if (!context) throw new Error('useConfirm must be used within ConfirmProvider')
    return context
}

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<{
        isOpen: boolean
        options: ConfirmOptions
        resolve: (value: boolean) => void
    }>({
        isOpen: false,
        options: { message: '' },
        resolve: () => {},
    })

    const confirm = useCallback((options: ConfirmOptions | string) => {
        return new Promise<boolean>((resolve) => {
            setState({
                isOpen: true,
                options: typeof options === 'string' ? { message: options } : options,
                resolve,
            })
        })
    }, [])

    const handleConfirm = () => {
        state.resolve(true)
        setState(s => ({ ...s, isOpen: false }))
    }

    const handleCancel = () => {
        state.resolve(false)
        setState(s => ({ ...s, isOpen: false }))
    }

    const { options, isOpen } = state
    const isDestructive = options.variant === 'destructive'

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
                    <div className={`glass rounded-2xl p-6 max-w-md w-full mx-4 border ${isDestructive ? 'border-red-500/20' : 'border-border'}`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDestructive ? 'bg-red-500/20' : 'bg-primary/20'}`}>
                                {isDestructive ? <Trash2 className="w-6 h-6 text-red-500" /> : <Info className="w-6 h-6 text-primary" />}
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">{options.title || 'Confirm Action'}</h3>
                                <p className="text-sm text-muted-foreground">{isDestructive ? 'This action cannot be undone' : 'Please confirm your action'}</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-6">
                            {options.message}
                        </p>
                        <div className="flex items-center justify-end gap-3">
                            <Button variant="outline" onClick={handleCancel}>
                                {options.cancelText || 'Cancel'}
                            </Button>
                            <Button
                                variant={isDestructive ? 'destructive' : 'default'}
                                onClick={handleConfirm}
                                className="gap-2"
                            >
                                {isDestructive && <Trash2 className="w-4 h-4" />}
                                {options.confirmText || (isDestructive ? 'Yes, Delete' : 'Confirm')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    )
}
