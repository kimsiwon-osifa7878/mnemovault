"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function WikiPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  useEffect(() => {
    // Redirect to main page with the slug as a query param
    // The main page handles all wiki viewing in the IDE layout
    router.push(`/app?page=${slug}`);
  }, [slug, router]);

  return (
    <div className="flex items-center justify-center h-screen bg-[#0a0a0f] text-white/30">
      Redirecting...
    </div>
  );
}
