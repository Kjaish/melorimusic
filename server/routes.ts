import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { newsletterSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/artist", async (_req, res) => {
    try {
      const artist = await storage.getArtist();
      res.json(artist);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch artist" });
    }
  });

  app.get("/api/albums", async (_req, res) => {
    try {
      const albums = await storage.getAlbums();
      res.json(albums);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch albums" });
    }
  });

  app.get("/api/tracks/:albumId", async (req, res) => {
    try {
      const { albumId } = req.params;
      const tracks = await storage.getTracksByAlbum(albumId);
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  app.get("/api/videos", async (_req, res) => {
    try {
      const videos = await storage.getVideos();
      res.json(videos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch videos" });
    }
  });

  app.post("/api/newsletter", async (req, res) => {
    try {
      const result = newsletterSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const success = await storage.addNewsletterSubscription(result.data.email);
      if (success) {
        res.json({ message: "Successfully subscribed" });
      } else {
        res.status(409).json({ error: "Email already subscribed" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  return httpServer;
}
