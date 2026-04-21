"use client";
import { useEffect } from "react";

/**
 * /admin → redirige vers le nouveau design v4 admin (/v4/admin.html)
 * Les sous-routes /admin/users, /admin/tracks, etc. restent intactes.
 */
export default function AdminRedirect() {
  useEffect(() => {
    window.location.replace("/v4/admin.html");
  }, []);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  );
}
