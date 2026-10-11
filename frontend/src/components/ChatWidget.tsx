import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api, ApiError } from '../api/client';
import type { ChatCitation, ChatTurnRequest } from '../api/types';
import { PartTag } from './PartTag';

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  isError?: boolean;
}

/**
 * The agent's replies are plain text, not markdown, but the system prompt
 * asks it to write `-`-prefixed lines when listing parts (short, simple
 * language, PLAN.md-adjacent tone change). Rendering those as a real `<ul>`
 * reads noticeably cleaner than the raw dash sitting in a `whitespace-pre-wrap`
 * block; any line that isn't a bullet still renders as a plain paragraph.
 */
function renderReply(content: string) {
  const lines = content.split('\n');
  const blocks: { type: 'text' | 'list'; lines: string[] }[] = [];

  for (const line of lines) {
    const isBullet = /^[-•]\s+/.test(line.trim());
    const last = blocks[blocks.length - 1];
    if (isBullet && last?.type === 'list') {
      last.lines.push(line.trim().replace(/^[-•]\s+/, ''));
    } else if (isBullet) {
      blocks.push({ type: 'list', lines: [line.trim().replace(/^[-•]\s+/, '')] });
    } else if (last?.type === 'text') {
      last.lines.push(line);
    } else {
      blocks.push({ type: 'text', lines: [line] });
    }
  }

  return blocks.map((block, i) =>
    block.type === 'list' ? (
      <ul key={i} className="my-1 list-disc space-y-0.5 pl-4">
        {block.lines.map((line, j) => (
          <li key={j}>{line}</li>
        ))}
      </ul>
    ) : (
      <p key={i} className="whitespace-pre-wrap">
        {block.lines.join('\n')}
      </p>
    ),
  );
}

const GREETING: DisplayMessage = {
  role: 'assistant',
  content: "Hi! Describe what you need, or give me a part number, and I'll check our catalogue.",
};

// Shown only before the first message. Most people don't know what a parts
// assistant can do — a few real examples answer that faster than any
// explanation, and one tap sends it (no typing on a phone keyboard).
// Each one is something the sample catalogue actually has an answer for.
const SUGGESTIONS = [
  'Brake pads for Toyota Corolla',
  'Oil filter for Suzuki Alto',
  'U-joint for Toyota Hiace',
  'Will 04465-02220 fit my Hiace?',
];

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
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  // Escape closes — the panel has no other keyboard way out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function handleSend(override?: string) {
    const text = (override ?? input).trim();
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

  const showSuggestions = messages.length === 1 && !isSending;

  return (
    <>
      {/* Phones (below sm): a full-screen sheet that slides up from the
          bottom and back down the same way — a floating box over a 390px
          screen left a sliver of page above and below it and a keyboard
          that covered the input. sm and up: a panel that grows out of the
          launcher button (transform-origin bottom-right), so it's obvious
          which button it belongs to. Critically damped spring, no
          overshoot: opening a panel is a tap, not a flick. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="chat-panel"
            role="dialog"
            aria-label="Ask LankaAuto"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
            style={{ transformOrigin: 'bottom right' }}
            className="fixed inset-0 z-[70] flex h-[100dvh] flex-col overflow-hidden bg-graphite sm:inset-auto sm:right-5 sm:bottom-24 sm:h-[34rem] sm:max-h-[calc(100dvh-8rem)] sm:w-[24rem] sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-elevated"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-steel/60 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-safety/15 text-safety">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold tracking-wide text-chalk">Ask LankaAuto</p>
                  <p className="truncate text-xs text-chalk/50">Part lookup & fitment help</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-chalk/60 transition-colors hover:bg-white/5 hover:text-safety"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* data-lenis-prevent: Lenis (useSmoothScroll) otherwise grabs
                the mouse wheel over this list and scrolls the page behind
                the panel instead of the messages. overscroll-contain stops
                a finger-scroll at the end of the list from carrying on into
                the page underneath. */}
            <div
              ref={scrollRef}
              data-lenis-prevent
              className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4"
            >
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[0.9375rem] leading-relaxed ${
                      m.role === 'user'
                        ? 'rounded-br-md bg-safety text-white'
                        : m.isError
                          ? 'rounded-bl-md border border-red-400/30 bg-red-500/10 text-red-200'
                          : 'rounded-bl-md bg-white/[0.07] text-chalk'
                    }`}
                  >
                    {m.role === 'assistant' && !m.isError ? renderReply(m.content) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                    {m.citations !== undefined && m.citations.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/10 pt-2.5">
                        {m.citations.map((c) => (
                          <Link
                            key={c.partId}
                            to={`/parts/${c.partId}`}
                            onClick={() => setOpen(false)}
                            className="pressable rounded-sm ring-1 ring-white/10 transition-shadow hover:ring-safety"
                          >
                            <PartTag>{c.partNumber ?? c.rawName}</PartTag>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {showSuggestions && (
                <div className="flex flex-col items-start gap-2 pt-1">
                  <p className="px-1 text-xs font-semibold uppercase tracking-wider text-chalk/40">Try asking</p>
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void handleSend(suggestion)}
                      className="pressable rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-left text-sm text-chalk/80 transition-colors hover:border-safety/60 hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {isSending && (
                <div className="flex justify-start" aria-live="polite">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white/[0.07] px-3.5 py-3 text-sm text-chalk/60">
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="size-1.5 animate-pulse rounded-full bg-safety" />
                      <span className="size-1.5 animate-pulse rounded-full bg-safety [animation-delay:150ms]" />
                      <span className="size-1.5 animate-pulse rounded-full bg-safety [animation-delay:300ms]" />
                    </span>
                    Checking the catalogue…
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-2 border-t border-white/10 bg-steel/40 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]"
            >
              {/* text-base (16px) on phones: smaller and iPhone Safari zooms
                  the whole page in on focus and leaves it zoomed. */}
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. u-joint for a Toyota Hiace"
                disabled={isSending}
                enterKeyHint="send"
                aria-label="Message"
                className="min-h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-base text-white placeholder:text-chalk/40 focus:border-safety focus:outline-none disabled:opacity-60 sm:text-sm"
              />
              <button
                type="submit"
                disabled={isSending || input.trim() === ''}
                aria-label="Send"
                className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-safety text-white transition-colors disabled:bg-white/10 disabled:text-chalk/40"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher. Hidden on phones while the sheet is open — the sheet
          has its own close button and covers the screen, so a second X
          floating over the input would just be in the way. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className={`pressable safe-bottom fixed right-5 z-[60] h-14 w-14 items-center justify-center rounded-full bg-safety text-white shadow-[0_8px_24px_-6px_rgba(255,90,31,0.6)] transition-transform hover:scale-105 ${
          open ? 'hidden sm:flex' : 'flex'
        }`}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="size-6" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-6" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>
    </>
  );
}
