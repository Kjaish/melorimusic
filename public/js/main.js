// Music Player - Full Track Playback
class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentSong = null;
    this.isPlaying = false;
    this.playlist = [];
    this.currentIndex = 0;
    this.progressInterval = null;
    
    this.initPlayer();
  }
  
  initPlayer() {
    const savedPlaylist = localStorage.getItem('musicPlayerPlaylist');
    if (savedPlaylist) {
      this.playlist = JSON.parse(savedPlaylist);
    }
    
    this.audio.addEventListener('ended', () => this.onSongEnd());
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
    
    document.getElementById('playBtn')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('prevBtn')?.addEventListener('click', () => this.playPrev());
    document.getElementById('nextBtn')?.addEventListener('click', () => this.playNext());
    document.getElementById('volumeSlider')?.addEventListener('input', (e) => {
      this.audio.volume = e.target.value / 100;
    });
    
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
      progressBar.addEventListener('click', (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * this.audio.duration;
        this.audio.currentTime = newTime;
      });
    }
  }
  
  showPlayer() {
    const player = document.getElementById('audioPlayer');
    if (player) {
      player.classList.add('player-active');
      document.body.classList.add('player-visible');
    }
  }
  
  hidePlayer() {
    const player = document.getElementById('audioPlayer');
    if (player) {
      player.classList.remove('player-active');
      document.body.classList.remove('player-visible');
    }
  }
  
  loadSong(song, playlist = null) {
    return new Promise((resolve, reject) => {
      if (playlist) {
        this.playlist = playlist;
        this.currentIndex = playlist.findIndex(s => s.id === song.id);
        localStorage.setItem('musicPlayerPlaylist', JSON.stringify(playlist));
      }
      
      this.currentSong = song;
      
      // Show the player when a song is loaded
      this.showPlayer();
      
      // Handle different file path formats
      let filePath = song.file_path;
      if (!filePath) {
        console.error('No file path for song:', song);
        alert('Audio file not found for this song.');
        reject(new Error('No file path'));
        return;
      }
      
      // Build the audio URL
      const audioUrl = filePath.startsWith('/') ? filePath : `/uploads/music_files/${filePath}`;
      console.log('Loading audio:', audioUrl);
      
      // Set up load handlers before setting src
      const onCanPlay = () => {
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
        console.log('Audio ready to play:', audioUrl);
        resolve();
      };
      
      const onError = (e) => {
        this.audio.removeEventListener('canplay', onCanPlay);
        this.audio.removeEventListener('error', onError);
        console.error('Audio load error:', e);
        alert('Could not load audio file. It may be missing or corrupted.');
        reject(e);
      };
      
      this.audio.addEventListener('canplay', onCanPlay);
      this.audio.addEventListener('error', onError);
      
      this.audio.src = audioUrl;
      this.audio.load();
      
      this.updatePlayerUI();
      this.trackPlayCount();
    });
  }
  
  play() {
    if (this.currentSong) {
      console.log('Playing song:', this.currentSong.title);
      
      this.audio.play().then(() => {
        this.isPlaying = true;
        this.updatePlayButton();
        this.startProgressTracking();
        console.log('Playback started successfully');
      }).catch(error => {
        console.error('Playback error:', error);
        if (error.name === 'NotAllowedError') {
          alert('Click the play button in the player bar to start playback.');
        } else {
          alert('Unable to play audio. The file may not exist or is still loading.');
        }
      });
    } else {
      console.log('No song loaded to play');
    }
  }
  
  // Handle song ending - play next or stop
  onSongEnd() {
    if (this.currentIndex < this.playlist.length - 1) {
      this.playNext();
    } else {
      this.pause();
      this.audio.currentTime = 0;
      this.updateProgress();
      // Hide player when playlist ends
      this.hidePlayer();
    }
  }
  
  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.updatePlayButton();
    this.stopProgressTracking();
  }
  
  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }
  
  playNext() {
    if (this.currentIndex < this.playlist.length - 1) {
      this.currentIndex++;
      this.loadSong(this.playlist[this.currentIndex]);
      this.play();
    }
  }
  
  playPrev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.loadSong(this.playlist[this.currentIndex]);
      this.play();
    } else if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
    }
  }
  
  updatePlayerUI() {
    const titleEl = document.getElementById('currentSongTitle');
    if (titleEl && this.currentSong) {
      titleEl.textContent = this.currentSong.title;
    }
    
    if (this.currentSong?.album_title) {
      const albumEl = document.getElementById('currentSongAlbum');
      if (albumEl) {
        albumEl.textContent = `from ${this.currentSong.album_title}`;
      }
    }
  }
  
  updatePlayButton() {
    const playBtn = document.getElementById('playBtn');
    if (playBtn) {
      const icon = playBtn.querySelector('i');
      if (icon) {
        icon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
      }
    }
  }
  
  updateProgress() {
    const progressFill = document.querySelector('.progress-fill');
    if (progressFill && this.audio.duration) {
      const percent = (this.audio.currentTime / this.audio.duration) * 100;
      progressFill.style.width = `${percent}%`;
    }
    
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    
    if (currentTimeEl) {
      currentTimeEl.textContent = this.formatTime(this.audio.currentTime);
    }
    if (durationEl && this.audio.duration) {
      durationEl.textContent = this.formatTime(this.audio.duration);
    }
  }
  
  updateDuration() {
    this.updateProgress();
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  startProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
    }
    this.progressInterval = setInterval(() => this.updateProgress(), 100);
  }
  
  stopProgressTracking() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }
  
  async trackPlayCount() {
    if (!this.currentSong) return;
    
    try {
      await fetch(`/api/songs/${this.currentSong.id}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
    } catch (error) {
      console.error('Error tracking play count:', error);
    }
  }
}

// Search functionality
class SearchManager {
  constructor() {
    this.searchInput = document.getElementById('searchInput') || document.querySelector('.search-box');
    this.suggestionsContainer = document.getElementById('searchSuggestions');
    this.searchTimeout = null;
    
    this.initSearch();
  }
  
  initSearch() {
    if (!this.searchInput) return;
    
    this.searchInput.addEventListener('input', (e) => {
      this.handleSearchInput(e.target.value);
    });
    
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.hideSuggestions();
        this.performSearch(this.searchInput.value);
      }
    });
    
    this.searchInput.addEventListener('focus', () => {
      if (this.searchInput.value.length >= 2) {
        this.showSuggestions(this.searchInput.value);
      }
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        this.hideSuggestions();
      }
    });
  }
  
  handleSearchInput(query) {
    clearTimeout(this.searchTimeout);
    
    if (query.length < 2) {
      this.hideSuggestions();
      return;
    }
    
    this.searchTimeout = setTimeout(() => {
      this.showSuggestions(query);
    }, 300);
  }
  
  async showSuggestions(query) {
    if (!this.suggestionsContainer) return;
    
    try {
      const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`);
      const suggestions = await response.json();
      
      if (suggestions.length > 0) {
        this.suggestionsContainer.innerHTML = suggestions
          .map(suggestion => `
            <div class="suggestion-item" onclick="searchManager.selectSuggestion('${suggestion.replace(/'/g, "\\'")}')">
              <i class="fas fa-search"></i> ${suggestion}
            </div>
          `)
          .join('');
        this.suggestionsContainer.style.display = 'block';
        this.suggestionsContainer.classList.add('active');
      } else {
        this.hideSuggestions();
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      this.hideSuggestions();
    }
  }
  
  hideSuggestions() {
    if (this.suggestionsContainer) {
      this.suggestionsContainer.style.display = 'none';
      this.suggestionsContainer.classList.remove('active');
    }
  }
  
  selectSuggestion(suggestion) {
    this.searchInput.value = suggestion;
    this.hideSuggestions();
    this.performSearch(suggestion);
  }
  
  performSearch(query) {
    if (query.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(query)}`;
    }
  }
}

// Purchase functionality
class PurchaseManager {
  constructor() {
    this.modal = document.getElementById('purchaseModal');
    this.modalContent = document.querySelector('.modal-content');
    this.initModals();
  }
  
  initModals() {
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.closeModal();
      }
    });
    
    document.querySelector('.close-modal')?.addEventListener('click', () => {
      this.closeModal();
    });
    
    document.querySelectorAll('.purchase-album').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const albumId = button.dataset.albumId;
        this.showAlbumPurchaseModal(albumId);
      });
    });
    
    document.querySelectorAll('.purchase-song').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const songId = button.dataset.songId;
        this.showSongPurchaseModal(songId);
      });
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });
  }
  
  async showAlbumPurchaseModal(albumId) {
    if (!this.modal || !this.modalContent) return;
    
    try {
      const response = await fetch(`/api/albums/${albumId}`);
      const album = await response.json();
      
      this.modalContent.innerHTML = `
        <span class="close-modal" onclick="purchaseManager.closeModal()">&times;</span>
        <h2>Purchase Album</h2>
        <div class="purchase-details">
          <img src="/uploads/album_art/${album.album_art}" alt="${album.title}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 10px; margin-bottom: 1rem;">
          <h3>${album.title}</h3>
          <p>${album.description || ''}</p>
          <p class="price">Price: <strong>$${parseFloat(album.price).toFixed(2)}</strong></p>
          
          <form id="purchaseForm" onsubmit="return purchaseManager.processPurchase(event, 'album', '${albumId}')">
            <div class="form-group">
              <label for="name">Your Name</label>
              <input type="text" id="name" name="name" class="form-control" required>
            </div>
            <div class="form-group">
              <label for="email">Email Address</label>
              <input type="email" id="email" name="email" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">
              Purchase for $${parseFloat(album.price).toFixed(2)}
            </button>
          </form>
        </div>
      `;
      
      this.openModal();
    } catch (error) {
      console.error('Error loading album:', error);
      alert('Error loading album details.');
    }
  }
  
  async showSongPurchaseModal(songId) {
    if (!this.modal || !this.modalContent) return;
    
    try {
      const response = await fetch(`/api/songs/${songId}`);
      const song = await response.json();
      
      this.modalContent.innerHTML = `
        <span class="close-modal" onclick="purchaseManager.closeModal()">&times;</span>
        <h2>Purchase Song</h2>
        <div class="purchase-details">
          <h3>${song.title}</h3>
          <p>from ${song.album_title || 'Unknown Album'}</p>
          <p class="price">Price: <strong>$${parseFloat(song.price).toFixed(2)}</strong></p>
          
          <form id="purchaseForm" onsubmit="return purchaseManager.processPurchase(event, 'song', '${songId}')">
            <div class="form-group">
              <label for="name">Your Name</label>
              <input type="text" id="name" name="name" class="form-control" required>
            </div>
            <div class="form-group">
              <label for="email">Email Address</label>
              <input type="email" id="email" name="email" class="form-control" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">
              Purchase for $${parseFloat(song.price).toFixed(2)}
            </button>
          </form>
        </div>
      `;
      
      this.openModal();
    } catch (error) {
      console.error('Error loading song:', error);
      alert('Error loading song details.');
    }
  }
  
  async processPurchase(event, type, id) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = 'Processing...';
    submitBtn.disabled = true;
    
    try {
      const response = await fetch(`/purchase/${type}/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showSuccessMessage(result);
      } else {
        alert(result.message || 'Purchase failed. Please try again.');
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Network error. Please check your connection and try again.');
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
    
    return false;
  }
  
  showSuccessMessage(result) {
    this.modalContent.innerHTML = `
      <div style="text-align: center; padding: 2rem 0;">
        <div style="font-size: 4rem; color: #4CAF50; margin-bottom: 1rem;">&#10003;</div>
        <h2>Purchase Successful!</h2>
        <p>${result.message}</p>
        ${result.discount ? `<p class="discount-badge">${result.discount}</p>` : ''}
        <p>Your download link has been sent to your email.</p>
        <p>Transaction ID: <strong>${result.saleId}</strong></p>
        <div style="margin-top: 2rem;">
          <button onclick="purchaseManager.closeModal()" class="btn btn-primary">
            Continue Browsing
          </button>
        </div>
      </div>
    `;
  }
  
  openModal() {
    if (this.modal) {
      this.modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }
  
  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }
}

