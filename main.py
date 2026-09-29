from flask import Flask, render_template, request, jsonify, redirect, url_for
import os
import sqlite3
import threading
from datetime import datetime

app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('templates', exist_ok=True)
os.makedirs('static', exist_ok=True)

def init_db():
    conn = sqlite3.connect('music_queue.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            filepath TEXT,
            title TEXT,
            artist TEXT,
            duration REAL,
            tempo REAL,
            genre TEXT,
            style TEXT,
            energy TEXT,
            upload_time TIMESTAMP,
            status TEXT DEFAULT 'queued'
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def classify_genre(tempo, spectral_centroid, zero_crossing_rate):
    if tempo > 140:
        return "EDM/Dance"
    elif tempo > 120:
        return "Pop/Rock"
    elif tempo > 90:
        if spectral_centroid < 2000:
            return "Hip-Hop/R&B"
        else:
            return "Indie/Alternative"
    elif tempo > 60:
        if zero_crossing_rate < 0.05:
            return "Jazz/Soul"
        else:
            return "Folk/Acoustic"
    else:
        return "Ambient/Classical"

def analyze_audio(filepath):
    try:
        import librosa
        import numpy as np
        
        y, sr = librosa.load(filepath)
        duration = librosa.get_duration(y=y, sr=sr)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        spectral_centroid = np.mean(librosa.feature.spectral_centroid(y=y, sr=sr))
        zcr = np.mean(librosa.feature.zero_crossing_rate(y))
        
        genre = classify_genre(tempo, spectral_centroid, zcr)
        
        if spectral_centroid > 3000:
            style = "Bright"
        elif spectral_centroid > 1500:
            style = "Balanced"
        else:
            style = "Warm"
        
        rms = np.mean(librosa.feature.rms(y=y))
        if rms > 0.1:
            energy = "High"
        elif rms > 0.05:
            energy = "Medium"
        else:
            energy = "Low"
        
        return {
            'duration': round(duration, 2),
            'tempo': round(float(tempo), 1),
            'genre': genre,
            'style': style,
            'energy': energy
        }
    except ImportError:
        return {
            'duration': 0,
            'tempo': 120,
            'genre': 'Unknown',
            'style': 'Unknown',
            'energy': 'Medium'
        }
    except Exception as e:
        print(f"Analysis error: {e}")
        return {
            'duration': 0,
            'tempo': 0,
            'genre': 'Unknown',
            'style': 'Unknown',
            'energy': 'Unknown'
        }

def get_metadata(filepath):
    try:
        from mutagen.mp3 import MP3
        from mutagen.flac import FLAC
        
        if filepath.endswith('.mp3'):
            audio = MP3(filepath)
            return {
                'title': str(audio.get('TIT2', ['Unknown'])[0]) if 'TIT2' in audio else 'Unknown',
                'artist': str(audio.get('TPE1', ['Unknown'])[0]) if 'TPE1' in audio else 'Unknown'
            }
        elif filepath.endswith('.flac'):
            audio = FLAC(filepath)
            return {
                'title': audio.get('title', ['Unknown'])[0] if 'title' in audio else 'Unknown',
                'artist': audio.get('artist', ['Unknown'])[0] if 'artist' in audio else 'Unknown'
            }
    except:
        pass
    
    filename = os.path.basename(filepath)
    return {'title': os.path.splitext(filename)[0], 'artist': 'Unknown'}

def process_upload(filepath, filename):
    analysis = analyze_audio(filepath)
    metadata = get_metadata(filepath)
    
    conn = sqlite3.connect('music_queue.db')
    c = conn.cursor()
    c.execute('''
        INSERT INTO songs (filename, filepath, title, artist, duration, tempo, genre, style, energy, upload_time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        filename,
        filepath,
        metadata['title'],
        metadata['artist'],
        analysis['duration'],
        analysis['tempo'],
        analysis['genre'],
        analysis['style'],
        analysis['energy'],
        datetime.now(),
        'processed'
    ))
    conn.commit()
    conn.close()

@app.route('/')
def index():
    return render_template('scanner/index.html')

@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    allowed_extensions = {'mp3', 'wav', 'flac', 'ogg'}
    if not file.filename.lower().split('.')[-1] in allowed_extensions:
        return jsonify({'error': 'Invalid file format'}), 400
    
    filename = file.filename
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    thread = threading.Thread(target=process_upload, args=(filepath, filename))
    thread.start()
    
    return jsonify({'success': True, 'message': 'File uploaded and processing...'})

@app.route('/queue')
def queue():
    sort_by = request.args.get('sort', 'upload_time')
    
    conn = sqlite3.connect('music_queue.db')
    c = conn.cursor()
    
    valid_sorts = ['upload_time', 'duration', 'tempo', 'genre', 'style', 'energy', 'title', 'artist']
    if sort_by not in valid_sorts:
        sort_by = 'upload_time'
    
    c.execute(f'SELECT * FROM songs ORDER BY {sort_by} DESC')
    songs = c.fetchall()
    conn.close()
    
    return render_template('scanner/queue.html', songs=songs, sort_by=sort_by)

@app.route('/api/songs')
def api_songs():
    conn = sqlite3.connect('music_queue.db')
    c = conn.cursor()
    c.execute('SELECT * FROM songs ORDER BY upload_time DESC')
    songs = c.fetchall()
    conn.close()
    
    song_list = []
    for song in songs:
        song_list.append({
            'id': song[0],
            'filename': song[1],
            'title': song[3],
            'artist': song[4],
            'duration': song[5],
            'tempo': song[6],
            'genre': song[7],
            'style': song[8],
            'energy': song[9],
            'upload_time': str(song[10])
        })
    
    return jsonify(song_list)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
