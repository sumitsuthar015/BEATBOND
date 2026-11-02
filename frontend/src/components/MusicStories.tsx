import { useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Music2, Plus, Radio, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { axiosInstance } from "@/lib/axios";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Song } from "@/types";
import { Button } from "@/components/ui/button";
import { ReportContentButton } from "@/components/ReportContentButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mapSaavnSong, searchSaavnSongs } from "@/lib/saavn";
import { MusicStoryComposer } from "@/components/MusicStoryComposer";
import { StoryInteractions } from "@/components/StoryInteractions";

type Story = { _id: string; authorId: string; author?: { fullName: string; imageUrl: string } | null; song: Song; clipStartSeconds?: number; clipDurationSeconds?: number; createdAt?: string; expiresAt: string };
type StoryGroup = { authorId: string; author?: Story["author"]; stories: Story[] };

const MusicStories = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const currentSong = usePlayerStore((state) => state.currentSong);
  const playAlbum = usePlayerStore((state) => state.playAlbum);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeInteractionsStoryId, setActiveInteractionsStoryId] = useState<string | null>(null);
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [songQuery, setSongQuery] = useState("");
  const [songResults, setSongResults] = useState<Song[]>([]);
  const [searchingSongs, setSearchingSongs] = useState(false);
  const [composerSong, setComposerSong] = useState<Song | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const { data: stories = [], isLoading } = useQuery<Story[]>({ queryKey: ["musicStories"], queryFn: async () => (await axiosInstance.get("/posts/stories")).data, staleTime: 60_000 });
  const storyGroups = useMemo(() => {
    const groups = new Map<string, StoryGroup>();
    stories.forEach((story) => {
      const group = groups.get(story.authorId) || { authorId: story.authorId, author: story.author, stories: [] };
      group.stories.push(story);
      groups.set(story.authorId, group);
    });
    return [...groups.values()];
  }, [stories]);
  const selectedGroup = storyGroups.find((group) => group.authorId === selectedGroupId) || null;

  const openStoryGroup = (group: StoryGroup) => {
    setSelectedGroupId(group.authorId);
    const queue = [...group.stories].sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()).map((story) => ({
      ...story.song,
      storyPostId: story._id,
      storyClipStartSeconds: story.clipStartSeconds || 0,
      storyClipDurationSeconds: story.clipDurationSeconds || 15,
    }));
    if (queue.length) playAlbum(queue, 0);
  };
  const playSingleStory = (story: Story) => playAlbum([{
    ...story.song,
    storyPostId: story._id,
    storyClipStartSeconds: story.clipStartSeconds || 0,
    storyClipDurationSeconds: story.clipDurationSeconds || 15,
  }], 0);

  const chooseSongForStory = (song: Song) => {
    setComposerSong(song);
      setSongPickerOpen(false);
      window.requestAnimationFrame(() => setComposerOpen(true));
  };

  const searchSongs = async (event: React.FormEvent) => {
    event.preventDefault();
    if (songQuery.trim().length < 2) return;
    setSearchingSongs(true);
    try {
      const results = await searchSaavnSongs(songQuery.trim(), 12);
      setSongResults(results.map((item: any) => mapSaavnSong(item)).filter((song: Song | null): song is Song => Boolean(song)));
    } catch { toast.error("Song search is unavailable right now."); }
    finally { setSearchingSongs(false); }
  };

  const deleteStory = async (storyId: string) => {
    setDeletingStoryId(storyId);
    try {
      await axiosInstance.delete(`/posts/${storyId}`);
      await queryClient.invalidateQueries({ queryKey: ["musicStories"] });
      toast.success("Story deleted.");
    } catch (error: any) { toast.error(error.response?.data?.message || "Could not delete this story."); }
    finally { setDeletingStoryId(null); }
  };

  return <section className="mb-5 rounded-2xl border border-border bg-card/70 p-4 sm:mb-6" aria-label="Music stories">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-bold"><Radio className="size-4 text-primary" /> Music stories</h2><p className="mt-0.5 text-xs text-muted-foreground">Pick a 10–15 second section of the current song, another song, or use its three-dot menu.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!currentSong} onClick={() => currentSong && chooseSongForStory(currentSong)}><Plus className="mr-1.5 size-4" /> Share current song</Button><Button size="sm" onClick={() => setSongPickerOpen(true)}><Music2 className="mr-1.5 size-4" /> Choose a song</Button></div></div>
    <div className="flex gap-3 overflow-x-auto pb-1">
      {isLoading && <Loader2 className="m-4 size-5 animate-spin text-muted-foreground" />}
      {storyGroups.map((group) => {
        const latestStory = group.stories[0];
        const authorName = group.authorId === userId ? "You" : group.author?.fullName || "Friend";
        return <div key={group.authorId} className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
          <button type="button" onClick={() => openStoryGroup(group)} className="flex w-full flex-col items-center gap-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`Play ${group.stories.length} stories from ${authorName}`}>
            <span className="relative size-14 rounded-full bg-gradient-to-br from-primary via-fuchsia-500 to-amber-400 p-[2px]"><span className="block size-full overflow-hidden rounded-full border-2 border-background bg-secondary">{group.author?.imageUrl ? <img src={group.author.imageUrl} alt="" className="size-full object-cover" /> : <img src={latestStory.song?.imageUrl} alt="" className="size-full object-cover" />}</span>{group.stories.length > 1 && <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{group.stories.length}</span>}</span>
            <span className="w-full truncate text-[11px] font-medium">{authorName}</span><span className="w-full truncate text-[10px] text-muted-foreground">{group.stories.length} {group.stories.length === 1 ? "story" : "stories"}</span>
          </button>
        </div>;
      })}
      {!isLoading && stories.length === 0 && <p className="self-center text-xs text-muted-foreground">No shared songs yet. Start a story from the song you’re listening to.</p>}
    </div>
    <Dialog open={Boolean(selectedGroup)} onOpenChange={(open) => { if (!open) setSelectedGroupId(null); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{selectedGroup?.authorId === userId ? "Your stories" : `${selectedGroup?.author?.fullName || "Friend"}'s stories`}</DialogTitle><DialogDescription>All active song stories from this user.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          {selectedGroup?.stories.map((story) => <div key={story._id} className="rounded-xl border border-border p-3">
            <div className="flex items-center gap-3">
              <img src={story.song?.imageUrl} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{story.song?.title || "Shared song"}</p><p className="truncate text-xs text-muted-foreground">{story.song?.artist || "Unknown artist"} · {story.clipDurationSeconds || 15}s clip</p><p className="text-[11px] text-muted-foreground">Expires {new Date(story.expiresAt).toLocaleString()}</p></div>
              {selectedGroup?.authorId === userId ? <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${story.song?.title || "story"}`} disabled={deletingStoryId === story._id} onClick={() => void deleteStory(story._id)}>{deletingStoryId === story._id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4 text-destructive" />}</Button> : <ReportContentButton targetType="post" targetId={story._id} label={`Report ${selectedGroup?.author?.fullName || "friend"}'s story`} />}
              <Button type="button" size="sm" variant="outline" onClick={() => story.song && playSingleStory(story)}><Radio className="mr-1.5 size-4" />Play clip</Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Comments and reactions" aria-expanded={activeInteractionsStoryId === story._id} onClick={() => setActiveInteractionsStoryId((active) => active === story._id ? null : story._id)}><MessageCircle className="size-4" /></Button>
            </div>
            {activeInteractionsStoryId === story._id && <StoryInteractions storyId={story._id} storyAuthorId={story.authorId} />}
          </div>)}
          {selectedGroup?.stories.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No active stories.</p>}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={songPickerOpen} onOpenChange={setSongPickerOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Choose a song for your story</DialogTitle><DialogDescription>Search the music catalog and select a playable song to share for 24 hours.</DialogDescription></DialogHeader>
        <form onSubmit={(event) => void searchSongs(event)} className="flex gap-2">
          <label htmlFor="story-song-search" className="sr-only">Search songs</label>
          <Input id="story-song-search" value={songQuery} onChange={(event) => setSongQuery(event.target.value)} minLength={2} maxLength={100} placeholder="Search songs or artists" />
          <Button type="submit" size="icon" aria-label="Search songs" disabled={searchingSongs || songQuery.trim().length < 2}>{searchingSongs ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}</Button>
        </form>
        <div className="max-h-[45vh] space-y-1 overflow-y-auto">
          {songResults.map((song) => <div key={song._id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary/70"><img src={song.imageUrl} alt="" className="size-11 rounded-md object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{song.title}</p><p className="truncate text-xs text-muted-foreground">{song.artist}</p></div><Button size="sm" variant="outline" onClick={() => chooseSongForStory(song)}>Choose clip</Button></div>)}
          {!searchingSongs && songResults.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Search for a song to add it to your story.</p>}
        </div>
      </DialogContent>
    </Dialog>
    <MusicStoryComposer song={composerSong} open={composerOpen} onOpenChange={setComposerOpen} onCreated={() => void queryClient.invalidateQueries({ queryKey: ["musicStories"] })} />
  </section>;
};

export default MusicStories;
