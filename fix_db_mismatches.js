import fs from 'fs';
import path from 'path';
import database from './database.js';

async function fixMismatches() {
    await database.initialize();

    // 1. Get unmigrated songs (paths starting with /objects/)
    const allSongs = await database.getAllSongs();
    const unmigrated = allSongs.filter(s => s.file_path && s.file_path.startsWith('/objects/'));

    console.log(`🔍 Found ${unmigrated.length} unmigrated songs.`);

    if (unmigrated.length === 0) return;

    // 2. Index all files
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'music_files');

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
                        // Store relative path for DB update (e.g., /uploads/music_files/Album/Song.mp3)
                        dbPath: '/uploads/music_files/' + path.relative(uploadsDir, filePath).replace(/\\/g, '/')
                    });
                }
            }
        });
        return results;
    };

    const allFiles = getFilesRecursively(uploadsDir);
    console.log(`📂 Indexed ${allFiles.length} local audio files.`);

    // 3. Match and Update
    let fixedCount = 0;

    // Helper to normalize strings for comparison
    const normalize = (str) => str.toUpperCase().replace(/[^A-Z0-9]/g, '');

    for (const song of unmigrated) {
        const targetTitle = normalize(song.title);

        // Find matching file
        // Check if any file's name (normalized) matches the song title (normalized)
        const match = allFiles.find(f => {
            const fName = normalize(path.parse(f.name).name);
            // Check for exact match of "cleaned" strings
            return fName === targetTitle;
        });

        if (match) {
            console.log(`✅ MATCH FOUND: "${song.title}" -> "${match.dbPath}"`);

            // Update DB
            // Note: we can't use updateSingle for album songs easily if it's restricted, 
            // but let's assume updateSong/updateSingle works or use raw query if needed.
            // database.js usually has updateSong logic.

            // Let's use a raw query update to be safe and direct for both songs/singles
            try {
                await database.db.run(
                    `UPDATE songs SET file_path = ? WHERE id = ?`,
                    [match.dbPath, song.id]
                );
                fixedCount++;
            } catch (err) {
                console.error(`   Failed to update DB: ${err.message}`);
            }
        } else {
            console.log(`❌ No fuzzy match for: "${song.title}"`);
        }
    }

    console.log(`\n🎉 Fixed ${fixedCount} songs.`);
}

fixMismatches();
