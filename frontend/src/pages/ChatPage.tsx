import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { MarkdownMessage } from '../components/MarkdownMessage'
import { Paywall } from '../components/Paywall'
import { ApiError } from '../services/api'
import { createChatConversation, getChatConversation, listChatConversations, sendChatMessage } from '../services/chatService'
import { getSubscription } from '../services/billingService'
import type { ChatConversationSummary, ChatMessage } from '../types/chat'

interface ChatPageProps { onMealPlan(): void; onProfile(): void; onProgress(): void; onLogout(): void }

function chatError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'CHAT_TEMPORARILY_UNAVAILABLE') return 'O assistente está temporariamente indisponível. Tente novamente em alguns instantes.'
  if (error instanceof ApiError && error.code === 'CHAT_RATE_LIMIT_EXCEEDED') return 'Você enviou muitas mensagens em pouco tempo. Aguarde um instante.'
  return 'Não foi possível concluir esta conversa agora. Tente novamente.'
}

function conversationTitle(content?: string): string {
  const normalized = content?.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Conversa sem mensagens'
  return normalized.length > 54 ? `${normalized.slice(0, 51).trimEnd()}…` : normalized
}

export function ChatPage({ onMealPlan, onProfile, onProgress, onLogout }: ChatPageProps) {
  const [premium, setPremium] = useState<boolean | null>(null), [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]), [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true
    void getSubscription().then(async ({ subscription }) => {
      if (!active) return
      setPremium(subscription.isPremium)
      if (subscription.isPremium) {
        const data = await listChatConversations()
        if (!active) return
        setConversations(data.conversations)
        if (data.conversations[0]) {
          const selected = await getChatConversation(data.conversations[0].id)
          if (active) { setActiveId(selected.conversation.id); setMessages(selected.conversation.messages) }
        }
      }
    }).catch((requestError) => { if (active && !(requestError instanceof ApiError && requestError.status === 401)) setError(chatError(requestError)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  async function openConversation(id: string) {
    if (sending) return
    setError(null)
    try { const data = await getChatConversation(id); setActiveId(id); setMessages(data.conversation.messages) }
    catch (requestError) { setError(chatError(requestError)) }
  }

  function newConversation() { if (!sending) { setActiveId(null); setMessages([]); setDraft(''); setError(null) } }

  async function submit() {
    const message = draft.trim()
    if (!message || message.length > 2000 || sending || !premium) return
    setSending(true); setError(null); setDraft('')
    try {
      let conversationId = activeId
      if (!conversationId) {
        const created = await createChatConversation()
        conversationId = created.conversation.id
        setActiveId(conversationId)
      }
      const optimistic: ChatMessage = { id: `pending-${Date.now()}`, role: 'USER', content: message, createdAt: new Date().toISOString() }
      setMessages((current) => [...current, optimistic])
      const result = await sendChatMessage(conversationId, message)
      setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), result.userMessage, result.assistantMessage])
      setConversations((await listChatConversations()).conversations)
    } catch (requestError) {
      setMessages((current) => current.filter((item) => !item.id.startsWith('pending-')))
      setDraft(message); setError(chatError(requestError))
    } finally { setSending(false) }
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
  }

  return <div className="app-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><BrandLogo/></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button" onClick={onMealPlan}>Plano alimentar</button><button className="nav-button nav-button--active">Assistente</button><button className="nav-button" onClick={onProfile}>Perfil</button><button className="nav-button" onClick={onProgress}>Evolução</button><button className="logout-button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page chat-page"><div className="page-heading"><div><p className="eyebrow">Recurso Premium</p><h1>Organize sua alimentação em conversa.</h1><p>Tire dúvidas sobre seu plano, pense em substituições e ajuste sua rotina com o assistente Nutri-AI.</p></div></div>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {loading ? <div className="panel loading"><span className="spinner" aria-label="Carregando assistente"/></div> : premium === false ? <><div className="notice notice--info">O assistente de organização alimentar é exclusivo para assinantes Premium.</div><Paywall/></> :
      <div className="chat-layout"><aside className="panel chat-sidebar"><div className="panel__header"><div><h2>Conversas</h2><p className="panel__subtitle">Seu histórico privado</p></div></div><button className="button button--secondary" type="button" onClick={newConversation} disabled={sending}>Nova conversa</button><div className="chat-conversation-list">{conversations.map((item) => <button type="button" className={item.id === activeId ? 'chat-conversation chat-conversation--active' : 'chat-conversation'} key={item.id} onClick={() => void openConversation(item.id)}><strong>{conversationTitle(item.messages[0]?.content)}</strong><span>{new Date(item.updatedAt).toLocaleDateString('pt-BR')}</span></button>)}{conversations.length === 0 && <p className="empty">Sua primeira conversa começa ao enviar uma mensagem.</p>}</div></aside>
        <section className="panel chat-panel" aria-label="Conversa com o assistente"><div className="chat-messages" aria-live="polite">{messages.length === 0 && <div className="chat-empty"><span aria-hidden="true">✦</span><h2>Como posso ajudar na sua organização hoje?</h2><p>Você pode perguntar sobre seu plano atual, alternativas de refeições ou como preparar sua semana.</p></div>}{messages.map((item) => <article key={item.id} className={`chat-message chat-message--${item.role.toLowerCase()}`}><span>{item.role === 'USER' ? 'Você' : 'Nutri-AI'}</span>{item.role === 'ASSISTANT' ? <MarkdownMessage content={item.content}/> : <p>{item.content}</p>}</article>)}{sending && <div className="chat-typing" role="status"><span className="spinner"/> Preparando uma resposta…</div>}<div ref={endRef}/></div>
          <div className="chat-composer"><label htmlFor="chat-message" className="sr-only">Mensagem</label><textarea id="chat-message" value={draft} maxLength={2000} rows={3} placeholder="Escreva sua dúvida sobre alimentação ou seu plano…" disabled={sending} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown}/><div><small>{draft.length}/2000 · Enter envia, Shift+Enter quebra a linha</small><button className="button button--primary" type="button" disabled={sending || draft.trim().length === 0} onClick={() => void submit()}>Enviar</button></div></div>
        </section></div>}
    </main></div>
}
