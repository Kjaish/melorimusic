import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/navigation";
import { HeroSection } from "@/components/hero-section";
import { MissionSection } from "@/components/mission-section";
import { DiscographySection } from "@/components/discography-section";
import { TrackList } from "@/components/track-list";
import { VideosSection } from "@/components/videos-section";
import { AboutSection } from "@/components/about-section";
import { ContactSection } from "@/components/contact-section";
import { Footer } from "@/components/footer";
import { AudioPlayer } from "@/components/audio-player";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Artist, Album, Track, Video } from "@shared/schema";

export default function Home() {
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | undefined>();
  const [currentAlbumTracks, setCurrentAlbumTracks] = useState<Track[]>([]);
  const { toast } = useToast();

  const { data: artist, isLoading: artistLoading } = useQuery<Artist>({
    queryKey: ["/api/artist"],
  });

  const { data: albums, isLoading: albumsLoading } = useQuery<Album[]>({
    queryKey: ["/api/albums"],
  });

  const { data: tracks } = useQuery<Track[]>({
    queryKey: ["/api/tracks", selectedAlbum?.id],
    enabled: !!selectedAlbum,
  });

  const { data: videos } = useQuery<Video[]>({
    queryKey: ["/api/videos"],
  });

  useEffect(() => {
    if (albums && albums.length > 0 && !selectedAlbum) {
      setSelectedAlbum(albums[0]);
    }
  }, [albums, selectedAlbum]);

  useEffect(() => {
    if (tracks && tracks.length > 0) {
      setCurrentAlbumTracks(tracks);
      if (!currentTrack) {
        setCurrentTrack(tracks[0]);
      }
    }
  }, [tracks, currentTrack]);

  const handleAlbumClick = (album: Album) => {
    setSelectedAlbum(album);
    setCurrentTrack(undefined);
  };

  const handleTrackClick = (track: Track) => {
    setCurrentTrack(track);
  };

  const handlePlayClick = () => {
    if (currentAlbumTracks.length > 0) {
      setCurrentTrack(currentAlbumTracks[0]);
    }
  };

  const handleBuy = async (item: Album | Track, type: 'album' | 'song') => {
    try {
      // Basic price fallback logic if not in schema
      const amount = (item as any).price ? Math.round((item as any).price * 100) : (type === 'album' ? 1000 : 100);

      const res = await apiRequest("POST", "/api/checkout/session", {
        type,
        itemId: item.id,
        amount
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Purchase error:", error);

      let message = error.message;
      if (message.includes("401")) {
        message = "Please log in to make a purchase.";
      }

      toast({
        title: "Checkout Failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  if (artistLoading || albumsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="h-screen flex items-center justify-center">
          <div className="space-y-4 w-full max-w-md px-6">
            <Skeleton className="h-12 w-3/4 mx-auto" />
            <Skeleton className="h-6 w-1/2 mx-auto" />
            <Skeleton className="h-10 w-40 mx-auto rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load artist information</p>
      </div>
    );
  }

  const latestAlbum = albums?.[0];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <HeroSection
        artist={artist}
        latestAlbum={latestAlbum}
        onPlayClick={handlePlayClick}
      />

      <MissionSection />

      {albums && albums.length > 0 && (
        <DiscographySection
          albums={albums}
          onAlbumClick={handleAlbumClick}
          onBuy={(album) => handleBuy(album, 'album')}
        />
      )}

      {selectedAlbum && currentAlbumTracks.length > 0 && (
        <TrackList
          album={selectedAlbum}
          tracks={currentAlbumTracks}
          currentTrack={currentTrack}
          isPlaying={!!currentTrack}
          onTrackClick={handleTrackClick}
          onBuy={(track) => handleBuy(track, 'song')}
        />
      )}

      {videos && videos.length > 0 && (
        <VideosSection videos={videos} />
      )}

      <AboutSection artist={artist} />

      <ContactSection />

      <Footer artist={artist} />

      <AudioPlayer
        currentTrack={currentTrack}
        album={selectedAlbum || undefined}
        tracks={currentAlbumTracks}
        onTrackChange={setCurrentTrack}
      />
    </div>
  );
}
