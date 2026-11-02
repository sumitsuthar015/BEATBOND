import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Loader2, LogOut, MessageCircle, Send, Settings2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { axiosInstance } from "@/lib/axios";
import { createGroupSocket, type GroupSocket } from "@/lib/groupListeningSocket";

type Friend = { clerkId: string; fullName: string; imageUrl: string };
type Member = { userId: string; user?: Friend };
type Group = { id: string; name: string; description?: string; imageUrl?: string; ownerId: string; members: Member[]; lastMessage: string; lastMessageAt: string };
type GroupMessage = { _id: string; conversationId: string; senderId: string; content: string; createdAt: string; sender?: { fullName: string; imageUrl: string } | null };

const GroupChatsPage = ({ onBack, groupId }: { embedded?: boolean; groupId?: string; onBack?: () => void }) => {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<GroupSocket | null>(null);
  const activeRef = useRef("");
  const onBackRef = useRef(onBack);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState(groupId || "");
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupImageFile, setGroupImageFile] = useState<File | null>(null);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [newMemberId, setNewMemberId] = useState("");
  const [detailsDraft, setDetailsDraft] = useState({ name: "", description: "" });
  const [detailsImageFile, setDetailsImageFile] = useState<File | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const { data: groups = [], isLoading } = useQuery<Group[]>({ queryKey: ["groupChats"], queryFn: async () => (await axiosInstance.get("/group-chats")).data });
  const { data: friends = [] } = useQuery<Friend[]>({ queryKey: ["friends"], queryFn: async () => (await axiosInstance.get("/friends")).data, staleTime: 30_000 });
  const activeGroup = groups.find((group) => group.id === activeId);

  useEffect(() => { setActiveId(groupId || ""); }, [groupId]);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);

  const handleMessage = useCallback((message: GroupMessage) => {
    if (message.conversationId !== activeRef.current) return;
    setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]);
    void queryClient.invalidateQueries({ queryKey: ["groupChats"] });
  }, [queryClient]);

  useEffect(() => {
    let disposed = false;
    let socket: GroupSocket | null = null;
    void getToken().then((token) => {
      if (!token || disposed) { if (!disposed) setError("Sign in to use group chats."); return; }
      socket = createGroupSocket(getToken);
      socketRef.current = socket;
      socket.on("connect", () => { setConnected(true); if (activeRef.current) socket?.emit("chat:join", { groupId: activeRef.current }); });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", (reason: Error) => setError(reason.message));
      socket.on("chat:message", handleMessage);
      socket.on("chat:membership", (event: { groupId: string; userId: string }) => {
        void queryClient.invalidateQueries({ queryKey: ["groupChats"] });
        if (event.groupId === activeRef.current && event.userId === userId) {
          setActiveId(""); setMessages([]); onBackRef.current?.();
        }
      });
      socket.on("chat:typing", (event: { groupId: string; userId: string; isTyping: boolean }) => {
        if (event.groupId !== activeRef.current || event.userId === userId) return;
        setTypingUsers((current) => event.isTyping ? [...new Set([...current, event.userId])] : current.filter((id) => id !== event.userId));
      });
      socket.connect();
    }).catch(() => setError("Could not connect to group chat."));
    return () => { disposed = true; socket?.removeAllListeners(); socket?.disconnect(); socketRef.current = null; };
  }, [getToken, handleMessage, queryClient, userId]);

  useEffect(() => {
    activeRef.current = activeId;
    setTypingUsers([]);
    if (!activeId) { setMessages([]); return; }
    if (connected) socketRef.current?.emit("chat:join", { groupId: activeId }, (result: { error?: string }) => { if (result?.error) setError(result.error); });
    let cancelled = false;
    void axiosInstance.get(`/group-chats/${activeId}/messages`).then(({ data }) => { if (!cancelled) setMessages(data); }).catch(() => { if (!cancelled) setError("Could not load group messages."); });
    return () => { cancelled = true; };
  }, [activeId, connected]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, activeId]);

  const createGroup = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const { data } = await axiosInstance.post("/group-chats", { name: groupName, description: groupDescription, memberIds: selectedFriends });
      if (groupImageFile) await uploadGroupImage(data.id, groupImageFile);
      await queryClient.invalidateQueries({ queryKey: ["groupChats"] });
      setActiveId(data.id); setShowCreate(false); setGroupName(""); setGroupDescription(""); setGroupImageFile(null); setSelectedFriends([]);
    } catch (cause: any) { setError(cause.response?.data?.message || "Could not create group chat."); }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    const socket = socketRef.current;
    if (!content || !activeId || !connected || !socket || sending) return;
    setError(""); setSending(true);
    socket.timeout(10_000).emit("chat:send", { groupId: activeId, content }, (timeoutError: Error | null, result: { ok?: boolean; error?: string } | undefined) => {
      setSending(false);
      if (timeoutError || result?.error || !result?.ok) {
        setError(result?.error || "Message could not be sent. Please try again.");
        return;
      }
      setDraft((current) => current === content ? "" : current);
      socket.emit("chat:typing", { groupId: activeId, isTyping: false });
    });
  };

  const toggleFriend = (id: string) => setSelectedFriends((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const uploadGroupImage = async (id: string, file: File) => {
    if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Group photos must be 5 MB or smaller.");
    const form = new FormData();
    form.append("photo", file, file.name);
    await axiosInstance.post(`/group-chats/${id}/image`, form, { headers: { "Content-Type": "multipart/form-data" } });
  };
  const openGroupDetails = () => {
    if (!activeGroup) return;
    setDetailsDraft({ name: activeGroup.name, description: activeGroup.description || "" });
    setShowDetails((value) => !value);
  };
  const saveGroupDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeGroup) return;
    try {
      await axiosInstance.patch(`/group-chats/${activeGroup.id}`, { name: detailsDraft.name, description: detailsDraft.description });
      if (detailsImageFile) await uploadGroupImage(activeGroup.id, detailsImageFile);
      await queryClient.invalidateQueries({ queryKey: ["groupChats"] });
      setShowDetails(false); setDetailsImageFile(null); setError("");
    } catch (cause: any) { setError(cause.response?.data?.message || "Could not update group details."); }
  };
  const addMember = async () => {
    if (!activeGroup || !newMemberId) return;
    try {
      await axiosInstance.post(`/group-chats/${activeGroup.id}/members`, { userId: newMemberId });
      await queryClient.invalidateQueries({ queryKey: ["groupChats"] });
      setNewMemberId(""); setError("");
    } catch (cause: any) { setError(cause.response?.data?.message || "Could not add this friend."); }
  };
  const removeMember = async (memberId: string) => {
    if (!activeGroup) return;
    setRemovingMemberId(memberId); setError("");
    try {
      await axiosInstance.delete(`/group-chats/${activeGroup.id}/members/${encodeURIComponent(memberId)}`);
      await queryClient.invalidateQueries({ queryKey: ["groupChats"] });
    } catch (cause: any) { setError(cause.response?.data?.message || "Could not remove this member."); }
    finally { setRemovingMemberId(null); }
  };
  const leaveGroup = async () => {
    if (!activeGroup) return;
    setLeaving(true); setError("");
    try {
      await axiosInstance.delete(`/group-chats/${activeGroup.id}/members/me`);
      await queryClient.invalidateQueries({ queryKey: ["groupChats"] });
      setActiveId(""); setMessages([]); setShowDetails(false); onBackRef.current?.();
    } catch (cause: any) { setError(cause.response?.data?.message || "Could not leave this group."); }
    finally { setLeaving(false); }
  };

  return (
    <main className="flex h-full min-h-0 flex-col px-2 pb-2 pt-2 sm:px-3">
      <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col">
        <header className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">{onBack && <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onBack} aria-label="Back to messages"><ArrowLeft className="size-4" /></Button>}<div className="min-w-0">{!groupId && <p className="text-[11px] text-muted-foreground">Messages</p>}<h1 className="truncate text-lg font-semibold">{groupId ? activeGroup?.name || "Group chat" : "Group chats"}</h1></div></div>
          {!groupId && <Button size="sm" onClick={() => setShowCreate((value) => !value)}><Users className="mr-2 size-4" />New group</Button>}
        </header>
        {showCreate && <form onSubmit={(event) => void createGroup(event)} className="mb-4 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="group-chat-name">Group name</Label><Input id="group-chat-name" maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} required placeholder="Weekend playlist crew" /></div>
          <div className="space-y-2"><Label htmlFor="group-chat-image">Group photo (optional)</Label><Input id="group-chat-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setGroupImageFile(event.target.files?.[0] || null)} /><p className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · up to 5 MB</p></div>
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="group-chat-description">Description (optional)</Label><Input id="group-chat-description" maxLength={300} value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="What is this group about?" /></div>
          <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium">Add 2–20 friends</legend><div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">{friends.map((friend) => <label key={friend.clerkId} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={selectedFriends.includes(friend.clerkId)} onChange={() => toggleFriend(friend.clerkId)} />{friend.fullName}</label>)}</div></fieldset>
          <Button className="sm:col-span-2 sm:justify-self-start" type="submit" disabled={!groupName.trim() || selectedFriends.length < 2 || selectedFriends.length > 20}>Create chat</Button>
        </form>}
        {error && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className={`grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card ${groupId ? "md:grid-cols-1" : "md:grid-cols-[240px_1fr]"}`}>
          {!groupId && <aside className={`${activeId ? "hidden md:block" : "block"} overflow-y-auto border-r border-border`} aria-label="Your group chats"><div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">{connected ? "Connected" : "Connecting…"}</div>{isLoading ? <Loader2 className="mx-auto mt-8 size-5 animate-spin text-muted-foreground" /> : groups.map((group) => <button key={group.id} onClick={() => { setActiveId(group.id); setShowDetails(false); }} className={`w-full border-b border-border/70 p-4 text-left hover:bg-secondary/60 ${activeId === group.id ? "bg-secondary/70" : ""}`}><span className="flex items-center gap-3 font-semibold">{group.imageUrl ? <img src={group.imageUrl} alt="" className="size-9 rounded-full object-cover" /> : <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><Users className="size-4" /></span>}<span className="min-w-0 truncate">{group.name}</span></span><span className="mt-1 block truncate pl-12 text-xs text-muted-foreground">{group.lastMessage || `${group.members.length} members`}</span></button>)}</aside>}
          <section className={`${activeId ? "flex" : "hidden md:flex"} min-h-0 flex-col`} aria-label={activeGroup?.name || "Group messages"}>
            {activeGroup ? <>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2"><button type="button" onClick={() => setActiveId("")} className="mr-1 md:hidden" aria-label="Back to groups"><ArrowLeft className="size-4" /></button>{activeGroup.imageUrl ? <img src={activeGroup.imageUrl} alt="" className="size-9 rounded-full object-cover" /> : <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><MessageCircle className="size-4" /></span>}<div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{activeGroup.name}</h2><p className="truncate text-[11px] text-muted-foreground">{activeGroup.description || `${activeGroup.members.length} members`}</p></div><Button type="button" variant="ghost" size="icon" className="size-8" onClick={openGroupDetails} aria-label="Group options" title="Group options" aria-expanded={showDetails}><Settings2 className="size-4" /></Button></div>
              {showDetails && <div className="max-h-64 space-y-2 overflow-y-auto border-b border-border bg-secondary/20 p-3 text-sm">
                {activeGroup.ownerId === userId && <>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3"><div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">{activeGroup.imageUrl ? <img src={activeGroup.imageUrl} alt="Current group photo" className="size-full object-cover" /> : <ImagePlus className="size-5 text-muted-foreground" />}</div><div className="min-w-0 flex-1 space-y-1"><Label htmlFor="edit-group-image">Group photo</Label><Input id="edit-group-image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setDetailsImageFile(event.target.files?.[0] || null)} /><p className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · up to 5 MB</p></div></div>
                <form onSubmit={(event) => void saveGroupDetails(event)} className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><Label htmlFor="edit-group-name">Group name</Label><Input id="edit-group-name" value={detailsDraft.name} maxLength={80} onChange={(event) => setDetailsDraft((value) => ({ ...value, name: event.target.value }))} required /></div><div className="space-y-1"><Label htmlFor="edit-group-description">Description</Label><Input id="edit-group-description" value={detailsDraft.description} maxLength={300} onChange={(event) => setDetailsDraft((value) => ({ ...value, description: event.target.value }))} placeholder="Description (optional)" /></div><Button type="submit" size="sm" className="sm:col-span-2 sm:justify-self-start"><ImagePlus className="mr-1.5 size-4" />Save settings</Button></form>
                <div className="flex flex-wrap items-end gap-2"><div className="min-w-48 flex-1 space-y-1"><Label htmlFor="add-group-member">Add a friend</Label><select id="add-group-member" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={newMemberId} onChange={(event) => setNewMemberId(event.target.value)}><option value="">Choose a friend</option>{friends.filter((friend) => !activeGroup.members.some((member) => member.userId === friend.clerkId)).map((friend) => <option key={friend.clerkId} value={friend.clerkId}>{friend.fullName}</option>)}</select></div><Button type="button" size="sm" variant="outline" onClick={() => void addMember()} disabled={!newMemberId}><UserPlus className="mr-1.5 size-4" />Add member</Button><Button type="button" size="icon" variant="ghost" onClick={() => setShowDetails(false)} aria-label="Close group settings"><X className="size-4" /></Button></div>
                </>}
                <div><p className="mb-2 text-xs text-muted-foreground">Members ({activeGroup.members.length})</p><div className="space-y-1">{activeGroup.members.map((member) => <div key={member.userId} className="flex items-center gap-2 rounded-lg bg-background px-2 py-1.5 text-xs">{member.user?.imageUrl ? <img src={member.user.imageUrl} alt="" className="size-6 rounded-full object-cover" /> : <span className="grid size-6 place-items-center rounded-full bg-primary/10 font-semibold text-primary">{member.user?.fullName?.[0] || "?"}</span>}<span className="min-w-0 flex-1 truncate">{member.user?.fullName || "Member"}{member.userId === activeGroup.ownerId ? " · owner" : ""}{member.userId === userId ? " (you)" : ""}</span>{activeGroup.ownerId === userId && member.userId !== userId && <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" aria-label={`Remove ${member.user?.fullName || "member"}`} title="Remove member" disabled={removingMemberId === member.userId} onClick={() => void removeMember(member.userId)}>{removingMemberId === member.userId ? <Loader2 className="size-3 animate-spin" /> : <UserMinus className="size-3.5" />}</Button>}</div>)}</div></div>
                <div className="flex justify-end border-t border-border pt-2"><Button type="button" size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={leaving} onClick={() => void leaveGroup()}>{leaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LogOut className="mr-2 size-4" />}Leave group</Button></div>
              </div>}
              <div className="flex-1 space-y-2 overflow-y-auto p-3">{messages.map((message) => <article key={message._id} className={`w-fit max-w-[85%] rounded-xl px-3 py-2 ${message.senderId === userId ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}><p className="mb-1 text-[10px] font-semibold opacity-75">{message.senderId === userId ? "You" : message.sender?.fullName || friends.find((friend) => friend.clerkId === message.senderId)?.fullName || "Friend"}</p><div className="flex max-w-full items-end gap-2"><p className="min-w-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.content}</p><time className="shrink-0 whitespace-nowrap text-[9px] opacity-60">{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div></article>)}{typingUsers.length > 0 && <p className="text-[11px] text-muted-foreground">Someone is typing…</p>}<div ref={bottomRef} /></div>
              <form onSubmit={send} className="flex gap-2 border-t border-border p-2"><Input className="h-9 text-[13px]" aria-label="Write a group message" value={draft} onChange={(event) => { setDraft(event.target.value); socketRef.current?.emit("chat:typing", { groupId: activeId, isTyping: Boolean(event.target.value.trim()) }); }} maxLength={4000} placeholder="Write a message…" /><Button className="size-9" type="submit" size="icon" aria-label="Send group message" disabled={!draft.trim() || !connected || sending}><Send className="size-4" /></Button></form>
            </> : <div className="m-auto text-center text-sm text-muted-foreground"><Users className="mx-auto mb-3 size-8" />Choose a group or create one.</div>}
          </section>
        </div>
      </div>
    </main>
  );
};

export default GroupChatsPage;
