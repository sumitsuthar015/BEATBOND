import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Flag, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { translate } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/usePreferencesStore";
import { StatePanel } from "@/components/ui/state-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

type ManagedFlag = { name: string; enabled: boolean; rolloutPercent: number; source: "admin" | "environment"; updatedAt: string | null };

const FeatureFlagsTabContent = () => {
  const language = usePreferencesStore((state) => state.language);
  const queryClient = useQueryClient();
  const flagsQuery = useQuery<{ flags: ManagedFlag[] }>({
    queryKey: ["admin", "featureFlags"],
    queryFn: async () => (await axiosInstance.get("/admin/feature-flags")).data,
  });
  const updateFlag = useMutation({
    mutationFn: async ({ name, enabled }: { name: string; enabled: boolean }) =>
      (await axiosInstance.patch(`/admin/feature-flags/${encodeURIComponent(name)}`, { enabled })).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "featureFlags"] });
      await queryClient.invalidateQueries({ queryKey: ["featureFlags"] });
      toast.success(translate("Feature flag updated", language));
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || translate("Could not update feature flag", language)),
  });
  const resetOverride = useMutation({
    mutationFn: async (name: string) => (await axiosInstance.delete(`/admin/feature-flags/${encodeURIComponent(name)}`)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "featureFlags"] });
      await queryClient.invalidateQueries({ queryKey: ["featureFlags"] });
      toast.success(translate("Feature flag reset", language));
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || translate("Could not reset feature flag", language)),
  });

  if (flagsQuery.isPending) return <div className="grid gap-3" aria-label={translate("Loading feature flags", language)}><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>;
  if (flagsQuery.isError) return <StatePanel state="error" title={translate("Could not load feature flags", language)} description={translate("Check the connection and try again.", language)} actionLabel={translate("Try again", language)} onAction={() => void flagsQuery.refetch()} />;

  const flags = flagsQuery.data?.flags ?? [];
  if (flags.length === 0) return <StatePanel state="empty" title={translate("No feature flags configured", language)} description={translate("Add feature flags to FEATURE_FLAG_ROLLOUTS in the backend environment to manage them here.", language)} />;

  return (
    <section className="space-y-4" aria-label={translate("Feature flags", language)}>
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
        <p>{translate("An admin override applies to every signed-in user and takes effect immediately.", language)}</p>
      </div>
      <div className="grid gap-3">
        {flags.map((flag) => {
          const busy = updateFlag.isPending && updateFlag.variables?.name === flag.name;
          const resetting = resetOverride.isPending && resetOverride.variables === flag.name;
          const inputId = `feature-flag-${flag.name}`;
          return (
            <article key={flag.name} className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <Flag className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <h3 className="break-all font-semibold">{flag.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {flag.source === "admin"
                      ? translate("Admin override", language)
                      : `${translate("Environment rollout", language)} · ${flag.rolloutPercent}%`}
                  </p>
                </div>
              </div>
              <label htmlFor={inputId} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 focus-within:outline-none focus-within:ring-2 focus-within:ring-ring">
                <span className="text-sm font-medium">{translate(flag.enabled ? "Enabled" : "Disabled", language)}</span>
                <input
                  id={inputId}
                  type="checkbox"
                  role="switch"
                  className="size-5 accent-primary focus-visible:outline-none"
                  checked={flag.enabled}
                  disabled={busy}
                  onChange={(event) => updateFlag.mutate({ name: flag.name, enabled: event.currentTarget.checked })}
                  aria-label={`${translate("Enable", language)} ${flag.name}`}
                />
              </label>
              {flag.source === "admin" && <Button type="button" size="sm" variant="outline" disabled={resetting || busy} onClick={() => resetOverride.mutate(flag.name)} aria-label={`${translate("Reset to environment rollout", language)} ${flag.name}`}><RotateCcw className="size-4" aria-hidden="true" /><span className="hidden md:inline">{translate("Reset to environment rollout", language)}</span></Button>}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default FeatureFlagsTabContent;

