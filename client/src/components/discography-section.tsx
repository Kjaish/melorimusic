import { Play, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Album } from "@shared/schema";

interface DiscographySectionProps {
  albums: Album[];
  onAlbumClick?: (album: Album) => void;
  onBuy?: (album: Album) => void;
}

export function DiscographySection({ albums, onAlbumClick, onBuy }: DiscographySectionProps) {
  const formatType = (format: string) => {
    switch (format) {
      case "album":
        return "Album";
      case "ep":
        return "EP";
      case "single":
        return "Single";
      default:
        return format;
    }
  };

  return (
    <section id="discography" className="py-16 md:py-24 bg-background" data-testid="section-discography">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4" data-testid="text-discography-title">
            Discography
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto" data-testid="text-discography-description">
            Explore the complete collection of releases, from debut album to latest singles.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" data-testid="albums-grid">
          {albums.map((album) => (
            <Card
              key={album.id}
              className="group cursor-pointer overflow-visible bg-card border-card-border hover-elevate active-elevate-2"
              onClick={() => onAlbumClick?.(album)}
              data-testid={`card-album-${album.id}`}
            >
              <div className="p-4">
                <div className="relative aspect-square rounded-lg overflow-hidden mb-4">
                  <img
                    src={album.coverUrl}
                    alt={album.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    data-testid={`img-album-cover-${album.id}`}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="rounded-full w-12 h-12"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlbumClick?.(album);
                      }}
                    >
                      <Play className="h-5 w-5 fill-current" />
                    </Button>
                    {onBuy && (
                      <Button
                        size="icon"
                        className="rounded-full w-12 h-12"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuy(album);
                        }}
                      >
                        <ShoppingCart className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs" data-testid={`badge-album-format-${album.id}`}>
                      {formatType(album.format)}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid={`text-album-year-${album.id}`}>{album.year}</span>
                  </div>
                  <h3
                    className="font-heading font-semibold text-lg line-clamp-1"
                    data-testid={`text-album-title-${album.id}`}
                  >
                    {album.title}
                  </h3>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
