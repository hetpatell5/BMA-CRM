import axios from 'axios'

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
    headers: {
        'Content-Type': 'application/json',
    },
})

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        // Get token from localStorage (where zustand persists it)
        if (typeof window !== 'undefined') {
            const authStorage = localStorage.getItem('auth-storage')
            if (authStorage) {
                try {
                    const parsed = JSON.parse(authStorage)
                    const token = parsed?.state?.token
                    if (token) {
                        config.headers.Authorization = `Bearer ${token}`
                    }
                } catch (e) {
                    console.error('Failed to parse auth storage', e)
                }
            }
        }
        return config
    },
    (error) => {
        return Promise.reject(error)
    }
)

// Response interceptor to handle 401 and 403 errors (token missing or expired/invalid)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status
        // 401 = no token or invalid/expired token — auto logout
        // 403 = valid token but insufficient permissions — do NOT logout (telecallers hit this on admin routes)
        if (status === 401) {
            if (typeof window !== 'undefined') {
                const authStorage = localStorage.getItem('auth-storage')
                if (authStorage) {
                    try {
                        const parsed = JSON.parse(authStorage)
                        // Only clear and redirect if user was previously authenticated
                        // This prevents premature redirects during initial load
                        if (parsed?.state?.isAuthenticated) {
                            localStorage.removeItem('auth-storage')
                            // Use replace to avoid back button issues
                            window.location.replace('/login')
                        }
                    } catch (e) {
                        // If parsing fails, do nothing - let the auth layout handle it
                    }
                }
            }
        }
        return Promise.reject(error)
    }
)

export default api

// Auth API helpers (for login page which doesn't have token yet)
export const authAPI = {
    login: (email: string, password: string) =>
        api.post('/auth/login', { email, password }),

    register: (data: { email: string; password: string; fullName: string; role?: string }) =>
        api.post('/auth/register', data),

    me: () => api.get('/auth/me'),

    changePassword: (currentPassword: string, newPassword: string) =>
        api.put('/auth/change-password', { currentPassword, newPassword }),

    updateProfile: (data: any) => api.put('/auth/me', data),
    updateAvatar: (avatar: string) => api.put('/auth/me/avatar', { avatar }),
}

// Dashboard API
export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getTelecallerStats: () => api.get('/dashboard/telecaller-stats'),
    getFollowUpsToday: () => api.get('/dashboard/follow-ups/today'),
    getActivities: (limit = 10) => api.get(`/dashboard/activities?limit=${limit}`),
    getTeamAvailability: () => api.get('/availability'),
    getTasksOverview: () => api.get('/tasks/overview'),
    getExpertWorkload: () => api.get('/dashboard/payments/expert-workload'),
    getMonthlyTrends: () => api.get('/dashboard/charts/monthly-trends'),
    getPaymentSummary: () => api.get('/dashboard/payment-summary'),
}

