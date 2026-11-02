import { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { Flag, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { axiosInstance } from "@/lib/axios";

type Props = { targetType: "post" | "comment"; targetId: string; label?: string };
const REASONS = ["spam", "harassment", "hate", "nudity", "violence", "copyright", "other"] as const;

export const ReportContentButton = ({ targetType, targetId, label = "Report content" }: Props) => {
  const { isSignedIn } = useUser();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);

  if (!isSignedIn) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason || sending) return;
    setSending(true);
    try {
      await axiosInstance.post("/reports", { targetType, targetId, reason, details });
      toast.success("Report sent to the moderation team.");
      setOpen(false); setReason(""); setDetails("");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not send your report. Please try again.");
    } finally { setSending(false); }
  };

  return <>
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={() => setOpen(true)} className="size-7 text-muted-foreground hover:text-destructive"><Flag className="size-3.5" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Report content</DialogTitle><DialogDescription>Reports are reviewed by the BeatBond moderation team. Choose the closest reason.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label="Report reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
            <SelectContent>{REASONS.map((item) => <SelectItem key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={details} onChange={(event) => setDetails(event.target.value)} maxLength={500} placeholder="Add context (optional)" aria-label="Additional report details" />
          <DialogFooter><Button type="submit" disabled={!reason || sending}>{sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Send report</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
};
