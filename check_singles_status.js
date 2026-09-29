import database from './database.js';
import fs from 'fs';
import path from 'path';

async function checkStatus() {
    await database.initialize();

    // Specific IDs from previous logs
    const targetIds = [387, 386, 385, 384]; // Tie Me Up, Time Ticking, My Baby Boo, H to T

    console.log('--- Database Status ---');
    for (const id of targetIds) {
        const song = await database.getSongById(id);
        if (song) {
            console.log(`[${id}] "${song.title}" Path: ${song.file_path}`);
        } else {
            console.log(`[${id}] Not found in DB`);
        }
    }

    console.log('\n--- File System Check ---');
    const dir = path.join(process.cwd(), 'public', 'uploads', 'music_files', 'Singles');
    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        console.log('Files in Singles folder:', files);
    } else {
        console.log('Singles folder does not exist!');
    }
}

checkStatus();
