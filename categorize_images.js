import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import database from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Categorize images from public/Pics into album_art and avatars
 * based on database references
 */
async function categorizeImages() {
    const picsFolder = path.join(__dirname, 'public', 'Pics');
    const albumArtFolder = path.join(__dirname, 'public', 'uploads', 'album_art');
    const avatarsFolder = path.join(__dirname, 'public', 'uploads', 'avatars');

    // Check if Pics folder exists
    if (!fs.existsSync(picsFolder)) {
        console.error('❌ Error: public/Pics folder does not exist yet.');
        console.log('📁 Please create the folder and paste your images there first.');
        return;
    }

    console.log('🔍 Starting image categorization...\n');

    // Get all image filenames from database
    console.log('📊 Reading database...');
    const albums = await database.getAllAlbums();
    const singles = await database.getAllSingles();

    // For users/avatars, we'll need to query the users table
    let users = [];
    try {
        // Try to get users (may not have avatar field in all cases)
        const db = database.db;
        users = await new Promise((resolve, reject) => {
            db.all('SELECT id, username, avatar FROM users WHERE avatar IS NOT NULL', (err, rows) => {
                if (err) resolve([]);
                else resolve(rows || []);
            });
        });
    } catch (error) {
        console.log('⚠️  No users with avatars found in database');
    }

    // Collect all album art filenames
    const albumArtFiles = new Set();
    albums.forEach(album => {
        if (album.album_art) {
            albumArtFiles.add(album.album_art);
        }
    });
    singles.forEach(single => {
        if (single.cover_art) {
            albumArtFiles.add(single.cover_art);
        }
    });

    // Collect all avatar filenames
    const avatarFiles = new Set();
    users.forEach(user => {
        if (user.avatar) {
            avatarFiles.add(user.avatar);
        }
    });

    console.log(`✅ Found ${albumArtFiles.size} album art references`);
    console.log(`✅ Found ${avatarFiles.size} avatar references\n`);

    // Get all files from Pics folder
    const picsFiles = fs.readdirSync(picsFolder).filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    });

    console.log(`📂 Found ${picsFiles.length} image files in Pics folder\n`);

    let albumArtCopied = 0;
    let avatarsCopied = 0;
    let uncategorized = [];

    // Categorize and copy files
    for (const file of picsFiles) {
        const sourcePath = path.join(picsFolder, file);

        if (albumArtFiles.has(file)) {
            // Copy to album_art
            const destPath = path.join(albumArtFolder, file);
            fs.copyFileSync(sourcePath, destPath);
            console.log(`🎨 Album Art: ${file} → album_art/`);
            albumArtCopied++;
        } else if (avatarFiles.has(file)) {
            // Copy to avatars
            const destPath = path.join(avatarsFolder, file);
            fs.copyFileSync(sourcePath, destPath);
            console.log(`👤 Avatar: ${file} → avatars/`);
            avatarsCopied++;
        } else {
            // Not found in database
            uncategorized.push(file);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 CATEGORIZATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Album Art copied: ${albumArtCopied} files`);
    console.log(`✅ Avatars copied: ${avatarsCopied} files`);
    console.log(`⚠️  Uncategorized: ${uncategorized.length} files`);

    if (uncategorized.length > 0) {
        console.log('\n⚠️  The following files were not found in the database:');
        uncategorized.forEach(file => console.log(`   - ${file}`));
        console.log('\n💡 These files might be:');
        console.log('   - Old/unused images');
        console.log('   - Manually added files');
        console.log('   - Files with different names than in database');
    }

    console.log('\n✨ Categorization complete!');
    console.log('🔄 Refresh your browser to see the images.');
}

// Run the script
categorizeImages().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
