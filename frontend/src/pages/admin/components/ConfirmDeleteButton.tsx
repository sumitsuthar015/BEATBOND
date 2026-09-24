import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

type ConfirmDeleteButtonProps = {
	/** Accessible name for the icon-only trigger, e.g. "Delete song Kesariya". */
	label: string;
	title: string;
	description: string;
	confirmText?: string;
	onConfirm: () => Promise<unknown>;
};

const ConfirmDeleteButton = ({ label, title, description, confirmText = "Delete", onConfirm }: ConfirmDeleteButtonProps) => {
	const [open, setOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleConfirm = async () => {
		setIsDeleting(true);
		try {
			await onConfirm();
			setOpen(false);
		} catch {
			// The caller shows the error toast; keep the dialog open so the admin can retry.
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<AlertDialog open={open} onOpenChange={(next) => !isDeleting && setOpen(next)}>
			<AlertDialogTrigger asChild>
				<Button
					variant='ghost'
					size='sm'
					aria-label={label}
					title={label}
					className='text-muted-foreground hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-400'
				>
					<Trash2 className='size-4' />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
					<Button onClick={handleConfirm} disabled={isDeleting} className='bg-red-600 text-white hover:bg-red-700'>
						{isDeleting && <Loader2 className='size-4 animate-spin' />}
						{isDeleting ? "Deleting..." : confirmText}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
};

export default ConfirmDeleteButton;
