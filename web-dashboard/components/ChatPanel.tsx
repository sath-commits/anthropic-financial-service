'use client';

import { useRef, useState, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

const QUICK_PROMPTS = [
  'Morning digest',
  'Rebalance my portfolio',
  'Find TLH opportunities',
  'Screen for value stocks',
];

interface ChatPanelProps {
  portfolioContext?: string;
  profileContext?: string;
}

export default function ChatPanel({ portfolioContext, profileContext }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          portfolioContext,
          profileContext,
        }),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const { text } = JSON.parse(payload);
            accumulated += text;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: accumulated };
              return updated;
            });
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Something went wrong'}` };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col rounded-xl border border-[#e5ddd3] bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#e5ddd3] px-4 py-3">
        <Bot className="h-4 w-4 text-blue-400" />
        <span className="text-sm font-semibold text-[#2d2218]">Beta than nothing</span>
        <span className="ml-auto text-xs text-[#b8ad9e]">gpt-4o</span>
      </div>

      {/* Messages — compact when empty, scrollable once conversation starts */}
      {hasMessages ? (
        <div className="overflow-y-auto px-4 py-3 space-y-4" style={{ maxHeight: '520px' }}>
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="mt-0.5 flex-shrink-0 rounded-full bg-blue-950 p-1">
                  <Bot className="h-3 w-3 text-blue-400" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-[#ede8df] text-[#2d2218]'
                }`}
              >
                {m.content || (loading && i === messages.length - 1 ? (
                  <Loader2 className="h-3 w-3 animate-spin text-[#1c1612]0" />
                ) : '')}
              </div>
              {m.role === 'user' && (
                <div className="mt-0.5 flex-shrink-0 rounded-full bg-[#e0dbd4] p-1">
                  <User className="h-3 w-3 text-[#4a3d33]" />
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      ) : (
        <div className="px-4 pt-4 pb-2 space-y-3">
          <p className="text-xs text-[#b8ad9e] text-center">Ask anything about your portfolio</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map(p => (
              <button
                key={p}
                onClick={() => send(p)}
                className="rounded-full border border-[#d4c9bc] bg-[#ede8df] px-3 py-1.5 text-xs text-[#4a3d33] hover:bg-[#e0dbd4] transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[#e5ddd3] px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio..."
            rows={1}
            className="flex-1 resize-none rounded-lg bg-[#ede8df] px-3 py-2 text-xs text-[#2d2218] placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600 max-h-24"
            style={{ minHeight: '34px' }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
