export interface ProgressEntry { id: string; weightKg: string; recordedAt: string; note: string | null; createdAt: string; updatedAt: string }
export interface ProgressListResponse { progressEntries: ProgressEntry[]; nextCursor: string | null }
export interface CreateProgressInput { weightKg: string; recordedAt: string; note: string | null }
export interface CreateProgressResponse { progressEntry: ProgressEntry }
