'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Manrope } from 'next/font/google'
import { Mail, Lock, Loader2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { authAPI } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import Link from 'next/link'

const supportFont = Manrope({ subsets: ['latin'], weight: ['500', '600', '700', '800'] })

export default function LoginPage() {
    const router = useRouter()
    const { login } = useAuthStore()
    const { toast } = useToast()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(true)
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!email || !password) {
            toast({
                title: 'Error',
                description: 'Please enter email and password',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const response = await authAPI.login(email, password)
            const { token, user } = response.data.data

            login(user, token, rememberMe)

            toast({
                title: 'Welcome back!',
                description: `Logged in as ${user.fullName}`,
                variant: 'success',
            })

            router.push('/dashboard')
        } catch (error: any) {
            toast({
                title: 'Login failed',
                description: error.response?.data?.message || 'Invalid credentials',
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#fafafa] dark:bg-[#0a0a0c]">
            {/* Subtle Animated Background Sweep */}
            <div className="absolute inset-0 z-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-200/50 via-slate-50 to-blue-200/50 dark:from-blue-900/40 dark:via-[#0a0a0c] dark:to-blue-900/40 bg-[length:200%_100%] animate-pan-bg" />
            </div>

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-[420px] animate-fade-in-up">
                <div className="bg-white/80 dark:bg-[#0f0f11]/80 backdrop-blur-xl border border-black/[0.04] dark:border-white/[0.04] p-8 md:p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)]">
                    
                    {/* Brand Header */}
                    <div className="flex flex-col items-center mb-10">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center mb-4">
                            <img 
                                src="/logo.png" 
                                alt="BMA CRM Logo" 
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                }}
                            />
                        </div>
                        <div className="flex items-center whitespace-nowrap mb-1.5">
                            <span className={`text-[1.75rem] font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-none ${supportFont.className}`}>BMA</span>
                            <span className={`text-[1.75rem] font-medium text-slate-400 dark:text-slate-500 leading-none ml-1 ${supportFont.className}`}>CRM</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-[13px] font-medium tracking-wide uppercase">Admin Portal</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="email" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                                Email
                            </Label>
                            <div className="relative group">
                                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="admin@bmacrm.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 h-11 bg-slate-50/50 dark:bg-black/20 border-slate-200 dark:border-white/5 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/50 transition-all text-sm rounded-lg"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                                    Password
                                </Label>
                                <Link href="#" className="text-[13px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 h-11 bg-slate-50/50 dark:bg-black/20 border-slate-200 dark:border-white/5 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500/50 transition-all text-sm rounded-lg"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-2 pt-1 pb-2">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    id="rememberMe"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="peer w-4 h-4 rounded-md border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/30 bg-white dark:bg-black/20 transition-all appearance-none cursor-pointer"
                                    disabled={isLoading}
                                />
                                <div className="absolute inset-0 rounded-md border border-slate-300 dark:border-slate-700 pointer-events-none peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-colors" />
                                <svg className="absolute w-3 h-3 left-0.5 top-0.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 14 14" fill="none">
                                    <path d="M3 7L6 10L11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <Label htmlFor="rememberMe" className="text-[13px] text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                Keep me signed in
                            </Label>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 text-[14px] font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>
                </div>
            </div>
        </div>
    )
}
