import sqlite3

conn = sqlite3.connect('music.db')
cursor = conn.cursor()

print("=== All 'A Father's Care' entries ===")
rows = cursor.execute('SELECT id, title, file_path, album_id FROM songs WHERE title LIKE "%Father%" ORDER BY id').fetchall()
for song_id, title, path, album_id in rows:
    print(f"ID {song_id}: {title} (Album: {album_id})")
    print(f"  Path: {path}")
    print()

print("\n=== Sample of recently updated songs ===")
rows = cursor.execute('SELECT title, file_path FROM songs WHERE file_path NOT LIKE "/objects%" LIMIT 10').fetchall()
for title, path in rows:
    print(f"{title}: {path}")

conn.close()
