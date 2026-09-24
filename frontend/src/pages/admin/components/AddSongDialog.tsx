import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { axiosInstance } from "@/lib/axios";
import { useMusicStore } from "@/stores/useMusicStore";
import { useQueryClient } from "@tanstack/react-query";
import { FileAudio, ImagePlus, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { formatDuration } from "../format";

interface NewSong {
	title: string;
	artist: string;
	album: string;
	duration: string;
}

const emptySong: NewSong = { title: "", artist: "", album: "", duration: "0" };

/** Reads the track length from the file itself so the admin doesn't have to type it. */
const readAudioDuration = (file: File) =>
	new Promise<number>((resolve) => {
		const url = URL.createObjectURL(file);
		const audio = new Audio();
		const finish = (seconds: number) => {
			URL.revokeObjectURL(url);
			resolve(seconds);
		};
		audio.preload = "metadata";
		audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0);
		audio.onerror = () => finish(0);
		audio.src = url;
	});

const titleFromFileName = (name: string) =>
	name
		.replace(/\.[^.]+$/, "")
		.replace(/[_-]+/g, " ")
		.trim();

const AddSongDialog = () => {
	const { albums, fetchSongs, fetchAlbums } = useMusicStore();
	const queryClient = useQueryClient();
	const [songDialogOpen, setSongDialogOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [newSong, setNewSong] = useState<NewSong>(emptySong);
	const [files, setFiles] = useState<{ audio: File | null; image: File | null }>({ audio: null, image: null });

	const audioInputRef = useRef<HTMLInputElement>(null);
	const imageInputRef = useRef<HTMLInputElement>(null);

	const imagePreview = useMemo(() => (files.image ? URL.createObjectURL(files.image) : null), [files.image]);
	useEffect(() => () => {
		if (imagePreview) URL.revokeObjectURL(imagePreview);
	}, [imagePreview]);

	// Built-in sample albums aren't stored in the database, so songs can't be attached to them.
	const realAlbums = albums.filter((album) => !album._id.startsWith("fallback-"));
	const canSubmit = Boolean(files.audio && files.image && newSong.title.trim() && newSong.artist.trim());

	const handleAudioSelect = async (file: File | undefined) => {
		if (!file) return;
		setFiles((prev) => ({ ...prev, audio: file }));
		const seconds = await readAudioDuration(file);
		setNewSong((prev) => ({
			...prev,
			title: prev.title || titleFromFileName(file.name),
			duration: seconds ? String(seconds) : prev.duration,
		}));
	};

	const reset = () => {
		setNewSong(emptySong);
		setFiles({ audio: null, image: null });
	};

	const handleSubmit = async () => {
		if (!files.audio || !files.image) {
			toast.error("Please upload both audio and image files");
			return;
		}

		setIsLoading(true);
		try {
			const formData = new FormData();
			formData.append("title", newSong.title.trim());
			formData.append("artist", newSong.artist.trim());
			formData.append("duration", newSong.duration);
			if (newSong.album && newSong.album !== "none") {
				formData.append("albumId", newSong.album);
			}
			formData.append("audioFile", files.audio);
			formData.append("imageFile", files.image);

			await axiosInstance.post("/admin/songs", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});

			reset();
			setSongDialogOpen(false);
			toast.success("Song added successfully");
			fetchSongs();
			fetchAlbums();
			queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
		} catch (error: any) {
			toast.error("Failed to add song: " + (error.response?.data?.message || error.message));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={songDialogOpen} onOpenChange={(open) => !isLoading && setSongDialogOpen(open)}>
			<DialogTrigger asChild>
				<Button className='shrink-0 bg-emerald-600 text-white hover:bg-emerald-700'>
					<Plus className='size-4' />
					Add song
				</Button>
			</DialogTrigger>

			<DialogContent className='max-h-[85vh] overflow-auto'>
				<DialogHeader>
					<DialogTitle>Add new song</DialogTitle>
					<DialogDescription>Upload a track to the BeatBond catalogue</DialogDescription>
				</DialogHeader>

				<div className='space-y-4 py-2'>
					<input
						type='file'
						accept='audio/*'
						ref={audioInputRef}
						hidden
						onChange={(e) => handleAudioSelect(e.target.files?.[0])}
					/>
					<input
						type='file'
						accept='image/*'
						ref={imageInputRef}
						hidden
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) setFiles((prev) => ({ ...prev, image: file }));
						}}
					/>

					<div className='grid grid-cols-[112px_1fr] gap-4'>
						<button
							type='button'
							onClick={() => imageInputRef.current?.click()}
							className='group relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors hover:border-emerald-500'
							aria-label={files.image ? "Change artwork" : "Upload artwork"}
						>
							{imagePreview ? (
								<img src={imagePreview} alt='' className='size-full object-cover' />
							) : (
								<span className='flex flex-col items-center gap-1 text-xs text-muted-foreground'>
									<ImagePlus className='size-6' />
									Artwork
								</span>
							)}
						</button>

						<div className='space-y-2'>
							<Label>Audio file</Label>
							<Button
								type='button'
								variant='outline'
								onClick={() => audioInputRef.current?.click()}
								className='w-full justify-start overflow-hidden'
							>
								<FileAudio className='size-4 shrink-0' />
								<span className='truncate'>{files.audio ? files.audio.name : "Choose audio file"}</span>
							</Button>
							<p className='text-xs text-muted-foreground'>
								{files.audio && Number(newSong.duration) > 0
									? `Length detected: ${formatDuration(Number(newSong.duration))}`
									: "MP3, M4A or WAV. Length is detected automatically."}
							</p>
						</div>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='song-title'>Title</Label>
						<Input
							id='song-title'
							value={newSong.title}
							onChange={(e) => setNewSong({ ...newSong, title: e.target.value })}
						/>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='song-artist'>Artist</Label>
						<Input
							id='song-artist'
							value={newSong.artist}
							onChange={(e) => setNewSong({ ...newSong, artist: e.target.value })}
						/>
					</div>

					<div className='grid grid-cols-2 gap-4'>
						<div className='space-y-2'>
							<Label htmlFor='song-duration'>Duration (seconds)</Label>
							<Input
								id='song-duration'
								type='number'
								min='0'
								value={newSong.duration}
								onChange={(e) => setNewSong({ ...newSong, duration: e.target.value || "0" })}
							/>
						</div>
						<div className='space-y-2'>
							<Label>Album (optional)</Label>
							<Select value={newSong.album} onValueChange={(value) => setNewSong({ ...newSong, album: value })}>
								<SelectTrigger>
									<SelectValue placeholder='Select album' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='none'>No album (single)</SelectItem>
									{realAlbums.map((album) => (
										<SelectItem key={album._id} value={album._id}>
											{album.title}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant='outline' onClick={() => setSongDialogOpen(false)} disabled={isLoading}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isLoading || !canSubmit}
						className='bg-emerald-600 text-white hover:bg-emerald-700'
					>
						{isLoading && <Loader2 className='size-4 animate-spin' />}
						{isLoading ? "Uploading..." : "Add song"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default AddSongDialog;
