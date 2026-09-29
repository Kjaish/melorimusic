import sqlite3

# Connect to database
conn = sqlite3.connect('music.db')
cursor = conn.cursor()

# Check current paths
print("=== Current Database Paths ===")
rows = cursor.execute('SELECT title, file_path FROM songs WHERE title LIKE "%Father%" LIMIT 3').fetchall()
for title, path in rows:
    print(f"{title}: {path}")

print("\n=== Total Songs ===")
count = cursor.execute('SELECT COUNT(*) FROM songs').fetchone()[0]
print(f"Total songs in database: {count}")

conn.close()
