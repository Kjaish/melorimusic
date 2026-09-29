import axios from 'axios';
import natural from 'natural';
import database from './database.js';
import 'dotenv/config';

class SearchEngine {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.useAI = !!process.env.DEEPSEEK_API_KEY;
    this.cache = new Map();
  }

  async initialize() {
    console.log('Search engine initialized');
    if (this.useAI) {
      console.log('AI-powered search enabled (DeepSeek)');
    } else {
      console.log('AI search disabled - using keyword matching');
    }
  }

  async search(query, options = {}) {
    const cacheKey = `search:${query}:${JSON.stringify(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      return cached.results;
    }

    let results = [];
    
    if (this.useAI && query.length > 3) {
      try {
        results = await this.aiSearch(query);
      } catch (error) {
        console.error('AI search failed, falling back to keyword search:', error.message);
        results = await this.keywordSearch(query);
      }
    } else {
      results = await this.keywordSearch(query);
    }

    if (options.type) {
      results = results.filter(r => r.type === options.type);
    }
    
    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      results: results
    });

    return results;
  }

  async aiSearch(query) {
    try {
      const albums = await database.getAllActiveAlbums();
      const songs = await database.getAllSongs();
      
      const musicData = [
        ...albums.map(a => ({ type: 'album', title: a.title, description: a.description, id: a.id })),
        ...songs.map(s => ({ type: 'song', title: s.title, album: s.album_title, id: s.id }))
      ];

      const context = musicData.map(item => 
        `${item.type}: "${item.title}"${item.description ? ` - ${item.description}` : ''}${item.album ? ` (from ${item.album})` : ''}`
      ).join('\n');

      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: `You are a music search assistant. Analyze the user's query against this music catalog and return relevant items. 
              Catalog:\n${context}\n
              Return results as a JSON array with items containing: type (album/song), id, title, match_reason (brief explanation), score (0-1).
              Only include highly relevant results.`
            },
            {
              role: 'user',
              content: `Find music matching: "${query}"`
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      
      let aiResults = [];
      try {
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          aiResults = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error('Failed to parse AI response:', e);
        return await this.keywordSearch(query);
      }

      const results = [];
      for (const aiResult of aiResults) {
        if (aiResult.score > 0.3) {
          if (aiResult.type === 'album') {
            const album = await database.getAlbumById(aiResult.id);
            if (album) {
              results.push({
                type: 'album',
                id: album.id,
                title: album.title,
                description: album.description,
                price: album.price,
                album_art: album.album_art,
                match_reason: aiResult.match_reason,
                score: aiResult.score
              });
            }
          } else if (aiResult.type === 'song') {
            const song = await database.getSongById(aiResult.id);
            if (song) {
              const album = await database.getAlbumById(song.album_id);
              results.push({
                type: 'song',
                id: song.id,
                title: song.title,
                album_id: song.album_id,
                album_title: album?.title,
                price: song.price,
                match_reason: aiResult.match_reason,
                score: aiResult.score
              });
            }
          }
        }
      }

      return results.sort((a, b) => b.score - a.score);

    } catch (error) {
      console.error('DeepSeek API error:', error.response?.data || error.message);
      throw error;
    }
  }

  async keywordSearch(query) {
    const albums = await database.getAllActiveAlbums();
    const songs = await database.getAllSongs();
    const singles = await database.getAllSingles();
    
    const queryLower = query.toLowerCase().trim();
    const results = [];
    
    // Score calculation helper
    const calculateScore = (text, queryStr) => {
      const textLower = text.toLowerCase();
      let score = 0;
      let matchReason = '';
      
      // Exact match (highest priority)
      if (textLower === queryStr) {
        score = 1.0;
        matchReason = 'Exact match';
      }
      // Starts with query (high priority)
      else if (textLower.startsWith(queryStr)) {
        score = 0.9 - (queryStr.length / textLower.length) * 0.1;
        matchReason = 'Title starts with query';
      }
      // Contains query as substring
      else if (textLower.includes(queryStr)) {
        const position = textLower.indexOf(queryStr);
        score = 0.7 - (position / textLower.length) * 0.2;
        matchReason = 'Contains search term';
      }
      // Word-by-word matching for multi-word queries
      else {
        const queryWords = queryStr.split(/\s+/).filter(w => w.length > 0);
        const textWords = textLower.split(/\s+/);
        let matchedWords = 0;
        let partialMatches = 0;
        
        for (const qWord of queryWords) {
          // Check exact word match
          if (textWords.some(tw => tw === qWord)) {
            matchedWords++;
          }
          // Check word starts with query word
          else if (textWords.some(tw => tw.startsWith(qWord))) {
            partialMatches += 0.8;
          }
          // Check word contains query word
          else if (textWords.some(tw => tw.includes(qWord))) {
            partialMatches += 0.5;
          }
          // Check any character sequence match
          else if (textLower.includes(qWord)) {
            partialMatches += 0.3;
          }
        }
        
        if (matchedWords > 0 || partialMatches > 0) {
          score = (matchedWords + partialMatches) / queryWords.length * 0.6;
          matchReason = `Matched ${matchedWords} word(s)`;
        }
      }
      
      // Fuzzy character matching for short queries (1-2 chars)
      if (score === 0 && queryStr.length <= 2) {
        const chars = queryStr.split('');
        let charMatches = 0;
        for (const char of chars) {
          if (textLower.includes(char)) {
            charMatches++;
          }
        }
        if (charMatches === chars.length) {
          // Check if chars appear in order
          let lastIndex = -1;
          let inOrder = true;
          for (const char of chars) {
            const idx = textLower.indexOf(char, lastIndex + 1);
            if (idx > lastIndex) {
              lastIndex = idx;
            } else {
              inOrder = false;
              break;
            }
          }
          if (inOrder) {
            score = 0.3;
            matchReason = 'Character sequence match';
          } else {
            score = 0.15;
            matchReason = 'Contains characters';
          }
        }
      }
      
      return { score, matchReason };
    };
    
    // Search albums
    for (const album of albums) {
      const titleMatch = calculateScore(album.title, queryLower);
      const descMatch = album.description ? calculateScore(album.description, queryLower) : { score: 0, matchReason: '' };
      
      // Use best score between title and description (title weighted higher)
      let finalScore = Math.max(titleMatch.score, descMatch.score * 0.7);
      let matchReason = titleMatch.score >= descMatch.score * 0.7 ? titleMatch.matchReason : `Description: ${descMatch.matchReason}`;
      
      if (finalScore > 0) {
        results.push({
          type: 'album',
          id: album.id,
          title: album.title,
          description: album.description,
          price: album.price,
          album_art: album.album_art,
          match_reason: matchReason,
          score: finalScore
        });
      }
    }
    
    // Search songs
    for (const song of songs) {
      const titleMatch = calculateScore(song.title, queryLower);
      const albumMatch = song.album_title ? calculateScore(song.album_title, queryLower) : { score: 0, matchReason: '' };
      
      // Use best score (title weighted higher)
      let finalScore = Math.max(titleMatch.score, albumMatch.score * 0.5);
      let matchReason = titleMatch.score >= albumMatch.score * 0.5 ? titleMatch.matchReason : `Album: ${albumMatch.matchReason}`;
      
      if (finalScore > 0) {
        results.push({
          type: 'song',
          id: song.id,
          title: song.title,
          album_id: song.album_id,
          album_title: song.album_title,
          price: song.price,
          cover_art: song.cover_art,
          match_reason: matchReason,
          score: finalScore
        });
      }
    }
    
    // Search singles
    for (const single of singles) {
      const titleMatch = calculateScore(single.title, queryLower);
      
      if (titleMatch.score > 0) {
        results.push({
          type: 'single',
          id: single.id,
          title: single.title,
          price: single.price,
          cover_art: single.cover_art,
          file_path: single.file_path,
          match_reason: titleMatch.matchReason,
          score: titleMatch.score
        });
      }
    }
    
    return results.sort((a, b) => b.score - a.score);
  }

  async getSuggestions(query, limit = 8) {
    if (!query || query.length < 1) return [];
    
    const albums = await database.getAllActiveAlbums();
    const songs = await database.getAllSongs();
    const singles = await database.getAllSingles();
    const queryLower = query.toLowerCase().trim();
    
    const suggestions = [];
    
    // Priority 1: Titles starting with query
    albums.forEach(album => {
      if (album.title.toLowerCase().startsWith(queryLower)) {
        suggestions.push({ text: album.title, priority: 1, type: 'album' });
      }
    });
    
    songs.forEach(song => {
      if (song.title.toLowerCase().startsWith(queryLower)) {
        suggestions.push({ text: song.title, priority: 1, type: 'song' });
      }
    });
    
    singles.forEach(single => {
      if (single.title.toLowerCase().startsWith(queryLower)) {
        suggestions.push({ text: single.title, priority: 1, type: 'single' });
      }
    });
    
    // Priority 2: Titles containing query
    albums.forEach(album => {
      const titleLower = album.title.toLowerCase();
      if (!titleLower.startsWith(queryLower) && titleLower.includes(queryLower)) {
        suggestions.push({ text: album.title, priority: 2, type: 'album' });
      }
    });
    
    songs.forEach(song => {
      const titleLower = song.title.toLowerCase();
      if (!titleLower.startsWith(queryLower) && titleLower.includes(queryLower)) {
        suggestions.push({ text: song.title, priority: 2, type: 'song' });
      }
    });
    
    singles.forEach(single => {
      const titleLower = single.title.toLowerCase();
      if (!titleLower.startsWith(queryLower) && titleLower.includes(queryLower)) {
        suggestions.push({ text: single.title, priority: 2, type: 'single' });
      }
    });
    
    // Priority 3: Words within title starting with query
    if (queryLower.length >= 2) {
      albums.forEach(album => {
        const words = album.title.toLowerCase().split(/\s+/);
        if (words.some(word => word !== album.title.toLowerCase() && word.startsWith(queryLower))) {
          if (!suggestions.find(s => s.text === album.title)) {
            suggestions.push({ text: album.title, priority: 3, type: 'album' });
          }
        }
      });
      
      songs.forEach(song => {
        const words = song.title.toLowerCase().split(/\s+/);
        if (words.some(word => word !== song.title.toLowerCase() && word.startsWith(queryLower))) {
          if (!suggestions.find(s => s.text === song.title)) {
            suggestions.push({ text: song.title, priority: 3, type: 'song' });
          }
        }
      });
      
      singles.forEach(single => {
        const words = single.title.toLowerCase().split(/\s+/);
        if (words.some(word => word !== single.title.toLowerCase() && word.startsWith(queryLower))) {
          if (!suggestions.find(s => s.text === single.title)) {
            suggestions.push({ text: single.title, priority: 3, type: 'single' });
          }
        }
      });
    }
    
    // Sort by priority and remove duplicates
    suggestions.sort((a, b) => a.priority - b.priority);
    const unique = [...new Set(suggestions.map(s => s.text))];
    
    return unique.slice(0, limit);
  }

  async indexAlbum(albumId) {
    const cacheKeys = Array.from(this.cache.keys()).filter(key => key.includes('search:'));
    cacheKeys.forEach(key => this.cache.delete(key));
    
    console.log(`Re-indexed album ${albumId}`);
  }

  clearCache() {
    this.cache.clear();
    console.log('Search cache cleared');
  }
}

export default new SearchEngine();
