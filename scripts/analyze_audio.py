#!/usr/bin/env python3
"""
Audio Analysis Script for MELORI Music Platform
Analyzes audio files for tempo (BPM) and duration using librosa and mutagen
"""

import sys
import json
import os

def analyze_audio(file_path):
    """
    Analyze an audio file and return tempo and duration
    
    Args:
        file_path: Path to the audio file
        
    Returns:
        dict with tempo (BPM) and duration (seconds)
    """
    result = {
        'tempo': None,
        'duration': None,
        'error': None
    }
    
    if not os.path.exists(file_path):
        result['error'] = f'File not found: {file_path}'
        return result
    
    try:
        import librosa
        import numpy as np
        
        y, sr = librosa.load(file_path, sr=None)
        
        duration = librosa.get_duration(y=y, sr=sr)
        result['duration'] = round(duration, 2)
        
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        if isinstance(tempo, np.ndarray):
            tempo = float(tempo[0]) if len(tempo) > 0 else float(tempo)
        result['tempo'] = round(float(tempo), 1)
        
    except ImportError as e:
        try:
            from mutagen import File as MutagenFile
            audio = MutagenFile(file_path)
            if audio and audio.info:
                result['duration'] = round(audio.info.length, 2)
            result['error'] = f'librosa not available for tempo analysis: {str(e)}'
        except Exception as me:
            result['error'] = f'Analysis failed: {str(e)}, mutagen error: {str(me)}'
    except Exception as e:
        result['error'] = f'Analysis error: {str(e)}'
        try:
            from mutagen import File as MutagenFile
            audio = MutagenFile(file_path)
            if audio and audio.info:
                result['duration'] = round(audio.info.length, 2)
        except:
            pass
    
    return result

def analyze_with_mutagen(file_path):
    """
    Get duration using mutagen (faster, no tempo)
    """
    result = {
        'tempo': None,
        'duration': None,
        'error': None
    }
    
    if not os.path.exists(file_path):
        result['error'] = f'File not found: {file_path}'
        return result
    
    try:
        from mutagen import File as MutagenFile
        audio = MutagenFile(file_path)
        if audio and audio.info:
            result['duration'] = round(audio.info.length, 2)
        else:
            result['error'] = 'Could not read audio metadata'
    except Exception as e:
        result['error'] = f'Mutagen error: {str(e)}'
    
    return result

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: python analyze_audio.py <file_path> [--fast]'}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    fast_mode = '--fast' in sys.argv
    
    if fast_mode:
        result = analyze_with_mutagen(file_path)
    else:
        result = analyze_audio(file_path)
    
    print(json.dumps(result))
