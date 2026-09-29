import { Play } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@shared/schema";

interface VideosSectionProps {
  videos: Video[];
}

export function VideosSection({ videos }: VideosSectionProps) {
  const formatViews = (views: number) => {
    if (views >= 1000000) {
      return `${(views / 1000000).toFixed(1)}M views`;
    } else if (views >= 1000) {
      return `${(views / 1000).toFixed(0)}K views`;
    }
    return `${views} views`;
  };

  const formatType = (type: string) => {
    switch (type) {
      case "music_video":
        return "Music Video";
      case "live_performance":
        return "Live";
      case "behind_the_scenes":
        return "Behind the Scenes";
      default:
        return type;
    }
  };

  if (videos.length === 0) return null;

  return (
    <section id="videos" className="py-16 md:py-24 bg-background" data-testid="section-videos">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4" data-testid="text-videos-title">
            Videos
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto" data-testid="text-videos-description">
            Watch music videos, live performances, and exclusive behind-the-scenes content.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="videos-grid">
          {videos.map((video) => (
            <Card
              key={video.id}
              className="group cursor-pointer overflow-visible bg-card border-card-border hover-elevate active-elevate-2"
              data-testid={`card-video-${video.id}`}
            >
              <div className="p-4">
                <div className="relative aspect-video rounded-lg overflow-hidden mb-4">
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    data-testid={`img-video-thumbnail-${video.id}`}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="h-8 w-8 text-black fill-current ml-1" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs" data-testid={`badge-video-type-${video.id}`}>
                      {formatType(video.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-testid={`text-video-views-${video.id}`}>
                      {formatViews(video.views)}
                    </span>
                  </div>
                  <h3
                    className="font-heading font-semibold text-lg"
                    data-testid={`text-video-title-${video.id}`}
                  >
                    {video.title}
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
