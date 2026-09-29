import database from './database.js';

async function fixIceman() {
    await database.initialize();

    const title = 'Iceman Ball Out';
    const newPath = '/uploads/music_files/Singles/Ball Out.mp3';

    console.log(`Updating "${title}"...`);

    try {
        await database.db.run(
            "UPDATE songs SET file_path = ? WHERE title = ?",
            [newPath, title]
        );
        console.log('✅ Update successful!');
    } catch (err) {
        console.error('Error updating DB:', err);
    }
}

fixIceman();
