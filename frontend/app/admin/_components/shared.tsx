"use client";
import { type ReactNode, type ElementType, createContext, useContext, useState, useCallback } from "react";
import { Loader, type LucideIcon } from "lucide-react";

// ═══════════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════════

type ToastType = "success" | "error" | "warning" | "info";
interface Toast { id: number; message: string; type: ToastType }
interface ToastCtx { toasts: Toast[]; toast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastCtx>({ toasts: [], toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const colors: Record<ToastType, string> = {
    success: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    error: "bg-red-500/15 border-red-500/30 text-red-400",
    warning: "bg-amber-500/15 border-amber-500/30 text-amber-400",
    info: "bg-blue-500/15 border-blue-500/30 text-blue-400",
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-3 rounded-lg border text-sm font-medium animate-slide-in ${colors[t.type]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ═══════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "purple" | "pink";
  className?: string;
}

const badgeVariants: Record<string, string> = {
  default: "bg-accent/15 text-accent border-accent/25",
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  warning: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  error: "bg-red-500/15 text-red-400 border-red-500/25",
  info: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/25",
  pink: "bg-pink-500/15 text-pink-400 border-pink-500/25",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border font-mono tracking-wide ${badgeVariants[variant]} ${className}`}>
      {children}
    </span>
  );
}

interface BtnProps {
  children?: ReactNode;
  variant?: "primary" | "danger" | "success" | "warning" | "default" | "ghost";
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
}

const btnVariants: Record<string, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  danger: "bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25",
  success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25",
  warning: "bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/25",
  default: "bg-bg-elevated text-text-secondary border border-border-subtle hover:bg-bg-hover",
  ghost: "text-text-muted hover:text-text-secondary hover:bg-bg-hover",
};

export function Btn({ children, variant = "default", icon: Icon, onClick, className = "", small, disabled, loading, type = "button" }: BtnProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-all cursor-pointer
        ${small ? "px-2 py-1 text-[11px]" : "px-3.5 py-2 text-xs"}
        ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}
        ${btnVariants[variant]} ${className}`}
    >
      {loading ? <Loader size={small ? 11 : 13} className="animate-spin" /> : Icon && <Icon size={small ? 11 : 13} />}
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-bg-card border border-border-subtle rounded-xl ${className}`}>
      {children}
    </div>
  );
}

interface InputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  rows?: number;
  hint?: string;
}

export function Input({ label, value, onChange, type = "text", placeholder, multiline, className = "", rows = 3, hint }: InputProps) {
  const base = "w-full px-3 py-2 rounded-lg border border-border-default bg-bg-secondary text-text-primary text-sm outline-none focus:border-accent transition-colors";
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">{label}</label>}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`${base} resize-y`} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={base} />
      )}
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </div>
  );
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

export function Select({ label, value, onChange, options, className = "" }: SelectProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border-default bg-bg-secondary text-text-primary text-sm outline-none focus:border-accent transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function Toggle({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label?: string; disabled?: boolean }) {
  return (
    <button onClick={onToggle} disabled={disabled} className={`flex items-center gap-2 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
      <div className={`w-9 h-5 rounded-full p-0.5 transition-all ${on ? "bg-accent" : "bg-bg-hover"}`}>
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      {label && <span className="text-xs text-text-secondary">{label}</span>}
    </button>
  );
}

export function StatCard({ icon: Icon, label, value, color, sub }: { icon: LucideIcon; label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <Card className="p-4 flex-1 min-w-[160px]">
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: (color || "#2563eb") + "18" }}>
          <Icon size={16} style={{ color: color || "#2563eb" }} />
        </div>
        <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-2xl font-bold text-text-primary font-mono">{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-1">{sub}</div>}
    </Card>
  );
}

export function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-border-default cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-3 py-1.5 rounded-lg border border-border-default bg-bg-secondary text-text-primary text-xs font-mono outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-bg-elevated flex items-center justify-center mb-4">
        <Icon size={28} className="text-text-muted" />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-md mb-4">{description}</p>
      {action}
    </div>
  );
}

export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">{title}</h2>
        {description && <p className="text-sm text-text-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function TabBar({ tabs, active, onChange }: { tabs: { id: string; label: string; icon?: LucideIcon }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-bg-secondary rounded-xl border border-border-subtle mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all
            ${active === tab.id ? "bg-accent text-white" : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"}`}
        >
          {tab.icon && <tab.icon size={13} />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ConfirmModal({ open, title, message, onConfirm, onCancel, variant = "danger" }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void; variant?: "danger" | "warning";
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-bg-card border border-border-subtle rounded-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-muted mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <Btn variant="default" onClick={onCancel}>Annuler</Btn>
          <Btn variant={variant} onClick={onConfirm}>Confirmer</Btn>
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader size={24} className="animate-spin text-accent" />
    </div>
  );
}

export function PageWrapper({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`p-6 max-w-[1400px] mx-auto ${className}`}>
      {children}
    </div>
  );
}
