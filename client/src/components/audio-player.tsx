import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { Track, Album } from "@shared/schema";

interface AudioPlayerProps {
  currentTrack?: Track;
  album?: Album;
  tracks: Track[];
  onTrackChange?: (track: Track) => void;
}

export function AudioPlayer({
  currentTrack,
  album,
  tracks,
  onTrackChange,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const progressInterval = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying) {
      progressInterval.current = window.setInterval(() => {
        setCurrentTime((prev) => {
          if (currentTrack && prev >= currentTrack.duration) {
            handleNext();
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(true);
  }, [currentTrack?.id]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrevious = () => {
    if (!currentTrack || tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const prevIndex = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
    onTrackChange?.(tracks[prevIndex]);
  };

  const handleNext = () => {
    if (!currentTrack || tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrack.id);
    const nextIndex = currentIndex >= tracks.length - 1 ? 0 : currentIndex + 1;
    onTrackChange?.(tracks[nextIndex]);
  };

  const handleSeek = (value: number[]) => {
    setCurrentTime(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
    setIsMuted(value[0] === 0);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (!currentTrack) {
    return null;
  }

  const progress = currentTrack.duration > 0 ? (currentTime / currentTrack.duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border"
      data-testid="audio-player"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="h-20 sm:h-24 flex items-center gap-4">
          <div className="flex items-center gap-3 flex-shrink-0 w-48 sm:w-64" data-testid="player-track-info">
            {album && (
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg overflow-hidden flex-shrink-0">
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  className="w-full h-full object-cover"
                  data-testid="img-player-album"
                />
              </div>
            )}
            <div className="min-w-0">
              <p
                className="font-medium text-sm truncate"
                data-testid="text-player-track"
              >
                {currentTrack.title}
              </p>
              <p className="text-xs text-muted-foreground truncate" data-testid="text-player-album">
                {album?.title}
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center gap-2 max-w-2xl" data-testid="player-controls">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevious}
                data-testid="button-player-prev"
                aria-label="Previous track"
              >
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={handlePlayPause}
                data-testid="button-player-play"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5 ml-0.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNext}
                data-testid="button-player-next"
                aria-label="Next track"
              >
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>

            <div className="w-full flex items-center gap-2 px-2" data-testid="player-progress">
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right" data-testid="text-player-current-time">
                {formatTime(currentTime)}
              </span>
              <Slider
                value={[currentTime]}
                max={currentTrack.duration}
                step={1}
                onValueChange={handleSeek}
                className="flex-1"
                data-testid="slider-player-progress"
              />
              <span className="text-xs text-muted-foreground tabular-nums w-10" data-testid="text-player-duration">
                {formatTime(currentTrack.duration)}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 w-32" data-testid="player-volume">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              data-testid="button-player-mute"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={handleVolumeChange}
              className="flex-1"
              data-testid="slider-player-volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
