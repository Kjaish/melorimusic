import fs from 'fs';
import path from 'path';
import database from './database.js';

async function diagnose() {
    await database.initialize();

    // 1. Get unmigrated songs
    // database.getAllSongs() returns everything. We filter manually.
    const allSongs = await database.getAllSongs();
    const unmigrated = allSongs.filter(s => s.file_path && s.file_path.startsWith('/objects/'));

    if (unmigrated.length === 0) {
        console.log("✅ All songs are migrated!");
        return;
    }

    console.log(`🔍 Found ${unmigrated.length} unmigrated songs.`);

    // 2. Get Filesystem Snapshot
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'music_files');
    const singlesDir = path.join(uploadsDir, 'Singles');

    const getFilesRecursively = (dir) => {
        let results = [];
        if (!fs.existsSync(dir)) return results;

        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat && stat.isDirectory()) {
                results = results.concat(getFilesRecursively(filePath));
            } else {
                if (/\.(mp3|wav|m4a|flac|ogg)$/i.test(file)) {
                    results.push({
                        name: file,
                        fullPath: filePath,
                        relPath: path.relative(uploadsDir, filePath).replace(/\\/g, '/')
                    });
                }
            }
        });
        return results;
    };

    const allFiles = getFilesRecursively(uploadsDir);
    console.log(`📂 Found ${allFiles.length} audio files in /uploads/music_files/`);

    // 3. Analyze Mismatches
    for (const song of unmigrated) {
        console.log(`\n❌ Missing: [${song.id}] "${song.title}" (Album ID: ${song.album_id || 'NULL/Single'})`);

        // Check if it's an album track (if album_id exists)
        if (song.album_id) {
            const album = await database.getAlbumById(song.album_id);
            console.log(`   Expected in Album: "${album ? album.title : 'Unknown'}"`);
        }

        // Fuzzy Match Attempt
        // Normalize string: uppercase, remove special chars
        const normalize = (str) => str.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const target = normalize(song.title);

        // Find closest match in files
        const matches = allFiles.filter(f => {
            const fName = normalize(path.parse(f.name).name);
            return fName.includes(target) || target.includes(fName);
        });

        if (matches.length > 0) {
            console.log(`   💡 Potential file matches:`);
            matches.forEach(m => console.log(`      - ${m.relPath}`));
        } else {
            console.log(`   ⚠️  No similar filenames found.`);
        }

        // Check if song title is actually an Album Name
        // Sometimes users name the single same as album
        const albums = await database.getAllAlbums();
        const matchingAlbum = albums.find(a => normalize(a.title) === target);
        if (matchingAlbum) {
            console.log(`   ℹ️  Note: There is an existing ALBUM named "${matchingAlbum.title}". Is this a duplicate?`);
        }
    }
}

diagnose();
