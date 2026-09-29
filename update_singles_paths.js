import fs from 'fs';
import path from 'path';
import database from './database.js';

const SINGLES_DIR = path.join(process.cwd(), 'public', 'uploads', 'music_files', 'Singles');
const BASE_URL = '/uploads/music_files/Singles';

async function updateSinglesPaths() {
    try {
        await database.initialize();

        if (!fs.existsSync(SINGLES_DIR)) {
            console.error(`Directory not found: ${SINGLES_DIR}`);
            return;
        }

        const files = fs.readdirSync(SINGLES_DIR).filter(f => /\.(mp3|wav|m4a|flac|ogg)$/i.test(f));
        console.log(`Found ${files.length} audio files in Singles folder.`);

        const singles = await database.getAllSingles();
        console.log(`Found ${singles.length} singles in database.`);

        let updatedCount = 0;

        for (const single of singles) {
            // Find matching file
            // Try exact match with extension
            let match = files.find(f => f.toLowerCase() === `${single.title.toLowerCase()}.mp3`);

            // Try match without extension
            if (!match) {
                match = files.find(f => path.parse(f).name.toLowerCase() === single.title.toLowerCase());
            }

            // Try improved fuzzy match (stripping special chars)
            if (!match) {
                const cleanTitle = single.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                match = files.find(f => {
                    const cleanFile = path.parse(f).name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    return cleanFile === cleanTitle;
                });
            }

            if (match) {
                const newPath = `${BASE_URL}/${match}`;

                // Update DB
                // We use a direct SQL update because updateSingle might not expose file_path update easily in all versions, 
                // but let's try to verify if we can use the class method
                // database.updateSingle(id, data) -> updates title, price, file_path, cover_art

                await database.updateSingle(single.id, {
                    title: single.title, // Required by method signature usually
                    price: single.price, // Required
                    file_path: newPath
                });

                console.log(`✅ Updated "${single.title}" -> ${newPath}`);
                updatedCount++;
            } else {
                console.log(`❌ No file found for "${single.title}"`);
            }
        }

        console.log(`\nMigration complete: ${updatedCount}/${singles.length} singles updated.`);

    } catch (error) {
        console.error('Error:', error);
    }
}

updateSinglesPaths();