// File Upload Preview
class FileUploadPreview {
  static init() {
    const albumArtInput = document.getElementById('albumArt');
    if (albumArtInput) {
      albumArtInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const preview = document.getElementById('albumArtPreview');
            if (preview) {
              preview.src = e.target.result;
              preview.style.display = 'block';
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing music player...');
  window.musicPlayer = new MusicPlayer();
  window.searchManager = new SearchManager();
  window.purchaseManager = new PurchaseManager();
  
  FileUploadPreview.init();
  
  // Album play buttons (on album cards)
  document.querySelectorAll('.album-art-container .play-btn').forEach(button => {
    console.log('Setting up album play button listener');
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const albumCard = button.closest('.album-card');
      if (albumCard) {
        const albumId = albumCard.dataset.albumId;
        console.log('Album play button clicked, albumId:', albumId);
        if (albumId) {
          await playAlbum(parseInt(albumId));
        }
      }
    });
  });
  
  // Single play buttons (on cover art)
  document.querySelectorAll('.play-single-btn').forEach(button => {
    console.log('Setting up single play button listener');
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const filePath = button.dataset.filePath;
      const title = button.dataset.title;
      console.log('Single play button clicked:', title, filePath);
      if (filePath && title) {
        await playSingle(filePath, title);
      }
    });
  });
  
  // Inline single play buttons (next to buy buttons)
  document.querySelectorAll('.play-single-inline-btn').forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const filePath = button.dataset.filePath;
      const title = button.dataset.title;
      if (filePath && title) {
        await playSingle(filePath, title);
      }
    });
  });
  
  // Song play buttons (in album track lists)
  document.querySelectorAll('.play-song-btn').forEach(button => {
    console.log('Setting up song play button listener');
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const filePath = button.dataset.filePath;
      const title = button.dataset.title;
      const songId = button.dataset.songId;
      console.log('Song play button clicked:', title, filePath);
      if (filePath && title) {
        await playSongFromAlbum(filePath, title, songId, e);
      }
    });
  });
  
  // Play song functionality (from track lists)
  document.querySelectorAll('.play-song').forEach(button => {
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const songId = button.dataset.songId;
      const albumId = button.dataset.albumId;
      
      try {
        const songResponse = await fetch(`/api/songs/${songId}`);
        const song = await songResponse.json();
        
        const albumResponse = await fetch(`/api/albums/${albumId}/songs`);
        const songs = await albumResponse.json();
        
        await window.musicPlayer.loadSong(song, songs);
        window.musicPlayer.play();
      } catch (error) {
        console.error('Error playing song:', error);
        alert('Error loading song. Please try again.');
      }
    });
  });
  
  // Album click redirect (only when not clicking buttons)
  document.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button') && !e.target.closest('a')) {
        const albumId = card.dataset.albumId;
        if (albumId) {
          window.location.href = `/album/${albumId}`;
        }
      }
    });
  });
  
  // Purchase buttons (all pages)
  document.querySelectorAll('.purchase-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const type = button.dataset.type;
      const id = button.dataset.id;
      const title = button.dataset.title;
      const price = button.dataset.price;
      
      console.log('Purchase button clicked:', type, id, title, price);
      openPurchaseModal(type, id, title, price);
    });
  });
  
  // Close modal button
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closePurchaseModal();
    });
  }
  
  // Purchase form submission
  const purchaseForm = document.getElementById('purchaseForm');
  if (purchaseForm) {
    purchaseForm.addEventListener('submit', handlePurchase);
  }
  
  // Clickable cards (search results)
  document.querySelectorAll('.clickable-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('button') && !e.target.closest('a')) {
        const href = card.dataset.href;
        if (href) {
          window.location.href = href;
        }
      }
    });
  });
  
  // Close modal when clicking outside
  const purchaseModal = document.getElementById('purchaseModal');
  if (purchaseModal) {
    purchaseModal.addEventListener('click', (e) => {
      if (e.target === purchaseModal) {
        closePurchaseModal();
      }
    });
  }
  
  console.log('Music player initialized');
});