// Students API
export const studentsAPI = {
    getAll: (params?: any) => api.get('/students', { params }),
    getById: (id: string | number) => api.get(`/students/${id}`),
    create: (data: any) => api.post('/students', data),
    update: (id: string | number, data: any) => api.put(`/students/${id}`, data),
    delete: (id: string | number) => api.delete(`/students/${id}`),
    search: (query: string) => api.get(`/students/search?q=${query}`),
    getFilters: (scope?: string) => api.get('/students/meta/filters', { params: scope ? { scope } : undefined }),
    bulkUpdate: (ids: string[], status: string) => api.post('/students/bulk-update', { ids, status }),
    bulkDelete: (ids: string[]) => api.post('/students/bulk-delete', { ids }),
    backfillOrderIds: () => api.post('/students/backfill-order-ids'),
    exportExcel: (params?: any) => api.get('/students/export/excel', { params, responseType: 'blob' }),
    // Build a direct download URL — pass to window.open or <a href> for true streaming download
    getExportUrl: (params?: Record<string, any>): string => {
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
        const authStorage = typeof window !== 'undefined' ? localStorage.getItem('auth-storage') : null
        let token = ''
        try { token = JSON.parse(authStorage || '{}')?.state?.token || '' } catch { /* ignore */ }

        // Build query string manually — URLSearchParams double-encodes brackets
        // which breaks Express qs nested-object parsing (customField[key]=val)
        const parts: string[] = []
        if (token) parts.push(`token=${encodeURIComponent(token)}`)

        if (params) {
            for (const [k, v] of Object.entries(params)) {
                if (v === undefined || v === null || v === '') continue
                if (typeof v === 'object' && !Array.isArray(v)) {
                    // Nested object → customField[key]=value (literal brackets, qs-compatible)
                    for (const [ck, cv] of Object.entries(v)) {
                        if (cv) parts.push(`${encodeURIComponent(k)}[${encodeURIComponent(ck)}]=${encodeURIComponent(String(cv))}`)
                    }
                } else {
                    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
                }
            }
        }
        return `${base}/students/export/excel?${parts.join('&')}`
    },
    assignToGuide: (studentId: string, guideId: number | null, commission?: string | null, forceDuplicate?: boolean) =>
        api.post(`/students/assign/${studentId}`, { guideId, commission, forceDuplicate }),
    coHandle: (studentId: string | number, coHandlerId?: number | null) =>
        api.post(`/students/co-handle/${studentId}`, coHandlerId ? { coHandlerId } : {}),
    promoteImportedRow: (id: string | number) => api.post(`/students/promote-import/${id}`),
    promoteImportBatch: (importBatchId: string) => api.post(`/students/promote-import-batch/${importBatchId}`),
    getImportFieldValues: (field: string, batchId?: string) =>
        api.get('/students/meta/import-field-values', { params: { field, ...(batchId ? { batchId } : {}) } }),
}

// Leads API
export const leadsAPI = {
    getAll: (params?: any) => api.get('/leads', { params }),
    getById: (id: string | number) => api.get(`/leads/${id}`),
    create: (data: any) => api.post('/leads', data),
    update: (id: string | number, data: any) => api.put(`/leads/${id}`, data),
    delete: (id: string | number) => api.delete(`/leads/${id}`),
    bulkDelete: (ids: string[]) => api.post('/leads/bulk-delete', { ids }),
    addActivity: (id: string | number, data: any) => api.post(`/leads/${id}/activities`, data),
    convert: (id: string | number, data: any) => api.post(`/leads/${id}/convert`, data),
    getPipeline: () => api.get('/leads/pipeline'),
    getStats: () => api.get('/leads/stats/summary'),
}

// Import API
export const importAPI = {
    preview: (formData: FormData) => api.post('/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    execute: (data: any) => api.post('/import/execute', data),
    getHistory: (params?: any) => api.get('/import/history', { params }),
    upload: (file: File, importType?: string, onUploadProgress?: (pct: number) => void) => {
        const formData = new FormData()
        formData.append('file', file)
        if (importType) formData.append('importType', importType)
        return api.post('/import/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
                if (onUploadProgress && e.total) {
                    onUploadProgress(Math.round((e.loaded / e.total) * 100))
                }
            },
        })
    },
    process: (importId: string, data?: any) => api.post(`/import/process/${importId}`, data),
    delete: (importId: string, deleteRecords?: boolean) => api.delete(`/import/history/${importId}`, { params: { deleteRecords } }),
    resume: (importId: string) => api.get(`/import/resume/${importId}`),
    getDetails: (importId: string) => api.get(`/import/history/${importId}`),
    saveMapping: (confirmedMappings: Record<string, string>) => api.post('/import/save-mapping', { confirmedMappings }),
}

// Tasks API
export const tasksAPI = {
    getAll: (params?: any) => api.get('/tasks', { params }),
    getById: (id: string | number) => api.get(`/tasks/${id}`),
    create: (data: any) => api.post('/tasks', data),
    update: (id: string | number, data: any) => api.put(`/tasks/${id}`, data),
    updateStatus: (id: string | number, status: string) => api.put(`/tasks/${id}`, { status }),
    addUpdate: (id: string | number, data: any) => api.post(`/tasks/${id}/updates`, data),
}

// Availability API
export const availabilityAPI = {
    getAll: () => api.get('/availability'),
    getMine: () => api.get('/availability/me'),
    updateStatus: (status: string, statusNote?: string) =>
        api.put('/availability/status', { status, statusNote }),
    heartbeat: () => api.post('/availability/heartbeat'),
}

