import { Music } from "lucide-react";
import { SiSpotify, SiApplemusic, SiBandcamp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import type { Artist } from "@shared/schema";

interface FooterProps {
  artist: Artist;
}

const streamingPlatforms = [
  { name: "Spotify", icon: SiSpotify, key: "spotify" },
  { name: "Apple Music", icon: SiApplemusic, key: "appleMusic" },
  { name: "Bandcamp", icon: SiBandcamp, key: "bandcamp" },
];

const footerLinks = [
  {
    title: "Music",
    links: [
      { label: "Discography", href: "#discography" },
      { label: "Videos", href: "#videos" },
      { label: "Latest Release", href: "#discography" },
    ],
  },
  {
    title: "About",
    links: [
      { label: "Biography", href: "#about" },
      { label: "Press Kit", href: "#" },
      { label: "Contact", href: "#contact" },
    ],
  },
  {
    title: "Connect",
    links: [
      { label: "Newsletter", href: "#contact" },
      { label: "Tour Dates", href: "#" },
      { label: "Merchandise", href: "#" },
    ],
  },
];

export function Footer({ artist }: FooterProps) {
  const scrollToSection = (href: string) => {
    if (href === "#") return;
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <footer className="bg-card border-t border-border py-12 md:py-16 pb-28 md:pb-32" data-testid="footer">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("#home");
              }}
              className="flex items-center gap-2 text-xl font-heading font-bold mb-4"
              data-testid="link-footer-logo"
            >
              <Music className="h-6 w-6 text-primary" />
              <span>{artist.name}</span>
            </a>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs" data-testid="text-footer-tagline">
              {artist.tagline}
            </p>
            <div className="flex items-center gap-2 flex-wrap" data-testid="footer-streaming-links">
              {streamingPlatforms.map((platform) => {
                const url = artist.socialLinks[platform.key as keyof typeof artist.socialLinks];
                if (!url) return null;
                const Icon = platform.icon;
                return (
                  <a
                    key={platform.key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`link-footer-${platform.key}`}
                  >
                    <Button variant="ghost" size="icon">
                      <Icon className="h-5 w-5" />
                    </Button>
                  </a>
                );
              })}
            </div>
          </div>

          {footerLinks.map((section) => (
            <div key={section.title} data-testid={`footer-section-${section.title.toLowerCase()}`}>
              <h4 className="font-heading font-semibold mb-4">{section.title}</h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      onClick={(e) => {
                        e.preventDefault();
                        scrollToSection(link.href);
                      }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      data-testid={`link-footer-${link.label.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4" data-testid="footer-bottom">
          <p className="text-sm text-muted-foreground" data-testid="text-copyright">
            &copy; {new Date().getFullYear()} {artist.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-privacy"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-terms"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
