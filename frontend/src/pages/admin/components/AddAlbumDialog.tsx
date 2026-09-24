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
import { axiosInstance } from "@/lib/axios";
import { useMusicStore } from "@/stores/useMusicStore";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

const currentYear = new Date().getFullYear();
const emptyAlbum = { title: "", artist: "", releaseYear: currentYear };

const AddAlbumDialog = () => {
	const fetchAlbums = useMusicStore((state) => state.fetchAlbums);
	const queryClient = useQueryClient();
	const [albumDialogOpen, setAlbumDialogOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [newAlbum, setNewAlbum] = useState(emptyAlbum);
	const [imageFile, setImageFile] = useState<File | null>(null);

	const imagePreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
	useEffect(() => () => {
		if (imagePreview) URL.revokeObjectURL(imagePreview);
	}, [imagePreview]);

	const yearIsValid = newAlbum.releaseYear >= 1900 && newAlbum.releaseYear <= currentYear;
	const canSubmit = Boolean(imageFile && newAlbum.title.trim() && newAlbum.artist.trim() && yearIsValid);

	const handleSubmit = async () => {
		if (!imageFile) {
			toast.error("Please upload an image");
			return;
		}

		setIsLoading(true);
		try {
			const formData = new FormData();
			formData.append("title", newAlbum.title.trim());
			formData.append("artist", newAlbum.artist.trim());
			formData.append("releaseYear", newAlbum.releaseYear.toString());
			formData.append("imageFile", imageFile);

			await axiosInstance.post("/admin/albums", formData, {
				headers: { "Content-Type": "multipart/form-data" },
			});

			setNewAlbum(emptyAlbum);
			setImageFile(null);
			setAlbumDialogOpen(false);
			toast.success("Album created successfully");
			fetchAlbums();
			queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
		} catch (error: any) {
			toast.error("Failed to create album: " + (error.response?.data?.message || error.message));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={albumDialogOpen} onOpenChange={(open) => !isLoading && setAlbumDialogOpen(open)}>
			<DialogTrigger asChild>
				<Button className='shrink-0 bg-emerald-600 text-white hover:bg-emerald-700'>
					<Plus className='size-4' />
					Add album
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add new album</DialogTitle>
					<DialogDescription>Create an album, then add songs to it from the Songs tab</DialogDescription>
				</DialogHeader>
				<div className='space-y-4 py-2'>
					<input
						type='file'
						ref={fileInputRef}
						onChange={(e) => {
							const file = e.target.files?.[0];
							if (file) setImageFile(file);
						}}
						accept='image/*'
						hidden
					/>
					<button
						type='button'
						onClick={() => fileInputRef.current?.click()}
						className='mx-auto flex size-40 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors hover:border-emerald-500'
						aria-label={imageFile ? "Change album artwork" : "Upload album artwork"}
					>
						{imagePreview ? (
							<img src={imagePreview} alt='' className='size-full object-cover' />
						) : (
							<span className='flex flex-col items-center gap-1 text-xs text-muted-foreground'>
								<ImagePlus className='size-6' />
								Upload artwork
							</span>
						)}
					</button>
					<div className='space-y-2'>
						<Label htmlFor='album-title'>Album title</Label>
						<Input
							id='album-title'
							value={newAlbum.title}
							onChange={(e) => setNewAlbum({ ...newAlbum, title: e.target.value })}
							placeholder='Enter album title'
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='album-artist'>Artist</Label>
						<Input
							id='album-artist'
							value={newAlbum.artist}
							onChange={(e) => setNewAlbum({ ...newAlbum, artist: e.target.value })}
							placeholder='Enter artist name'
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='album-year'>Release year</Label>
						<Input
							id='album-year'
							type='number'
							value={Number.isNaN(newAlbum.releaseYear) ? "" : newAlbum.releaseYear}
							onChange={(e) => setNewAlbum({ ...newAlbum, releaseYear: parseInt(e.target.value, 10) })}
							min={1900}
							max={currentYear}
						/>
						{!yearIsValid && <p className='text-xs text-red-600 dark:text-red-400'>Enter a year between 1900 and {currentYear}.</p>}
					</div>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={() => setAlbumDialogOpen(false)} disabled={isLoading}>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						className='bg-emerald-600 text-white hover:bg-emerald-700'
						disabled={isLoading || !canSubmit}
					>
						{isLoading && <Loader2 className='size-4 animate-spin' />}
						{isLoading ? "Creating..." : "Add album"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default AddAlbumDialog;
