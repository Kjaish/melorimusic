import fs from 'fs';
import path from 'path';
import database from './database.js';

async function deepScan() {
    await database.initialize();

    // 1. Get unmigrated songs
    const allSongs = await database.getAllSongs();
    let unmigrated = allSongs.filter(s => s.file_path && s.file_path.startsWith('/objects/'));

    // Fallback: If filter returns 0 but we know IDs exist, fetch them manually
    // IDs: 387, 386, 385, 384, 382, 199, 198, 197, 196, 195, 194, 193
    const missingIds = [387, 386, 385, 384, 382, 199, 198, 197, 196, 195, 194, 193];

    console.log("⚠️  Checking known missing IDs manually...");

    for (const id of missingIds) {
        // Check if already in unmigrated list
        if (!unmigrated.find(s => s.id === id)) {
            const s = await database.getSongById(id);
            if (s && s.file_path && s.file_path.startsWith('/objects/')) {
                unmigrated.push(s);
            }
        }
    }

    if (unmigrated.length === 0) {
        console.log("✅ All known missing songs are already migrated!");
        return;
    }

    console.log(`🔍 Searching for ${unmigrated.length} missing songs...`);

    // 2. Index ALL files recursively
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
                        variations: [
                            file.toLowerCase(),
                            path.parse(file).name.toLowerCase(),
                            path.parse(file).name.toLowerCase().replace(/_/g, ' '),
                            path.parse(file).name.toLowerCase().replace(/_/g, ''),
                            path.parse(file).name.toLowerCase().replace(/[^a-z0-9]/g, '')
                        ],
                        // DB path relative to public root
                        dbPath: '/uploads/music_files/' + path.relative(uploadsDir, filePath).replace(/\\/g, '/')
                    });
                }
            }
        });
        return results;
    };

    const allFiles = getFilesRecursively(uploadsDir);
    console.log(`📂 Scanned ${allFiles.length} files across all folders.`);

    // 3. Match Logic
    let fixedCount = 0;

    for (const song of unmigrated) {
        console.log(`\nAttempting to find: "${song.title}"`);

        const titleLower = song.title.toLowerCase();
        const titleStripped = titleLower.replace(/[^a-z0-9]/g, '');

        const match = allFiles.find(f => {
            // Check for exact matches in variations
            if (f.variations.includes(titleLower)) return true;
            if (f.variations.includes(titleStripped)) return true;
            if (f.variations.some(v => v.replace(/[^a-z0-9]/g, '') === titleStripped)) return true;
            return false;
        });

        if (match) {
            console.log(`   ✅ FOUND: "${match.dbPath}"`);
            try {
                await database.db.run(
                    "UPDATE songs SET file_path = ? WHERE id = ?",
                    [match.dbPath, song.id]
                );
                fixedCount++;
            } catch (err) {
                console.error(`   ❌ Failed to update DB: ${err.message}`);
            }
        } else {
            console.log(`   ❌ Still missing.`);
        }
    }

    console.log(`\n🎉 Found and fixed ${fixedCount} songs.`);
}

deepScan();
