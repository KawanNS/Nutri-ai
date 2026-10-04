import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { DiaryNavButton } from '../components/DiaryNavButton'
import { MarkdownMessage } from '../components/MarkdownMessage'
import { Paywall } from '../components/Paywall'
import { PageHeader } from '../components/layout/PageHeader'
import { Alert } from '../components/ui/Alert'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { ApiError } from '../services/api'
import { createChatConversation, getChatConversation, listChatConversations, sendChatMessage } from '../services/chatService'
import { getSubscription } from '../services/billingService'
import type { ChatConversationSummary, ChatMessage } from '../types/chat'
import './ChatPage.css'

interface ChatPageProps { onMealPlan(): void; onDiary(): void; onProfile(): void; onProgress(): void; onLogout(): void }

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

function AssistantMark() {
  return <span className="assistant-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M12 3c.7 4.1 2.9 6.3 7 7-4.1.7-6.3 2.9-7 7-.7-4.1-2.9-6.3-7-7 4.1-.7 6.3-2.9 7-7Z"/><path d="M19 16c.2 1.4 1 2.2 2.4 2.4-1.4.2-2.2 1-2.4 2.4-.2-1.4-1-2.2-2.4-2.4 1.4-.2 2.2-1 2.4-2.4Z"/></svg>
  </span>
}

interface ConversationHistoryProps {
  conversations: ChatConversationSummary[]
  activeId: string | null
  sending: boolean
  mobileOpen: boolean
  onClose(): void
  onNew(): void
  onOpen(id: string): void
}

function ConversationHistory({ conversations, activeId, sending, mobileOpen, onClose, onNew, onOpen }: ConversationHistoryProps) {
  return <Surface
    as="aside"
    level="soft"
    className={`assistant-history${mobileOpen ? ' assistant-history--open' : ''}`}
    id="assistant-history"
    aria-label="Histórico de conversas"
  >
    <div className="assistant-history__heading">
      <div><h2>Conversas</h2><p>Seu histórico privado</p></div>
      <button className="assistant-history__close" type="button" onClick={onClose} aria-label="Fechar histórico">×</button>
    </div>
    <Button variant="secondary" fullWidth onClick={onNew} disabled={sending}>
      <span aria-hidden="true">＋</span> Nova conversa
    </Button>
    <div className="assistant-history__list">
      {conversations.map((item) => <button
        type="button"
        className={item.id === activeId ? 'assistant-conversation assistant-conversation--active' : 'assistant-conversation'}
        key={item.id}
        onClick={() => onOpen(item.id)}
        aria-current={item.id === activeId ? 'true' : undefined}
      >
        <strong>{conversationTitle(item.messages[0]?.content)}</strong>
        <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString('pt-BR')}</time>
      </button>)}
      {conversations.length === 0 && <div className="assistant-history__empty"><AssistantMark/><p>Sua primeira conversa começa quando você envia uma mensagem.</p></div>}
    </div>
  </Surface>
}

export function ChatPage({ onMealPlan, onDiary, onProfile, onProgress, onLogout }: ChatPageProps) {
  const [premium, setPremium] = useState<boolean | null>(null), [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]), [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
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
    try {
      const data = await getChatConversation(id)
      setActiveId(id); setMessages(data.conversation.messages); setHistoryOpen(false)
    } catch (requestError) { setError(chatError(requestError)) }
  }

  function newConversation() {
    if (!sending) { setActiveId(null); setMessages([]); setDraft(''); setError(null); setHistoryOpen(false) }
  }

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

  return <div className="app-shell"><header className="topbar"><div className="topbar__content"><div className="brand"><BrandLogo/></div><nav className="topbar__actions" aria-label="Navegação principal"><button className="nav-button" type="button" onClick={onMealPlan}>Plano alimentar</button><button className="nav-button nav-button--active" type="button" aria-current="page">Assistente</button><DiaryNavButton onClick={onDiary}/><button className="nav-button" type="button" onClick={onProfile}>Perfil</button><button className="nav-button" type="button" onClick={onProgress}>Evolução</button><button className="logout-button" type="button" onClick={onLogout}>Sair</button></nav></div></header>
    <main className="page assistant-page">
      <PageHeader eyebrow="Orientação para sua rotina" title="Assistente Alyvora" description="Converse sobre seu plano e encontre caminhos práticos para organizar sua alimentação." actions={<Badge variant="success">Premium</Badge>}/>
      {error && <Alert variant="error" title="Não foi possível obter uma resposta agora.">{error}</Alert>}
      {loading ? <Surface className="assistant-loading"><LoadingState label="Carregando seu assistente" description="Preparando suas conversas com segurança."/></Surface> : premium === false ? <div className="assistant-locked"><Alert variant="info" title="Recurso exclusivo Premium">O assistente de organização alimentar está disponível para assinantes Premium.</Alert><Paywall/></div> :
      <div className="assistant-layout">
        <ConversationHistory conversations={conversations} activeId={activeId} sending={sending} mobileOpen={historyOpen} onClose={() => setHistoryOpen(false)} onNew={newConversation} onOpen={(id) => void openConversation(id)}/>
        <Surface as="section" className="assistant-chat" padded={false} aria-labelledby="assistant-chat-title">
          <header className="assistant-chat__header">
            <div className="assistant-chat__identity"><AssistantMark/><div><h2 id="assistant-chat-title">Sua conversa</h2><p>Orientação prática para sua rotina alimentar</p></div></div>
            <Button className="assistant-chat__history-button" variant="ghost" aria-controls="assistant-history" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>Conversas</Button>
          </header>
          <div className="assistant-messages" aria-live="polite" aria-relevant="additions text">
            {messages.length === 0 && <div className="assistant-empty"><AssistantMark/><h2>Como posso ajudar hoje?</h2><p>Pergunte sobre seu plano, alternativas para uma refeição ou formas de organizar sua semana.</p></div>}
            {messages.map((item) => <article key={item.id} className={`assistant-message assistant-message--${item.role.toLowerCase()}`}>
              <span className="assistant-message__author">{item.role === 'USER' ? 'Você' : 'Alyvora'}</span>
              {item.role === 'ASSISTANT' ? <MarkdownMessage content={item.content}/> : <p>{item.content}</p>}
            </article>)}
            {sending && <div className="assistant-typing" role="status"><span aria-hidden="true"><i/><i/><i/></span><p><strong>Alyvora está preparando uma resposta…</strong><small>Isso pode levar alguns instantes.</small></p></div>}
            <div ref={endRef}/>
          </div>
          <div className="assistant-composer">
            <FormField id="chat-message" label="Sua mensagem" hint={`${draft.length}/2000 · Enter envia · Shift+Enter quebra a linha`}>
              {(controlProps) => <textarea {...controlProps} value={draft} maxLength={2000} rows={2} placeholder="Pergunte sobre sua alimentação ou seu plano…" disabled={sending} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown}/>}
            </FormField>
            <Button className="assistant-composer__send" loading={sending} loadingLabel="Enviando mensagem" disabled={draft.trim().length === 0} onClick={() => void submit()}><span>Enviar</span><span aria-hidden="true">→</span></Button>
          </div>
        </Surface>
      </div>}
    </main>
  </div>
}
