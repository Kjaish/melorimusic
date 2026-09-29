import database from './database.js';

async function listSingles() {
    try {
        await database.initialize();

        console.log('Fetching singles...');
        // Access the raw sqlite db instance if necessary, or use a method if available.
        // However, database.js might not expose a direct "get raw singles" method with paths easily unless we add it.
        // Wait, database.getAllSingles() exists.

        const singles = await database.getAllSingles();

        console.log(`Found ${singles.length} singles:`);
        singles.forEach(s => {
            console.log(`[${s.id}] "${s.title}" - Path: ${s.file_path}`);
        });

    } catch (error) {
        console.error('Error:', error);
    }
}

listSingles();