// Templates API
export const templatesAPI = {
    getAll: () => api.get('/templates'),
    getById: (id: number) => api.get(`/templates/${id}`),
    create: (data: any) => api.post('/templates', data),
    update: (id: number, data: any) => api.put(`/templates/${id}`, data),
    delete: (id: number) => api.delete(`/templates/${id}`),
}

// Team API
export const teamAPI = {
    getAll: () => api.get('/team'),
    getById: (id: number) => api.get(`/team/${id}`),
    create: (data: any) => api.post('/team', data),
    update: (id: number, data: any) => api.put(`/team/${id}`, data),
    delete: (id: number) => api.delete(`/team/${id}`),
    getManagers: () => api.get('/team/managers/available'),
    getGuides: () => api.get('/team/guides/available'),
    getTakeoverUsers: () => api.get('/team/takeover/available'),
    getPaymentDetails: (id: number) => api.get(`/team/${id}/payment-details`),
    updatePaymentDetails: (id: number, data: any) => api.put(`/team/${id}/payment-details`, data),
    getPaymentSummary: () => api.get('/team/payment-summary'),
    getMemberDashboard: (id: number) => api.get(`/team/${id}/dashboard`),
    getMemberPricing: (id: number) => api.get(`/team/${id}/pricing`),
    updateMemberPricing: (id: number, pricing: any[]) => api.post(`/team/${id}/pricing`, { pricing }),
    markPaymentDone: (id: number, data: any) => api.post(`/team/${id}/payment`, data),
    uploadQrScanner: (id: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/team/${id}/upload/qr-scanner`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    uploadBankPassbook: (id: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/team/${id}/upload/bank-passbook`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    sendEmail: (id: number, data: { subject: string; body: string; invoiceUrl?: string | null }) =>
        api.post(`/team/${id}/send-email`, data),
    resetPassword: (id: number, newPassword: string) =>
        api.put(`/team/${id}/reset-password`, { newPassword }),
}

// Order Form Config API
export const orderFormConfigAPI = {
    get: () => api.get('/order-form-config'),
    update: (config: any) => api.put('/order-form-config', { config }),
}

// Notifications API
export const notificationsAPI = {
    getAll: (params?: any) => api.get('/notifications', { params }),
    getUnreadCount: () => api.get('/notifications/unread-count'),
    markRead: (ids: string[]) => api.put('/notifications/mark-read', { ids }),
    markAllRead: () => api.put('/notifications/mark-all-read'),
    delete: (id: string) => api.delete(`/notifications/${id}`),
}

// Shiprocket API
export const shiprocketAPI = {
    getPickupAddresses: () => api.get('/shiprocket/pickup-addresses'),
    createShipment: (studentId: string, payload: Record<string, any>) =>
        api.post(`/shiprocket/create-shipment/${studentId}`, payload),
    trackShipment: (studentId: string) =>
        api.get(`/shiprocket/track/${studentId}`),
    getConfig: () => api.get('/app-settings/shiprocket-config'),
}

// App Settings API (Admin only)
export const appSettingsAPI = {
    get: () => api.get('/app-settings'),
    update: (settings: Record<string, any>) => api.put('/app-settings', settings),
    getOrderPdfConfig: () => api.get('/app-settings/order-pdf-config'),
    getOrderColumns: () => api.get('/app-settings/order-columns'),
    getOrderIdRules: () => api.get('/app-settings/order-id-rules'),
    updateOrderIdRules: (orderIdRules: Array<{ requirement: string; prefix: string }>) =>
        api.put('/app-settings/order-id-rules', { orderIdRules }),
    updateOrderColumns: (columns: any[], visibility?: Record<string, 'all' | 'ops'>, order?: string[]) =>
        api.put('/app-settings/order-columns', { columns, visibility, order }),
}

// Follow-ups API
export const followUpsAPI = {
    getAll: (search?: string) => api.get('/follow-ups', { params: search ? { search } : {} }),
    create: (data: any) => api.post('/follow-ups', data),
    update: (id: string, data: any) => api.put(`/follow-ups/${id}`, data),
    remove: (id: string) => api.delete(`/follow-ups/${id}`),
}
