# MELORI MUSIC

A stunning music portfolio e-commerce platform for artists to showcase and sell their work, featuring a modern, immersive design inspired by Spotify, Bandcamp, and Apple Music.

## Overview

This is a fullstack music portfolio application built with Express, EJS templates, and TypeScript with PostgreSQL database. It provides a beautiful, responsive interface for musicians to sell albums and singles directly to fans with Stripe payment processing.

## Visitor-Only Model (Updated 2024-12-30)

The platform is a visitor-only marketplace where users can listen, purchase, review, and comment on music:
- **Visitor Role**: All registrations create visitor accounts (no plan selection or upgrades)
- **No Uploading**: Visitors cannot upload music - this is a consumer-facing platform
- **Simplified Registration**: Only email, username, and password required
- **No Pricing Page**: /pricing redirects to /register
- **Post-Registration Redirect**: Visitors are redirected to /music page after registration

## Multi-Tenant Architecture (Added 2024-12-24)

The platform supports multi-tenant storefronts with the following features:
- **Multiple Storefronts**: Artists can have their own branded storefronts
- **Team Management**: Labels can invite team members with different roles
- **Commission Tracking**: Automatic commission calculation and payout management
- **Stripe Connect**: Integrated payouts to connected accounts

## Features

- **Hero Section**: Clean hero with Melori branding and platform tagline (home page)
- **Music Catalog**: Album grid and singles grid on dedicated /music page
- **Track Listings**: Interactive track list with play/pause functionality
- **Audio Player**: Sticky bottom player with playback controls, progress bar, and volume
- **Speed Networking**: Clubhouse-style networking with rooms, speakers, listeners, and chat
- **About Section**: Artist biography with social links
- **Newsletter**: Email subscription form for fan updates
- **Dark Theme**: Orange (#ff5500) primary color with dark background
- **Responsive Design**: Mobile-first with 44px+ touch targets
- **Automatic Audio Analysis**: Tempo and duration detection on upload using librosa

## Object Storage (Added 2024-12-30)

Audio files are now stored in Replit Object Storage for persistence across deployments:
- **New uploads**: Stored at `/objects/music/{uuid}.{ext}`
- **Legacy files**: Still served from `/uploads/music_files/` (for backward compatibility)
- **Audio analysis**: Downloads Object Storage files to temp for analysis, then cleans up
- **File paths**: Database stores either `/objects/music/...` (new) or `filename.ext` (legacy)
- The system auto-detects path format when serving/downloading files

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Shadcn/ui, Wouter
- **Backend**: Express, Node.js
- **State Management**: TanStack Query (React Query)
- **Styling**: Tailwind CSS with custom design tokens

## Database Schema

### PostgreSQL Tables (Multi-Tenant)

| Table | Description |
|-------|-------------|
| `plans` | Subscription tiers (visitor, creator) with pricing and features |
| `users_mt` | Extended users with role, plan, Stripe IDs |
| `addresses` | User addresses (billing, shipping, business) |
| `storefronts` | Artist/label storefronts with branding |
| `storefront_members` | Team members with roles (owner, manager, analyst) |
| `albums_mt` | Albums with storefront association |
| `songs_mt` | Songs/singles with storefront association |
| `sales_mt` | Sales records with storefront tracking |
| `transactions` | Commission and payout tracking |
| `traffic_mt` | Page view analytics per storefront |
| `searches_mt` | Search analytics per storefront |

### Running Migrations

```bash
node server/migrate.js
```

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/         # Shadcn components
│   │   │   ├── navigation.tsx
│   │   │   ├── hero-section.tsx
│   │   │   ├── discography-section.tsx
│   │   │   ├── track-list.tsx
│   │   │   ├── audio-player.tsx
│   │   │   ├── videos-section.tsx
│   │   │   ├── about-section.tsx
│   │   │   ├── contact-section.tsx
│   │   │   ├── footer.tsx
│   │   │   └── theme-*.tsx
│   │   ├── pages/          # Page components
│   │   │   └── home.tsx
│   │   └── lib/            # Utilities
│   └── index.html
├── migrations/
│   └── 001_multi_tenant.sql  # Multi-tenant schema migration
├── server/
│   ├── routes.ts           # API endpoints
│   ├── pg-database.js      # PostgreSQL database layer
│   ├── migrate.js          # Migration runner
│   └── storage.ts          # In-memory data storage
├── shared/
│   └── schema.ts           # TypeScript types and schemas
└── design_guidelines.md    # Design system documentation
```

## API Endpoints

- `GET /api/artist` - Get artist information
- `GET /api/albums` - Get all albums
- `GET /api/tracks/:albumId` - Get tracks for a specific album
- `GET /api/videos` - Get all videos
- `POST /api/newsletter` - Subscribe to newsletter

## Design System

The app follows a carefully crafted design system with:

- **Typography**: DM Sans (headings), Inter (body), Space Grotesk (display)
- **Colors**: Purple primary accent with dark/light theme support
- **Components**: Rounded corners, subtle shadows, glassmorphic effects
- **Interactions**: Smooth hover states, gentle transforms

## Running the App

The app runs with `npm run dev` which starts both the Express backend and Vite dev server on port 5000.
