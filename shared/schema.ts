import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Artist schema
export const artistSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string(),
  bio: z.string(),
  photoUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  socialLinks: z.object({
    spotify: z.string().optional(),
    appleMusic: z.string().optional(),
    bandcamp: z.string().optional(),
    instagram: z.string().optional(),
    twitter: z.string().optional(),
    youtube: z.string().optional(),
  }),
});

export type Artist = z.infer<typeof artistSchema>;

// Album schema
export const albumSchema = z.object({
  id: z.string(),
  title: z.string(),
  year: z.number(),
  coverUrl: z.string(),
  format: z.enum(["album", "ep", "single"]),
  description: z.string().optional(),
});

export type Album = z.infer<typeof albumSchema>;

// Track schema
export const trackSchema = z.object({
  id: z.string(),
  albumId: z.string(),
  title: z.string(),
  duration: z.number(), // in seconds
  trackNumber: z.number(),
  audioUrl: z.string().optional(),
  tempo: z.number().optional(), // BPM (beats per minute)
});

export type Track = z.infer<typeof trackSchema>;

// Video schema
export const videoSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnailUrl: z.string(),
  videoUrl: z.string(),
  views: z.number(),
  type: z.enum(["music_video", "live_performance", "behind_the_scenes"]),
});

export type Video = z.infer<typeof videoSchema>;

// Newsletter subscription schema
export const newsletterSchema = z.object({
  email: z.string().email(),
});

export type NewsletterSubscription = z.infer<typeof newsletterSchema>;

// Stripe Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey(), // UUID
  userId: varchar("user_id").notNull(),
  orderType: varchar("order_type").notNull(), // 'donation' | 'song' | 'album'
  itemId: varchar("item_id"), // nullable for donation
  amountTotal: integer("amount_total").notNull(), // in cents
  currency: varchar("currency").default('usd').notNull(),
  status: varchar("status").notNull(), // 'pending', 'paid', 'failed'
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id").unique(),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  createdAt: integer("created_at").notNull(), // Timestamp
  updatedAt: integer("updated_at"),
});

export type Order = typeof orders.$inferSelect;

// Entitlements (What user owns)
export const entitlements = pgTable("entitlements", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  entitlementType: varchar("entitlement_type").notNull(), // 'song' | 'album'
  itemId: varchar("item_id").notNull(),
  orderId: varchar("order_id").notNull(),
  isActive: integer("is_active").default(1), // boolean 1/0
  createdAt: integer("created_at").notNull(),
});

export type Entitlement = typeof entitlements.$inferSelect;

// Download Tokens (Secure links)
export const downloadTokens = pgTable("download_tokens", {
  id: varchar("id").primaryKey(),
  token: varchar("token").unique().notNull(),
  userId: varchar("user_id").notNull(),
  entitlementType: varchar("entitlement_type").notNull(),
  itemId: varchar("item_id").notNull(),
  orderId: varchar("order_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type DownloadToken = typeof downloadTokens.$inferSelect;
