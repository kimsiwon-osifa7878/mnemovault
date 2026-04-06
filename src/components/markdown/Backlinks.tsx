"use client";

import { ArrowLeft } from "lucide-react";

interface BacklinksProps {
  backlinks: string[];
  onLinkClick: (slug: string) => void;
}

export default function Backlinks({ backlinks, onLinkClick }: BacklinksProps) {
  if (backlinks.length === 0) return null;

  return (
    <div className="mt-8 pt-4 border-t border-white/10">
      <h3 className="text-sm font-medium text-white/50 mb-2 uppercase tracking-wider">
        Backlinks
      </h3>
      <div className="space-y-1">
        {backlinks.map((slug) => (
          <button
            key={slug}
            onClick={() => onLinkClick(slug)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-white/5 px-2 py-1 rounded w-full text-left"
          >
            <ArrowLeft className="w-3 h-3" />
            {slug}
          </button>
        ))}
      </div>
    </div>
  );
}
