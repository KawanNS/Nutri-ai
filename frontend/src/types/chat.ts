export type ChatRole = 'USER' | 'ASSISTANT'
export interface ChatMessage { id: string; role: ChatRole; content: string; createdAt: string }
export interface ChatConversationSummary { id: string; createdAt: string; updatedAt: string; messages: Array<Pick<ChatMessage, 'role' | 'content'>> }
export interface ChatConversation { id: string; createdAt: string; updatedAt: string; messages: ChatMessage[] }
