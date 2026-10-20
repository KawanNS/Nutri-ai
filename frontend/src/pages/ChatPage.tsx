import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BrandLogo } from '../components/BrandLogo'
import { MarkdownMessage } from '../components/MarkdownMessage'
import { Paywall } from '../components/Paywall'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { LoadingState } from '../components/ui/LoadingState'
import { Surface } from '../components/ui/Surface'
import { ApiError } from '../services/api'
import { createChatConversation, getChatConversation, listChatConversations, sendChatMessage } from '../services/chatService'
import { getSubscription } from '../services/billingService'
import type { ChatConversationSummary, ChatMessage } from '../types/chat'
import './ChatPage.css'

interface ChatPageProps { onMealPlan(): void; onDiary(): void; onProgress(): void }

const WELCOME_MESSAGE = 'Oi! Eu sou a Alyvora 👋 Como posso ajudar hoje? Me conta o que você precisa: uma troca no seu plano, uma ideia de refeição com o que você tem em casa ou ajuda para organizar a semana. É só escrever aqui embaixo.'

// The API saves the user's message before calling the AI, so these failures keep it in the conversation.
const SAVED_BEFORE_FAILURE = ['CHAT_TEMPORARILY_UNAVAILABLE', 'CHAT_INVALID_RESPONSE', 'CHAT_GENERATION_FAILED']

function chatError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'CHAT_TEMPORARILY_UNAVAILABLE') return 'Opa, estou fora do ar por um instante. Pode me mandar de novo daqui a pouco?'
  if (error instanceof ApiError && error.code === 'CHAT_RATE_LIMIT_EXCEEDED') return 'Foram muitas mensagens seguidas! Me dá um minutinho e manda de novo.'
  return 'Não consegui responder agora. Pode tentar de novo?'
}

function conversationTitle(content?: string): string {
  const normalized = content?.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Conversa sem mensagens'
  return normalized.length > 54 ? `${normalized.slice(0, 51).trimEnd()}…` : normalized
}

function AssistantMark() {
  return <img className="assistant-mark" src="/favicon.png" alt="" aria-hidden="true" width={64} height={64} draggable="false"/>
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
}

interface ConversationHistoryProps {
  conversations: ChatConversationSummary[]
  activeId: string | null
  sending: boolean
  open: boolean
  onClose(): void
  onNew(): void
  onOpen(id: string): void
}

function ConversationHistory({ conversations, activeId, sending, open, onClose, onNew, onOpen }: ConversationHistoryProps) {
  return <Surface
    as="aside"
    level="raised"
    className={`assistant-history${open ? ' assistant-history--open' : ''}`}
    id="assistant-history"
    aria-label="Histórico de conversas"
  >
    <div className="assistant-history__heading">
      <h2>Conversas</h2>
      <button className="assistant-icon-button" type="button" onClick={onClose} aria-label="Fechar histórico">×</button>
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
      {conversations.length === 0 && <p className="assistant-history__empty">Sua primeira conversa começa quando você envia uma mensagem.</p>}
    </div>
  </Surface>
}

export function ChatPage({ onMealPlan }: ChatPageProps) {
  const [premium, setPremium] = useState<boolean | null>(null), [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]), [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(''), [sending, setSending] = useState(false), [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null), inputRef = useRef<HTMLTextAreaElement | null>(null)

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

  // block: 'end' keeps the scroll inside the message list; the default ('start') also scrolled the whole chat shell and hid the header.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, sending])

  useEffect(() => {
    if (!historyOpen) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setHistoryOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [historyOpen])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [draft, loading])

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
      if (!(requestError instanceof ApiError && SAVED_BEFORE_FAILURE.includes(requestError.code ?? ''))) {
        setMessages((current) => current.filter((item) => !item.id.startsWith('pending-')))
        setDraft(message)
      }
      setError(chatError(requestError))
    } finally { setSending(false) }
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
  }

  return <div className="app-shell assistant-shell">
    <header className="assistant-header">
      <button className="assistant-icon-button" type="button" aria-label="Voltar para o plano alimentar" onClick={onMealPlan}><BackIcon/></button>
      <BrandLogo className="assistant-header__logo"/>
      {premium ? <button className="assistant-icon-button" type="button" aria-label="Conversas" aria-controls="assistant-history" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}><MenuIcon/></button> : <span className="assistant-header__spacer" aria-hidden="true"/>}
    </header>
    <main className="assistant-page">
      <h1 className="ui-visually-hidden">Assistente Alyvora</h1>
      {loading ? <div className="assistant-loading"><LoadingState label="Carregando seu assistente" description="Preparando suas conversas com segurança."/></div> : premium === false ? <div className="assistant-locked"><Alert variant="info" title="Recurso exclusivo Premium">O assistente de organização alimentar está disponível para assinantes Premium.</Alert><Paywall/></div> :
      <div className="assistant-layout">
        <ConversationHistory conversations={conversations} activeId={activeId} sending={sending} open={historyOpen} onClose={() => setHistoryOpen(false)} onNew={newConversation} onOpen={(id) => void openConversation(id)}/>
        {historyOpen && <div className="assistant-backdrop" aria-hidden="true" onClick={() => setHistoryOpen(false)}/>}
        <section className="assistant-chat" aria-label="Conversa com a Alyvora">
          <div className="assistant-messages" aria-live="polite" aria-relevant="additions text">
            <div className="assistant-thread">
              <article className="assistant-message assistant-message--assistant assistant-message--greeting"><AssistantMark/><p>{WELCOME_MESSAGE}</p></article>
              {messages.map((item) => <article key={item.id} className={`assistant-message assistant-message--${item.role.toLowerCase()}`}>
                {item.role === 'ASSISTANT' && <AssistantMark/>}
                <span className="ui-visually-hidden">{item.role === 'USER' ? 'Você:' : 'Alyvora:'}</span>
                {item.role === 'ASSISTANT' ? <MarkdownMessage content={item.content}/> : <p>{item.content}</p>}
              </article>)}
              {error && !sending && <article className="assistant-message assistant-message--assistant" role="alert"><AssistantMark/><p>{error}</p></article>}
              {sending && <div className="assistant-typing" role="status"><AssistantMark/><span aria-hidden="true"><i/><i/><i/></span><span className="ui-visually-hidden">Alyvora está preparando uma resposta…</span></div>}
              <div ref={endRef}/>
            </div>
          </div>
          <div className="assistant-composer">
            <div className="assistant-composer__box">
              <label className="ui-visually-hidden" htmlFor="chat-message">Sua mensagem</label>
              <textarea ref={inputRef} id="chat-message" aria-describedby="chat-message-hint" value={draft} maxLength={2000} rows={1} placeholder="Pergunte sobre sua alimentação…" disabled={sending} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown}/>
              <Button className="assistant-composer__send" loading={sending} loadingLabel="Enviando mensagem" disabled={draft.trim().length === 0} onClick={() => void submit()}><SendIcon/><span className="ui-visually-hidden">Enviar</span></Button>
            </div>
            <span className="ui-visually-hidden" id="chat-message-hint">Enter envia, Shift+Enter quebra a linha. Até 2000 caracteres.</span>
            {draft.length > 1800 && <span className="assistant-composer__count">{draft.length}/2000</span>}
          </div>
        </section>
      </div>}
      {error && (loading || premium === false) && <Alert variant="error" title="Não foi possível obter uma resposta agora.">{error}</Alert>}
    </main>
  </div>
}
