import { create } from 'zustand'
import { followUpsAPI } from '@/lib/api'

export interface FollowUp {
    id: string;
    name: string;
    number: string;
    description: string;
    followupDate: string;
    requirement: string;
    status: string;
    color?: string;
    createdAt: string;
    updatedAt: string;
    createdById: number;
    createdBy?: { id: number; fullName: string };
}

export interface FollowUpMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface FollowUpState {
    pendingFollowUps: FollowUp[];
    completedFollowUps: FollowUp[];
    pendingMeta: FollowUpMeta;
    completedMeta: FollowUpMeta;
    isLoadingPending: boolean;
    isLoadingCompleted: boolean;
    fetchPendingFollowUps: (page?: number, search?: string) => Promise<void>;
    fetchCompletedFollowUps: (page?: number, search?: string) => Promise<void>;
    addFollowUp: (data: Omit<FollowUp, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdById' | 'status'> & { status?: string, color?: string }) => Promise<void>;
    updateFollowUp: (id: string, data: Partial<FollowUp>) => Promise<void>;
    removeFollowUp: (id: string) => Promise<void>;
}

const defaultMeta: FollowUpMeta = { total: 0, page: 1, limit: 10, totalPages: 1 };

export const useFollowUpStore = create<FollowUpState>()((set, get) => ({
    pendingFollowUps: [],
    completedFollowUps: [],
    pendingMeta: defaultMeta,
    completedMeta: defaultMeta,
    isLoadingPending: false,
    isLoadingCompleted: false,

    fetchPendingFollowUps: async (page = 1, search = '') => {
        set({ isLoadingPending: true });
        try {
            const response = await followUpsAPI.getAll({ page, limit: 1000, search, status: 'PENDING' });
            const data = response.data.data || [];
            const meta = response.data.meta || defaultMeta;
            
            const normalized = data.map((f: any) => ({
                ...f,
                id: String(f.id),
                followupDate: f.followupDate || f.followup_date,
                createdAt: f.createdAt || f.created_at,
                updatedAt: f.updatedAt || f.updated_at,
            }));
            set({ pendingFollowUps: normalized, pendingMeta: meta, isLoadingPending: false });
        } catch (error) {
            console.error('Failed to fetch pending follow-ups:', error);
            set({ isLoadingPending: false });
        }
    },

    fetchCompletedFollowUps: async (page = 1, search = '') => {
        set({ isLoadingCompleted: true });
        try {
            const response = await followUpsAPI.getAll({ page, limit: 1000, search, status: 'COMPLETED' });
            const data = response.data.data || [];
            const meta = response.data.meta || defaultMeta;

            const normalized = data.map((f: any) => ({
                ...f,
                id: String(f.id),
                followupDate: f.followupDate || f.followup_date,
                createdAt: f.createdAt || f.created_at,
                updatedAt: f.updatedAt || f.updated_at,
            }));
            set({ completedFollowUps: normalized, completedMeta: meta, isLoadingCompleted: false });
        } catch (error) {
            console.error('Failed to fetch completed follow-ups:', error);
            set({ isLoadingCompleted: false });
        }
    },

    addFollowUp: async (followUp) => {
        try {
            const response = await followUpsAPI.create(followUp);
            const newFollowUp = response.data.data;
            const normalized = {
                ...newFollowUp,
                id: String(newFollowUp.id),
                followupDate: newFollowUp.followupDate || newFollowUp.followup_date,
                createdAt: newFollowUp.createdAt || newFollowUp.created_at,
                updatedAt: newFollowUp.updatedAt || newFollowUp.updated_at,
            };
            set((state) => ({
                pendingFollowUps: [normalized, ...state.pendingFollowUps]
            }));
        } catch (error) {
            console.error('Failed to add follow-up:', error);
            throw error;
        }
    },

    updateFollowUp: async (id, data) => {
        try {
            const response = await followUpsAPI.update(id, data);
            const updated = response.data.data;
            const normalized = {
                ...updated,
                id: String(updated.id),
                followupDate: updated.followupDate || updated.followup_date,
                updatedAt: updated.updatedAt || updated.updated_at,
            };

            set((state) => {
                let newPending = [...state.pendingFollowUps];
                let newCompleted = [...state.completedFollowUps];

                const existingPending = newPending.find(f => f.id === id);
                const existingCompleted = newCompleted.find(f => f.id === id);

                // Remove from both lists first to avoid duplicates
                newPending = newPending.filter(f => f.id !== id);
                newCompleted = newCompleted.filter(f => f.id !== id);

                // Add to the correct list based on status
                if (normalized.status === 'COMPLETED') {
                    if (existingCompleted) {
                        newCompleted.push({ ...existingCompleted, ...normalized });
                    } else {
                        newCompleted.unshift({ ...(existingPending || {}), ...normalized });
                    }
                } else {
                    if (existingPending) {
                        newPending.push({ ...existingPending, ...normalized });
                    } else {
                        newPending.unshift({ ...(existingCompleted || {}), ...normalized });
                    }
                }

                return { pendingFollowUps: newPending, completedFollowUps: newCompleted };
            });
        } catch (error) {
            console.error('Failed to update follow-up:', error);
            throw error;
        }
    },

    removeFollowUp: async (id) => {
        try {
            await followUpsAPI.remove(id);
            set((state) => ({
                pendingFollowUps: state.pendingFollowUps.filter((f) => f.id !== id),
                completedFollowUps: state.completedFollowUps.filter((f) => f.id !== id)
            }));
        } catch (error) {
            console.error('Failed to remove follow-up:', error);
            throw error;
        }
    },
}));
