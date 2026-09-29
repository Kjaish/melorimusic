import { type User, type InsertUser, type Artist, type Album, type Track, type Video } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getArtist(): Promise<Artist>;
  getAlbums(): Promise<Album[]>;
  getTracksByAlbum(albumId: string): Promise<Track[]>;
  getVideos(): Promise<Video[]>;
  addNewsletterSubscription(email: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private artist: Artist;
  private albums: Album[];
  private tracks: Track[];
  private videos: Video[];
  private newsletterEmails: Set<string>;

  constructor() {
    this.users = new Map();
    this.newsletterEmails = new Set();

    this.artist = {
      id: "artist-1",
      name: "Aurora Skye",
      tagline: "Ethereal soundscapes for the modern soul",
      bio: `Aurora Skye is an electronic music producer and composer known for creating immersive, atmospheric soundscapes that blur the line between ambient and dance music.

Born in the Pacific Northwest, Aurora's music draws from the natural beauty of misty forests, ocean tides, and starlit skies. Her productions combine organic textures with synthetic elements, creating a unique sonic signature that has captivated audiences worldwide.

With three studio albums and numerous EPs, Aurora has established herself as a pioneering force in the electronic music scene. Her live performances are known for their visual artistry and emotional depth, taking audiences on transformative journeys through sound and light.`,
      heroImageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920&h=1080&fit=crop",
      photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&h=1200&fit=crop",
      socialLinks: {
        spotify: "https://spotify.com",
        appleMusic: "https://music.apple.com",
        bandcamp: "https://bandcamp.com",
        instagram: "https://instagram.com",
        youtube: "https://youtube.com",
      },
    };

    this.albums = [
      {
        id: "album-1",
        title: "Celestial Dreams",
        year: 2024,
        coverUrl: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=800&h=800&fit=crop",
        format: "album",
        description: "A journey through cosmic soundscapes and ethereal melodies, exploring the vastness of the universe and our place within it.",
      },
      {
        id: "album-2",
        title: "Midnight Echoes",
        year: 2023,
        coverUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&h=800&fit=crop",
        format: "album",
        description: "Nocturnal rhythms and haunting harmonies that dance between light and shadow.",
      },
      {
        id: "album-3",
        title: "Ocean Tides",
        year: 2022,
        coverUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&h=800&fit=crop",
        format: "ep",
        description: "A sonic exploration of the sea's endless movement.",
      },
      {
        id: "album-4",
        title: "Northern Lights",
        year: 2021,
        coverUrl: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=800&h=800&fit=crop",
        format: "album",
        description: "Ambient textures inspired by the aurora borealis.",
      },
      {
        id: "album-5",
        title: "First Light",
        year: 2020,
        coverUrl: "https://images.unsplash.com/photo-1464802686167-b939a6910659?w=800&h=800&fit=crop",
        format: "single",
        description: "The debut single that started the journey.",
      },
      {
        id: "album-6",
        title: "Dreamscape",
        year: 2020,
        coverUrl: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=800&h=800&fit=crop",
        format: "ep",
        description: "Exploration of the subconscious mind.",
      },
      {
        id: "album-7",
        title: "Reverie",
        year: 2023,
        coverUrl: "https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=800&h=800&fit=crop",
        format: "single",
        description: "A dreamy collaboration with ambient artist Moss.",
      },
      {
        id: "album-8",
        title: "Solstice",
        year: 2024,
        coverUrl: "https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&h=800&fit=crop",
        format: "ep",
        description: "Celebrating the longest day with uplifting electronic soundscapes.",
      },
    ];

    this.tracks = [
      { id: "track-1", albumId: "album-1", title: "Stellar Gateway", duration: 312, trackNumber: 1 },
      { id: "track-2", albumId: "album-1", title: "Nebula Rising", duration: 287, trackNumber: 2 },
      { id: "track-3", albumId: "album-1", title: "Cosmic Drift", duration: 425, trackNumber: 3 },
      { id: "track-4", albumId: "album-1", title: "Astral Projection", duration: 356, trackNumber: 4 },
      { id: "track-5", albumId: "album-1", title: "Supernova", duration: 298, trackNumber: 5 },
      { id: "track-6", albumId: "album-1", title: "Interstellar", duration: 384, trackNumber: 6 },
      { id: "track-7", albumId: "album-1", title: "Event Horizon", duration: 445, trackNumber: 7 },
      { id: "track-8", albumId: "album-1", title: "Celestial Dreams", duration: 512, trackNumber: 8 },

      { id: "track-9", albumId: "album-2", title: "Midnight Hour", duration: 278, trackNumber: 1 },
      { id: "track-10", albumId: "album-2", title: "Shadow Dance", duration: 342, trackNumber: 2 },
      { id: "track-11", albumId: "album-2", title: "Echo Chamber", duration: 298, trackNumber: 3 },
      { id: "track-12", albumId: "album-2", title: "Night Vision", duration: 367, trackNumber: 4 },
      { id: "track-13", albumId: "album-2", title: "Moonlit Path", duration: 412, trackNumber: 5 },
      { id: "track-14", albumId: "album-2", title: "Dark Matter", duration: 389, trackNumber: 6 },

      { id: "track-15", albumId: "album-3", title: "Tidal Wave", duration: 324, trackNumber: 1 },
      { id: "track-16", albumId: "album-3", title: "Deep Blue", duration: 287, trackNumber: 2 },
      { id: "track-17", albumId: "album-3", title: "Coral Reef", duration: 356, trackNumber: 3 },
      { id: "track-18", albumId: "album-3", title: "Ocean Floor", duration: 445, trackNumber: 4 },

      { id: "track-19", albumId: "album-4", title: "Aurora", duration: 567, trackNumber: 1 },
      { id: "track-20", albumId: "album-4", title: "Polar Night", duration: 423, trackNumber: 2 },
      { id: "track-21", albumId: "album-4", title: "Ice Crystal", duration: 298, trackNumber: 3 },
      { id: "track-22", albumId: "album-4", title: "Frozen Light", duration: 387, trackNumber: 4 },
      { id: "track-23", albumId: "album-4", title: "Northern Skies", duration: 512, trackNumber: 5 },

      { id: "track-24", albumId: "album-5", title: "First Light", duration: 356, trackNumber: 1 },

      { id: "track-25", albumId: "album-6", title: "Lucid", duration: 312, trackNumber: 1 },
      { id: "track-26", albumId: "album-6", title: "Dream State", duration: 278, trackNumber: 2 },
      { id: "track-27", albumId: "album-6", title: "REM", duration: 423, trackNumber: 3 },

      { id: "track-28", albumId: "album-7", title: "Reverie", duration: 398, trackNumber: 1 },

      { id: "track-29", albumId: "album-8", title: "Summer Peak", duration: 287, trackNumber: 1 },
      { id: "track-30", albumId: "album-8", title: "Golden Hour", duration: 342, trackNumber: 2 },
      { id: "track-31", albumId: "album-8", title: "Eternal Day", duration: 398, trackNumber: 3 },
      { id: "track-32", albumId: "album-8", title: "Solstice", duration: 456, trackNumber: 4 },
    ];

    this.videos = [
      {
        id: "video-1",
        title: "Stellar Gateway - Official Music Video",
        thumbnailUrl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1280&h=720&fit=crop",
        videoUrl: "https://youtube.com/watch?v=example1",
        views: 2450000,
        type: "music_video",
      },
      {
        id: "video-2",
        title: "Live at Red Rocks Amphitheatre",
        thumbnailUrl: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1280&h=720&fit=crop",
        videoUrl: "https://youtube.com/watch?v=example2",
        views: 890000,
        type: "live_performance",
      },
      {
        id: "video-3",
        title: "Making of Celestial Dreams",
        thumbnailUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1280&h=720&fit=crop",
        videoUrl: "https://youtube.com/watch?v=example3",
        views: 156000,
        type: "behind_the_scenes",
      },
      {
        id: "video-4",
        title: "Nebula Rising - Visualizer",
        thumbnailUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1280&h=720&fit=crop",
        videoUrl: "https://youtube.com/watch?v=example4",
        views: 1200000,
        type: "music_video",
      },
    ];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getArtist(): Promise<Artist> {
    return this.artist;
  }

  async getAlbums(): Promise<Album[]> {
    return this.albums.sort((a, b) => b.year - a.year);
  }

  async getTracksByAlbum(albumId: string): Promise<Track[]> {
    return this.tracks
      .filter((track) => track.albumId === albumId)
      .sort((a, b) => a.trackNumber - b.trackNumber);
  }

  async getVideos(): Promise<Video[]> {
    return this.videos;
  }

  async addNewsletterSubscription(email: string): Promise<boolean> {
    if (this.newsletterEmails.has(email)) {
      return false;
    }
    this.newsletterEmails.add(email);
    return true;
  }
}

export const storage = new MemStorage();
