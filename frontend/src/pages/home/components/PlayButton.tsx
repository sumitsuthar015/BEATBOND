import { usePlayerStore } from "@/stores/usePlayerStore";
import { Song } from "@/types";
import { Pause, Play } from "lucide-react";

type PlayButtonProps = {
  song: Song;
  size?: "small" | "medium" | "large";
};

const PlayButton = ({ song, size = "medium" }: PlayButtonProps) => {
  const { currentSong, isPlaying, setCurrentSong, togglePlay } = usePlayerStore();
  const isCurrentSong = currentSong?._id === song._id;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isCurrentSong) {
      togglePlay();
    } else {
      setCurrentSong(song);
    }
  };

  // Size configurations - optimized for mobile
  const sizeClasses = {
    small: {
      button: "w-7 h-7 sm:w-8 sm:h-8",
      icon: "w-3.5 h-3.5 sm:w-4 sm:h-4"
    },
    medium: {
      button: "w-9 h-9 sm:w-10 sm:h-10 lg:w-12 lg:h-12",
      icon: "w-4 h-4 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5"
    },
    large: {
      button: "w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14",
      icon: "w-5 h-5 sm:w-5.5 sm:h-5.5 lg:w-6 lg:h-6"
    }
  };

  const { button: buttonSize, icon: iconSize } = sizeClasses[size];
  const isVisible = isCurrentSong && isPlaying;

  return (
    <button
      onClick={handlePlay}
      className={`absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 ${buttonSize}
           bg-white text-white rounded-full flex items-center justify-center
           hover:bg-white/90 hover:scale-110 active:scale-95 
           transition-all shadow-lg
           ${
             isVisible
               ? "opacity-100 pointer-events-auto"
               : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto sm:pointer-events-auto"
           }`}
      aria-label={isCurrentSong && isPlaying ? "Pause" : "Play"}
    >
      {isCurrentSong && isPlaying ? (
        <Pause className={`${iconSize} text-black fill-black`} />
      ) : (
        <Play className={`${iconSize} text-black fill-black ml-0.5`} />
      )}
    </button>
  );
};

export default PlayButton;
