"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useWikiStore } from "@/stores/wiki-store";
import type { Components } from "react-markdown";

interface WikiRendererProps {
  content: string;
  onLinkClick?: (slug: string) => void;
}

const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

function processWikilinks(text: string): string {
  return text.replace(WIKILINK_REGEX, (_match, target, alias) => {
    const slug = target
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w가-힣-]/g, "");
    const displayText = alias || target;
    return `<a href="/wiki/${slug}" class="wikilink" data-slug="${slug}">${displayText}</a>`;
  });
}

export default function WikiRenderer({ content, onLinkClick }: WikiRendererProps) {
  const { pages } = useWikiStore();
  const existingSlugs = new Set(pages.map((p) => p.slug));

  const processedContent = processWikilinks(content);

  const components: Components = {
    a: ({ href, children, ...props }) => {
      const dataSlug = (props as Record<string, string>)["data-slug"];
      if (dataSlug || href?.startsWith("/wiki/")) {
        const slug = dataSlug || href?.replace("/wiki/", "") || "";
        const exists = existingSlugs.has(slug);
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              onLinkClick?.(slug);
            }}
            className={`cursor-pointer underline decoration-dotted ${
              exists
                ? "text-[#60a5fa] hover:text-blue-300"
                : "text-[#f87171] hover:text-red-300"
            }`}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href} className="text-[#60a5fa] hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mt-6 mb-4 text-white/90">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-semibold mt-5 mb-3 text-white/85 border-b border-white/10 pb-2">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg font-medium mt-4 mb-2 text-white/80">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="mb-3 leading-relaxed text-white/70">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-3 text-white/70 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-3 text-white/70 space-y-1">{children}</ol>
    ),
    code: ({ children, className }) => {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm text-emerald-400">
            {children}
          </code>
        );
      }
      return (
        <code className={`${className} text-sm`}>{children}</code>
      );
    },
    pre: ({ children }) => (
      <pre className="bg-[#0a0a12] border border-white/10 rounded-lg p-4 mb-3 overflow-x-auto">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-blue-500/50 pl-4 my-3 text-white/60 italic">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto mb-3">
        <table className="w-full text-sm text-white/70 border-collapse">
          {children}
        </table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-white/10 px-3 py-2 text-left bg-white/5 font-medium">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-white/10 px-3 py-2">{children}</td>
    ),
    hr: () => <hr className="border-white/10 my-6" />,
    em: ({ children }) => (
      <em className="text-white/50">{children}</em>
    ),
  };

  return (
    <div className="wiki-content prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
