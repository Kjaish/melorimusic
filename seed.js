import database from './database.js';

async function seed() {
  console.log('🌱 Seeding database...');
  await database.initialize();
  
  console.log('Checking for existing albums...');
  const albums = await database.getAllAlbums();
  
  if (albums.length > 0) {
    console.log('Albums already exist. Skipping seed.');
    process.exit(0);
  }
  
  console.log('Creating sample albums...');
  
  const albumsData = [
    {
      title: "Midnight Dreams",
      description: "A collection of ambient electronic tracks perfect for late-night listening",
      price: 8.00,
      album_art: "default.jpg",
      release_date: "2024-01-15"
    },
    {
      title: "Urban Echoes",
      description: "Modern hip-hop beats with urban influences",
      price: 8.00,
      album_art: "default.jpg",
      release_date: "2024-02-20"
    },
    {
      title: "Acoustic Sessions",
      description: "Raw, unplugged recordings of folk and indie songs",
      price: 8.00,
      album_art: "default.jpg",
      release_date: "2024-03-10"
    }
  ];
  
  for (const albumData of albumsData) {
    const albumId = await database.createAlbum(albumData);
    
    const songCount = Math.floor(Math.random() * 3) + 3;
    const songs = Array.from({ length: songCount }, (_, i) => ({
      album_id: albumId,
      title: `Track ${i + 1}`,
      file_path: `song-${albumId}-${i + 1}.mp3`,
      price: 0.99,
      track_number: i + 1
    }));
    
    for (const songData of songs) {
      await database.createSong(songData);
    }
    
    console.log(`✅ Added album: ${albumData.title} with ${songs.length} songs`);
  }
  
  console.log('Creating sample sales...');
  
  const sales = [
    {
      album_id: 1,
      customer_email: "test1@example.com",
      customer_name: "Test Customer 1",
      amount: 8.00,
      type: "album"
    },
    {
      album_id: 2,
      customer_email: "test2@example.com",
      customer_name: "Test Customer 2",
      amount: 7.20,
      type: "album",
      discount: 10
    }
  ];
  
  for (const saleData of sales) {
    await database.createSale(saleData);
  }
  
  console.log('✅ Database seeded successfully!');
  console.log('👉 Login with: admin / admin123');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
