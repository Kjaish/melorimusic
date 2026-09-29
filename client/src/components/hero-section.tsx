import { Play, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Artist, Album } from "@shared/schema";

interface HeroSectionProps {
  artist: Artist;
  latestAlbum?: Album;
  onPlayClick?: () => void;
}

export function HeroSection({ artist, latestAlbum, onPlayClick }: HeroSectionProps) {
  const scrollToDiscography = () => {
    const element = document.querySelector("#discography");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      data-testid="section-hero"
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: artist.heroImageUrl
            ? `url(${artist.heroImageUrl})`
            : "linear-gradient(135deg, hsl(262 83% 20%) 0%, hsl(262 83% 10%) 100%)",
        }}
        data-testid="hero-background"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-background" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <h1
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight"
          data-testid="text-artist-name"
        >
          {artist.name}
        </h1>
        <p
          className="text-lg sm:text-xl md:text-2xl text-white/80 mb-8 font-body max-w-2xl mx-auto"
          data-testid="text-artist-tagline"
        >
          {artist.tagline}
        </p>

        {latestAlbum && (
          <div className="mb-8" data-testid="latest-release-info">
            <p className="text-white/60 text-sm uppercase tracking-wider mb-2">Latest Release</p>
            <p className="text-white text-xl font-heading font-semibold" data-testid="text-latest-album">
              {latestAlbum.title}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            className="rounded-full px-8 gap-2 bg-white/90 backdrop-blur-md text-black hover:bg-white border-white/50"
            onClick={onPlayClick}
            data-testid="button-hero-play"
          >
            <Play className="h-5 w-5 fill-current" />
            Listen Now
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full px-8 bg-black/30 backdrop-blur-md border-white/30 text-white hover:bg-black/50"
            onClick={scrollToDiscography}
            data-testid="button-hero-explore"
          >
            Explore Music
          </Button>
        </div>
      </div>

      <button
        onClick={scrollToDiscography}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/60 hover:text-white transition-colors animate-bounce"
        data-testid="button-scroll-down"
        aria-label="Scroll to discography"
      >
        <ChevronDown className="h-8 w-8" />
      </button>
    </section>
  );
}
