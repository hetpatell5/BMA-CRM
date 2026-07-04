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
    createdAt: string;
    updatedAt: string;
    createdById: number;
    createdBy?: { id: number; fullName: string };
}

interface FollowUpState {
    followUps: FollowUp[];
    isLoading: boolean;
    fetchFollowUps: (search?: string) => Promise<void>;
    addFollowUp: (followUp: { name: string; number: string; description: string; followupDate: string; requirement: string }) => Promise<void>;
    updateFollowUp: (id: string, data: Partial<Pick<FollowUp, 'description' | 'requirement' | 'followupDate' | 'status'>>) => Promise<void>;
    removeFollowUp: (id: string) => Promise<void>;
}


export const useFollowUpStore = create<FollowUpState>()((set) => ({
    followUps: [],
    isLoading: false,

    fetchFollowUps: async (search?: string) => {
        set({ isLoading: true });
        try {
            const response = await followUpsAPI.getAll(search);
            const data = response.data.data || [];
            // Normalize dates to ISO strings for frontend consumption
            const normalized = data.map((f: any) => ({
                ...f,
                id: String(f.id),
                followupDate: f.followupDate || f.followup_date,
                createdAt: f.createdAt || f.created_at,
                updatedAt: f.updatedAt || f.updated_at,
            }));
            set({ followUps: normalized, isLoading: false });
        } catch (error) {
            console.error('Failed to fetch follow-ups:', error);
            set({ isLoading: false });
        }
    },

    addFollowUp: async (followUp) => {
        try {
            const response = await followUpsAPI.create(followUp);
            const newFollowUp = response.data.data;
            set((state) => ({
                followUps: [
                    {
                        ...newFollowUp,
                        id: String(newFollowUp.id),
                        followupDate: newFollowUp.followupDate || newFollowUp.followup_date,
                        createdAt: newFollowUp.createdAt || newFollowUp.created_at,
                        updatedAt: newFollowUp.updatedAt || newFollowUp.updated_at,
                    },
                    ...state.followUps,
                ]
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
            set((state) => ({
                followUps: state.followUps.map((f) =>
                    f.id === id
                        ? {
                            ...f,
                            ...updated,
                            id: String(updated.id),
                            followupDate: updated.followupDate || updated.followup_date,
                            updatedAt: updated.updatedAt || updated.updated_at,
                        }
                        : f
                )
            }));
        } catch (error) {
            console.error('Failed to update follow-up:', error);
            throw error;
        }
    },

    removeFollowUp: async (id) => {
        try {
            await followUpsAPI.remove(id);
            set((state) => ({
                followUps: state.followUps.filter((f) => f.id !== id)
            }));
        } catch (error) {
            console.error('Failed to remove follow-up:', error);
            throw error;
        }
    },
}));
