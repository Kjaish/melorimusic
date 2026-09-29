# Music Portfolio Design Guidelines

## Design Approach
**Reference-Based**: Drawing from Spotify's immersive aesthetics, Bandcamp's artist-first layout, and Apple Music's elegant restraint. This portfolio prioritizes visual storytelling through album artwork and creates an engaging, music-discovery experience.

## Typography
- **Headings**: DM Sans (700) - Artist name, album titles, section headers
- **Body**: Inter (400/500) - Track listings, descriptions, metadata
- **Display**: Space Grotesk (600) - Hero statements, featured content
- Font sizes: text-5xl/6xl (hero), text-2xl/3xl (section headers), text-lg (body), text-sm (metadata)

## Layout System
**Spacing Units**: 4, 6, 8, 12, 16, 24 (Tailwind)
- Section padding: py-16 md:py-24
- Component gaps: gap-6 to gap-12
- Container: max-w-7xl mx-auto px-6

## Core Components

### Hero Section
- Full-width immersive design (h-screen or min-h-[80vh])
- Large hero image: Latest album artwork or artist performance shot with gradient overlay (dark to transparent)
- Centered content with artist name, tagline, primary CTA ("Listen Now", "Latest Release")
- Buttons over image have backdrop-blur-md with semi-transparent backgrounds

### Audio Player (Sticky/Floating)
- Fixed bottom player bar (h-20 to h-24)
- Controls: play/pause, skip, progress bar, volume, track info with album art thumbnail
- Glassmorphic treatment (backdrop-blur, semi-transparent background)

### Discography Grid
- 2-4 column grid (grid-cols-2 md:grid-cols-3 lg:grid-cols-4)
- Album cards: Square album art, title, year, format indicator
- Hover: Subtle lift (transform scale-105), play button overlay

### Track Listings
- Single column list with alternating background shades
- Each row: Track number, title, duration, play button
- Active track highlighted with accent treatment

### Video/Media Section
- 2-column grid for music videos/live performances
- 16:9 aspect ratio thumbnails with play overlay icons
- Title and view count metadata

### About/Bio Section
- 2-column layout: Artist photo (large, portrait) + bio text
- Press quotes or achievements highlighted in callout boxes
- Social media links grid

### Contact/Newsletter Section
- Centered form with email input + submit button
- Supporting text: Tour updates, new release notifications
- Social proof: "Join 10,000+ fans"

### Footer
- 3-4 column layout: Navigation links, social media, streaming platforms, copyright
- Streaming platform badges (Spotify, Apple Music, Bandcamp icons)

## Component Details
- **Cards**: Rounded corners (rounded-lg to rounded-xl), shadow-md on hover
- **Buttons**: Rounded-full for primary CTAs, rounded-lg for secondary
- **Form Inputs**: Rounded-lg borders, focus rings
- **Navigation**: Fixed header with logo, menu links, "Listen" CTA

## Images
**Required Images**:
1. **Hero**: Full-width artist/performance shot or latest album artwork (1920x1080+)
2. **Album Art**: Square images for each release (800x800)
3. **Artist Photo**: High-quality portrait for About section (800x1200)
4. **Video Thumbnails**: 16:9 for media section
5. **Background Textures**: Subtle noise/grain overlays for depth (optional tiling patterns)

**Hero Image**: Yes - Full-width immersive hero with gradient overlay

## Animations
- Minimal: Smooth audio waveform visualization in player
- Hover states: Gentle scale transforms on cards/buttons
- Page transitions: Fade-in on scroll for content sections (intersection observer)

## Key Principles
- **Music-First**: Album artwork drives visual hierarchy
- **Immersive**: Full-bleed imagery creates emotional connection
- **Accessible Player**: Always-available audio controls
- **Scannable**: Clear track/album organization for quick discovery
- **Performance**: Lazy-load images, optimize audio streaming