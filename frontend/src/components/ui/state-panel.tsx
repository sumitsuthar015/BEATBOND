import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatePanelProps = {
  state: "loading" | "empty" | "error";
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export const StatePanel = ({ state, title, description, actionLabel, onAction, className }: StatePanelProps) => {
  const titleId = useId();
  const Icon = state === "loading" ? LoaderCircle : state === "error" ? AlertCircle : Inbox;
  const role = state === "error" ? "alert" : "status";

  return (
    <section
      className={cn("flex min-w-0 flex-col items-center justify-center gap-3 rounded-2xl border border-border/70 bg-card/60 px-5 py-10 text-center", className)}
      role={role}
      aria-labelledby={titleId}
      aria-busy={state === "loading" ? true : undefined}
      aria-live={state === "loading" ? "polite" : undefined}
    >
      <Icon className={cn("size-7 text-muted-foreground", state === "loading" && "animate-spin")} aria-hidden="true" />
      <h2 id={titleId} className="text-base font-semibold">{title}</h2>
      {description && <p className="max-w-xl text-sm text-muted-foreground">{description}</p>}
      {actionLabel && onAction && <Button type="button" variant="outline" onClick={onAction}>{actionLabel}</Button>}
    </section>
  );
};

