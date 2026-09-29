import { SiSpotify, SiApplemusic, SiInstagram, SiYoutube } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Artist } from "@shared/schema";

interface AboutSectionProps {
  artist: Artist;
}

const socialIcons = {
  spotify: SiSpotify,
  appleMusic: SiApplemusic,
  instagram: SiInstagram,
  youtube: SiYoutube,
};

export function AboutSection({ artist }: AboutSectionProps) {
  const socialLinks = Object.entries(artist.socialLinks).filter(
    ([, url]) => url && url.length > 0
  );

  return (
    <section id="about" className="py-16 md:py-24 bg-muted/30" data-testid="section-about">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1">
            <h2
              className="font-heading text-3xl md:text-4xl font-bold mb-6"
              data-testid="text-about-title"
            >
              About {artist.name}
            </h2>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              {artist.bio.split("\n\n").map((paragraph, index) => (
                <p key={index} data-testid={`text-about-paragraph-${index}`}>
                  {paragraph}
                </p>
              ))}
            </div>

            {socialLinks.length > 0 && (
              <div className="mt-8" data-testid="social-links-container">
                <h3 className="font-heading font-semibold text-lg mb-4">
                  Follow & Stream
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                  {socialLinks.map(([platform, url]) => {
                    const Icon = socialIcons[platform as keyof typeof socialIcons];
                    if (!Icon) return null;
                    return (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`link-social-${platform}`}
                      >
                        <Button variant="outline" size="icon" className="rounded-full">
                          <Icon className="h-5 w-5" />
                        </Button>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative" data-testid="artist-photo-container">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl">
                {artist.photoUrl ? (
                  <img
                    src={artist.photoUrl}
                    alt={artist.name}
                    className="w-full h-full object-cover"
                    data-testid="img-artist-photo"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                    <span className="text-6xl font-heading font-bold text-primary/50">
                      {artist.name.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <Card className="absolute -bottom-6 -left-6 p-4 bg-card/95 backdrop-blur-md border-card-border shadow-lg" data-testid="genre-card">
                <p className="text-sm text-muted-foreground mb-1">Genre</p>
                <p className="font-heading font-semibold" data-testid="text-genre">Electronic / Ambient</p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
