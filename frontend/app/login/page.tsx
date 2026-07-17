'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Lock, Loader2, User, EyeOff, Eye } from 'lucide-react'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Manrope } from 'next/font/google'

const supportFont = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] })

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [rememberMe, setRememberMe] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const router = useRouter()
    const { login } = useAuthStore()
    const { toast } = useToast()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) {
            toast({
                title: 'Error',
                description: 'Please enter both email and password',
                variant: 'destructive',
            })
            return
        }

        setIsLoading(true)

        try {
            const user = {
                id: '1',
                email: 'admin@crm.com',
                fullName: 'Admin User',
                role: 'ADMIN',
                status: 'ACTIVE'
            }
            const token = 'mock-jwt-token'

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
        <div className={`min-h-screen flex flex-col p-4 relative overflow-hidden bg-[#fafafa] dark:bg-[#0d131a] ${supportFont.className}`}>
            
            {/* Background Curvy Animations (Aurora/Mesh style) */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {/* Large spinning curvy elliptical blob */}
                <div className="absolute top-[-10%] left-[-10%] w-[100vw] h-[40vh] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-300/50 via-slate-200/10 to-transparent dark:from-blue-600/30 dark:via-blue-800/10 dark:to-transparent blur-[60px] animate-[spin_12s_linear_infinite]" />
                
                {/* Secondary counter-spinning blob */}
                <div className="absolute top-[40%] right-[-10%] w-[80vw] h-[50vh] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-400/40 via-slate-300/10 to-transparent dark:from-indigo-600/30 dark:via-indigo-800/10 dark:to-transparent blur-[80px] animate-[spin_16s_linear_infinite_reverse]" />
                
                {/* Third pulsing curvy sweep */}
                <div className="absolute bottom-[-20%] left-[10%] w-[90vw] h-[35vh] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-200/50 via-blue-100/10 to-transparent dark:from-sky-500/30 dark:via-sky-700/10 dark:to-transparent blur-[70px] animate-[spin_20s_linear_infinite]" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center z-10 w-full max-w-[440px] mx-auto animate-fade-in-up">
                
                {/* Header Logo */}
                <div className="flex items-center justify-center mb-10">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center mr-4">
                        <img 
                            src="/logo.png" 
                            alt="BMA CRM Logo" 
                            className="w-full h-full object-contain"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                    </div>
                    <div className="flex items-center whitespace-nowrap">
                        <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">BMA</span>
                        <span className="text-4xl font-light text-slate-500 dark:text-slate-300 leading-none ml-1.5">CRM</span>
                    </div>
                </div>

                {/* Login Card */}
                <div className="w-full bg-white dark:bg-[#161c24] border border-slate-200 dark:border-[#2e4057] p-8 md:p-10 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_0_40px_rgba(59,130,246,0.08)] relative before:absolute before:inset-0 before:rounded-xl before:border before:border-slate-300/50 dark:before:border-blue-500/30 before:pointer-events-none">
                    
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="relative group">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-10 h-12 bg-slate-50 dark:bg-[#0a0f16] border-slate-200 dark:border-[#2a3649] text-slate-900 dark:text-slate-200 placeholder:text-slate-500 dark:placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-all rounded-md"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="relative group">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-600 dark:group-focus-within:text-blue-500 transition-colors" />
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="pl-10 pr-10 h-12 bg-slate-50 dark:bg-[#0a0f16] border-slate-200 dark:border-[#2a3649] text-slate-900 dark:text-slate-200 placeholder:text-slate-500 dark:placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-all rounded-md"
                                disabled={isLoading}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors focus:outline-none"
                            >
                                {showPassword ? <Eye className="w-[18px] h-[18px]" /> : <EyeOff className="w-[18px] h-[18px]" />}
                            </button>
                        </div>

                        <div className="flex items-center justify-end pt-1 pb-3">
                            <div className="flex items-center space-x-2">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        id="rememberMe"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="peer w-4 h-4 rounded border-slate-300 dark:border-[#3a4b63] text-blue-600 dark:text-blue-500 focus:ring-blue-500/30 bg-white dark:bg-[#0a0f16] transition-all cursor-pointer"
                                        disabled={isLoading}
                                    />
                                </div>
                                <Label htmlFor="rememberMe" className="text-[13px] text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                                    Remember Me
                                </Label>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-11 text-[15px] font-medium bg-blue-600 dark:bg-[#3b82f6] hover:bg-blue-700 dark:hover:bg-[#2563eb] text-white rounded-md shadow-[0_4px_14px_rgba(37,99,235,0.2)] dark:shadow-[0_0_15px_rgba(59,130,246,0.3)] transition-all border border-blue-600 dark:border-blue-400/20"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Logging in...
                                </>
                            ) : (
                                'Login'
                            )}
                        </Button>

                    </form>
                </div>
            </div>

            {/* Footer */}
            <div className="w-full text-center pb-8 z-10">
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">© 2026 BMAP Eduservices pvt ltd. All rights reserved.</p>
            </div>
        </div>
    )
}