// Utility functions
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `alert alert-${type}`;
  notification.innerHTML = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 1rem 2rem;
    background: ${type === 'success' ? '#4CAF50' : '#f44336'};
    color: white;
    border-radius: 8px;
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Play single track
async function playSingle(filePath, title) {
  console.log('playSingle called:', filePath, title);
  if (window.musicPlayer) {
    const song = {
      id: 'single-' + Date.now(),
      file_path: filePath,
      title: title
    };
    try {
      await window.musicPlayer.loadSong(song);
      window.musicPlayer.play();
    } catch (error) {
      console.error('Error playing single:', error);
    }
  }
}

// Expose to window for inline onclick handlers
window.playSingle = playSingle;

// Play song from album page
async function playSongFromAlbum(filePath, title, songId, event) {
  if (window.musicPlayer) {
    const song = {
      id: songId,
      file_path: filePath,
      title: title
    };
    
    // Build playlist from all songs on the page
    const playlist = [];
    document.querySelectorAll('.play-song-btn').forEach(btn => {
      playlist.push({
        id: btn.dataset.songId,
        file_path: btn.dataset.filePath,
        title: btn.dataset.title
      });
    });
    
    try {
      // Load song with full playlist for transport controls
      await window.musicPlayer.loadSong(song, playlist.length > 0 ? playlist : null);
      window.musicPlayer.play();
      
      // Update visual state of play buttons
      document.querySelectorAll('.play-song-btn').forEach(btn => {
        const icon = btn.querySelector('i');
        if (icon) icon.className = 'fas fa-play';
      });
      if (event && event.currentTarget) {
        const icon = event.currentTarget.querySelector('i');
        if (icon) icon.className = 'fas fa-pause';
      }
    } catch (error) {
      console.error('Error playing song:', error);
    }
  }
}

