import { Play, Pause, Clock, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Track, Album } from "@shared/schema";

interface TrackListProps {
  album: Album;
  tracks: Track[];
  currentTrack?: Track;
  isPlaying?: boolean;
  onTrackClick?: (track: Track) => void;
  onBuy?: (track: Track) => void;
}

export function TrackList({
  album,
  tracks,
  currentTrack,
  isPlaying,
  onTrackClick,
  onBuy,
}: TrackListProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <section className="py-16 md:py-24 bg-muted/30" data-testid="section-tracklist">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-start gap-8 mb-12">
          <div className="w-48 h-48 md:w-64 md:h-64 flex-shrink-0 rounded-xl overflow-hidden shadow-xl">
            <img
              src={album.coverUrl}
              alt={album.title}
              className="w-full h-full object-cover"
              data-testid="img-tracklist-album"
            />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2" data-testid="text-now-playing-label">
              Now Playing
            </p>
            <h2
              className="font-heading text-3xl md:text-4xl font-bold mb-2"
              data-testid="text-tracklist-album-title"
            >
              {album.title}
            </h2>
            <p className="text-muted-foreground mb-4" data-testid="text-album-meta">
              {album.year} • {tracks.length} tracks
            </p>
            {album.description && (
              <p className="text-muted-foreground text-sm leading-relaxed" data-testid="text-album-description">
                {album.description}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl overflow-hidden bg-card border border-card-border" data-testid="tracklist-container">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-3 border-b border-border text-sm text-muted-foreground">
            <span>#</span>
            <span>Title</span>
            <span>BPM</span>
            <Clock className="h-4 w-4" />
          </div>

          <div className="divide-y divide-border/50">
            {tracks.map((track) => {
              const isCurrentTrack = currentTrack?.id === track.id;
              return (
                <div
                  key={track.id}
                  className={`group grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-4 items-center cursor-pointer transition-colors hover-elevate ${isCurrentTrack ? "bg-primary/10" : ""
                    }`}
                  onClick={() => onTrackClick?.(track)}
                  data-testid={`row-track-${track.id}`}
                >
                  <div className="w-8 flex items-center justify-center">
                    <span
                      className={`text-sm tabular-nums ${isCurrentTrack ? "text-primary" : "text-muted-foreground"
                        } group-hover:hidden`}
                      data-testid={`text-track-number-${track.id}`}
                    >
                      {track.trackNumber}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hidden group-hover:flex h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTrackClick?.(track);
                      }}
                      data-testid={`button-play-track-${track.id}`}
                    >
                      {isCurrentTrack && isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 ml-0.5" />
                      )}
                    </Button>
                  </div>
                  <span
                    className={`font-medium truncate ${isCurrentTrack ? "text-primary" : ""
                      }`}
                    data-testid={`text-track-title-${track.id}`}
                  >
                    {track.title}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground tabular-nums" data-testid={`text-track-tempo-${track.id}`}>
                      {track.tempo ? `${Math.round(track.tempo)}` : "-"}
                    </span>
                    {onBuy && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuy(track);
                        }}
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground tabular-nums" data-testid={`text-track-duration-${track.id}`}>
                    {formatDuration(track.duration)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
