"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /admin → redirige vers /admin/dashboard
 * L'ancienne page monolithique est remplacée par des pages séparées.
 */
export default function AdminRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/dashboard");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  );
}
