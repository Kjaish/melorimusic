import database from '../database.js';
import pgDatabase from './pg-database.js';

export function getAuthProvider() {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('sqlite')) {
        return database;
    }
    return pgDatabase;
}