// Play first song from album (for album card play button)
async function playAlbum(albumId) {
  console.log('playAlbum called with albumId:', albumId);
  
  if (!window.musicPlayer) {
    console.error('Music player not initialized');
    return;
  }
  
  try {
    const response = await fetch(`/api/albums/${albumId}/songs`);
    if (!response.ok) {
      throw new Error('Failed to fetch songs');
    }
    const songs = await response.json();
    console.log('Fetched songs:', songs);
    
    if (songs && songs.length > 0) {
      const firstSong = songs[0];
      console.log('Playing first song:', firstSong.title);
      
      // Load and play
      await window.musicPlayer.loadSong(firstSong, songs);
      window.musicPlayer.play();
    } else {
      alert('No songs available in this album yet.');
    }
  } catch (error) {
    console.error('Error playing album:', error);
    alert('Could not load album songs: ' + error.message);
  }
}

// Expose functions to window for inline onclick handlers
window.playAlbum = playAlbum;
window.playSongFromAlbum = playSongFromAlbum;
window.openPurchaseModal = openPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.handlePurchase = handlePurchase;

// Global purchase modal functions (called from onclick handlers)
function openPurchaseModal(type, id, title, price) {
  const modal = document.getElementById('purchaseModal');
  if (!modal) return;
  
  // Set hidden form values
  document.getElementById('purchaseType').value = type;
  document.getElementById('purchaseId').value = id;
  document.getElementById('modalTitle').textContent = `Purchase: ${title}`;
  document.getElementById('purchasePrice').textContent = `$${parseFloat(price).toFixed(2)}`;
  
  // Show the modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closePurchaseModal() {
  const modal = document.getElementById('purchaseModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function handlePurchase(event) {
  event.preventDefault();
  
  const form = event.target;
  const type = document.getElementById('purchaseType').value;
  const id = document.getElementById('purchaseId').value;
  const name = document.getElementById('customerName').value;
  const email = document.getElementById('customerEmail').value;
  
  if (!name || !email) {
    alert('Please fill in all fields');
    return false;
  }
  
  if (!validateEmail(email)) {
    alert('Please enter a valid email address');
    return false;
  }
  
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
  submitBtn.disabled = true;
  
  fetch(`/purchase/${type}/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email })
  })
  .then(response => response.json())
  .then(result => {
    if (result.success && result.checkoutUrl) {
      // Redirect to Stripe Checkout
      window.location.href = result.checkoutUrl;
    } else if (result.success) {
      // Fallback for non-Stripe success
      const modalContent = document.querySelector('#purchaseModal .modal-content');
      modalContent.innerHTML = `
        <button class="close-modal" onclick="closePurchaseModal()">&times;</button>
        <div style="text-align: center; padding: 2rem 0;">
          <div style="font-size: 4rem; color: #4CAF50; margin-bottom: 1rem;"><i class="fas fa-check-circle"></i></div>
          <h2>Purchase Successful!</h2>
          <p>${result.message}</p>
          <div style="margin-top: 2rem;">
            <button onclick="closePurchaseModal(); location.reload();" class="btn btn-primary">
              Continue Browsing
            </button>
          </div>
        </div>
      `;
    } else {
      alert(result.message || 'Purchase failed. Please try again.');
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  })
  .catch(error => {
    console.error('Purchase error:', error);
    alert('Network error. Please check your connection and try again.');
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  });
  
  return false;
}

// =============================================
// Client-Side Analytics Tracking
// =============================================
class AnalyticsTracker {
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.pageLoadTime = Date.now();
    this.heartbeatInterval = null;
    
    this.init();
  }
  
  getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('melori_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 11);
      sessionStorage.setItem('melori_session_id', sessionId);
    }
    return sessionId;
  }
  
  init() {
    this.trackPageView();
    this.setupClickTracking();
    this.startHeartbeat();
    this.trackOnUnload();
  }
  
  async sendEvent(eventType, eventData = {}) {
    try {
      await fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          event_type: eventType,
          page_path: window.location.pathname,
          metadata: {
            referrer: document.referrer || null,
            ...eventData
          }
        })
      });
    } catch (error) {
      console.debug('Analytics event failed:', error);
    }
  }
  
  trackPageView() {
    this.sendEvent('page_view', {
      title: document.title,
      url: window.location.href
    });
  }
  
  setupClickTracking() {
    document.addEventListener('click', (e) => {
      const trackedElement = e.target.closest('[data-track]');
      if (trackedElement) {
        const trackName = trackedElement.dataset.track;
        const trackValue = trackedElement.dataset.trackValue || null;
        
        this.sendEvent('click', {
          element: trackName,
          value: trackValue,
          elementText: trackedElement.textContent?.trim().substring(0, 100) || null
        });
      }
    });
  }
  
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const timeSpent = Math.floor((Date.now() - this.pageLoadTime) / 1000);
      this.sendHeartbeat(timeSpent);
    }, 30000);
  }
  
  async sendHeartbeat(timeSpent) {
    try {
      await fetch('/api/analytics/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.sessionId,
          page_path: window.location.pathname,
          duration_seconds: timeSpent
        })
      });
    } catch (error) {
      console.debug('Heartbeat failed:', error);
    }
  }
  
  trackOnUnload() {
    window.addEventListener('beforeunload', () => {
      const timeSpent = Math.floor((Date.now() - this.pageLoadTime) / 1000);
      
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/event', JSON.stringify({
          session_id: this.sessionId,
          event_type: 'page_exit',
          page_path: window.location.pathname,
          duration_ms: timeSpent * 1000
        }));
      }
      
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
    });
  }
}

// Initialize analytics when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.analyticsTracker = new AnalyticsTracker();
});
