import { apiRequest } from './api'
import type { ChatConversation, ChatConversationSummary, ChatMessage } from '../types/chat'

export const listChatConversations = () => apiRequest<{ conversations: ChatConversationSummary[] }>('/api/chat/conversations')
export const createChatConversation = () => apiRequest<{ conversation: ChatConversation }>('/api/chat/conversations', { method: 'POST', body: JSON.stringify({}) })
export const getChatConversation = (id: string) => apiRequest<{ conversation: ChatConversation }>(`/api/chat/conversations/${encodeURIComponent(id)}`)
export const sendChatMessage = (id: string, message: string) => apiRequest<{ userMessage: ChatMessage; assistantMessage: ChatMessage }>(`/api/chat/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ message }) })
