import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { ChatCitation, ChatTurnRequest } from '../api/types';
import { PartTag } from './PartTag';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  isError?: boolean;
}

const GREETING: DisplayMessage = {
  role: 'assistant',
  content: "Hi! Describe what you need, or give me a part number, and I'll check our catalogue.",
};

/**
 * Phase 5 (PLAN.md §8): "Chat assistant — persistent widget: 'Describe what
 * you need, or enter a part number.'" Floating launcher + panel, present on
 * every customer page (mounted once in `Layout.tsx`, hidden on `/staff*`
 * routes — this is the customer agent, not the staff one).
 *
 * Stateless server, so the full message history rides along on every
 * request (`api.chat`) — no session/account for customers, by design
 * (CLAUDE.md: "no signup page").
 */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([GREETING]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  async function handleSend() {
    const text = input.trim();
    if (text === '' || isSending) return;

    const nextMessages: DisplayMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      // Only role/content travel to the server — citations are a
      // display-only annotation the backend has no use for on replay.
      const history: ChatTurnRequest[] = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const result = await api.chat(history);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply, citations: result.citations }]);
    } catch (err) {
      // 503 = the backend's own ChatRateLimitError translation (see
      // routes/chat.ts) — a Gemini quota limit, not our bug, so its message
      // is already customer-appropriate and worth showing as-is.
      const message =
        err instanceof ApiError
          ? err.status === 503
            ? err.message
            : 'Sorry, something went wrong on our end. Please try again or call the shop.'
          : 'Could not reach the assistant — check your connection and try again.';
      setMessages((prev) => [...prev, { role: 'assistant', content: message, isError: true }]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-lg border border-muted/20 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-muted/20 bg-graphite px-4 py-3">
            <div>
              <p className="font-display text-sm font-bold tracking-wide text-chalk">Ask LankaAuto</p>
              <p className="text-xs text-chalk/50">Part lookup & fitment help</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-sm p-1 text-chalk/60 hover:text-safety"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-safety text-white'
                      : m.isError
                        ? 'bg-red-50 text-red-700'
                        : 'bg-graphite/5 text-graphite'
                  }`}
                >
                  {m.content}
                  {m.citations !== undefined && m.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-graphite/10 pt-2">
                      {m.citations.map((c) => (
                        <Link key={c.partId} to={`/parts/${c.partId}`} onClick={() => setOpen(false)}>
                          <PartTag>{c.partNumber ?? c.rawName}</PartTag>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-graphite/5 px-3 py-2 text-sm text-muted">Checking…</div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex gap-2 border-t border-muted/20 p-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. u-joint for a Toyota Hiace"
              disabled={isSending}
              className="min-w-0 flex-1 rounded-sm border border-muted/30 px-3 py-2 text-sm focus:border-safety focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || input.trim() === ''}
              className="rounded-sm bg-safety px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-safety text-white shadow-[0_8px_24px_-6px_rgba(255,90,31,0.6)] transition-transform hover:scale-105"
      >
        {open ? (
          <span className="text-xl leading-none">✕</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
