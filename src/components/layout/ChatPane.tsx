"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useWikiStore } from "@/stores/wiki-store";
import { useLLMStore } from "@/stores/llm-store";
import WikiRenderer from "@/components/markdown/WikiRenderer";
import { Send, Trash2, BookmarkPlus, Loader2 } from "lucide-react";

interface ChatPaneProps {
  onLinkClick: (slug: string) => void;
}

export default function ChatPane({ onLinkClick }: ChatPaneProps) {
  const { messages, isLoading, sendQuery, clearMessages } = useChatStore();
  const { currentSlug } = useWikiStore();
  const { getConfig, language } = useLLMStore();
  const [input, setInput] = useState("");
  const [fileAsPage, setFileAsPage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const question = input.trim();
    setInput("");
    await sendQuery(question, currentSlug || undefined, fileAsPage, getConfig(), language);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d14]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <h3 className="text-xs font-medium text-white/50 uppercase tracking-wider">
          Chat
        </h3>
        <button
          onClick={clearMessages}
          className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/5"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Context indicator */}
      {currentSlug && (
        <div className="px-3 py-1.5 border-b border-white/5 text-[10px] text-white/30">
          Context: <span className="text-blue-400">{currentSlug}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-white/20 text-xs mt-8">
            <p>Ask questions about your wiki.</p>
            <p className="mt-1">Context is selected from wiki index first, then matched to your query.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`${
              msg.role === "user"
                ? "ml-4 bg-blue-500/10 border border-blue-500/20"
                : "mr-4 bg-white/5 border border-white/5"
            } rounded-lg p-3`}
          >
            <div className="text-[10px] text-white/30 mb-1 uppercase">
              {msg.role}
            </div>
            {msg.role === "assistant" ? (
              <div className="text-sm">
                <WikiRenderer content={msg.content} onLinkClick={onLinkClick} />
              </div>
            ) : (
              <p className="text-sm text-white/80">{msg.content}</p>
            )}
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-2 pt-2 border-t border-white/5">
                <span className="text-[10px] text-white/30">Citations: </span>
                {msg.citations.map((c) => (
                  <button
                    key={c}
                    onClick={() => onLinkClick(c.toLowerCase().replace(/\s+/g, "-"))}
                    className="text-[10px] text-blue-400 hover:text-blue-300 mr-2"
                  >
                    [[{c}]]
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-white/30 text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2">
        <div className="flex items-center gap-1 mb-1.5">
          <button
            onClick={() => setFileAsPage(!fileAsPage)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
              fileAsPage
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-white/5 text-white/30 hover:text-white/50"
            }`}
            title="Save answer as wiki page"
          >
            <BookmarkPlus className="w-3 h-3" />
            Save to wiki
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your wiki..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 placeholder-white/30 focus:border-blue-500/50 focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-30"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
