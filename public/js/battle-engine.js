// Battle Engine for Melori
class BattleEngine {
    constructor() {
        this.battleState = {
            leftScore: 0,
            rightScore: 0,
            leftVolume: 50,
            rightVolume: 50,
            activePowerup: null,
            tapMultiplier: 1,
            isTapping: false,
            tapInterval: null,
            holdInterval: null
        };
        
        this.powerups = {
            battery: { cost: 100, multiplier: 2, duration: 30, active: false },
            thimble: { cost: 200, multiplier: 3, duration: 20, active: false },
            hold: { cost: 50, perSecond: 10, active: false }
        };
        
        this.timer = 90; // 1:30 in seconds
        this.timerInterval = null;
    }
    
    // Start the battle timer
    startTimer() {
        this.timerInterval = setInterval(() => {
            this.timer--;
            this.updateTimerDisplay();
            
            if (this.timer <= 0) {
                this.endBattle();
            }
        }, 1000);
    }
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.timer / 60);
        const seconds = this.timer % 60;
        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }
    
    endBattle() {
        clearInterval(this.timerInterval);
        
        const winner = this.battleState.leftScore > this.battleState.rightScore ? 'left' : 'right';
        const leftArtist = document.getElementById('left-artist')?.textContent || 'Artist 1';
        const rightArtist = document.getElementById('right-artist')?.textContent || 'Artist 2';
        const winnerName = winner === 'left' ? leftArtist : rightArtist;
        
        // Show results
        const resultsEl = document.getElementById('battle-results');
        const winnerNameEl = document.getElementById('winner-name');
        const winnerScoreEl = document.getElementById('winner-score');
        
        if (resultsEl) {
            winnerNameEl.textContent = winnerName;
            winnerScoreEl.textContent = winner === 'left' ? this.battleState.leftScore : this.battleState.rightScore;
            resultsEl.style.display = 'flex';
        }
    }
    
    // Update tug-of-war bar based on scores
    updateTugBar() {
        const total = this.battleState.leftScore + this.battleState.rightScore;
        if (total === 0) return;
        
        const leftPercent = (this.battleState.leftScore / total) * 100;
        const tugFill = document.getElementById('tug-fill');
        const tugIndicator = document.getElementById('tug-indicator');
        
        if (!tugFill || !tugIndicator) return;
        
        // Update fill width
        tugFill.style.width = `${Math.abs(leftPercent - 50) * 2}%`;
        tugFill.style.left = `${Math.min(leftPercent, 50)}%`;
        
        // Move indicator
        tugIndicator.style.left = `${leftPercent}%`;
        
        // Update colors based on leader
        if (leftPercent > 50) {
            tugFill.style.background = 'linear-gradient(to right, #ff5500, #ff8844)';
            tugIndicator.style.background = '#ff5500';
        } else {
            tugFill.style.background = 'linear-gradient(to right, #00CCFF, #ff5500)';
            tugIndicator.style.background = '#00CCFF';
        }
        
        // Update volumes
        this.updateVolumes(leftPercent);
    }
    
    updateVolumes(leftPercent) {
        const leftVolume = 50 + (leftPercent - 50);
        const rightVolume = 100 - leftVolume;
        
        this.battleState.leftVolume = leftVolume;
        this.battleState.rightVolume = rightVolume;
        
        const leftVolumeEl = document.getElementById('left-volume');
        const rightVolumeEl = document.getElementById('right-volume');
        
        if (leftVolumeEl) leftVolumeEl.style.width = `${leftVolume}%`;
        if (rightVolumeEl) rightVolumeEl.style.width = `${rightVolume}%`;
    }
    
    // Add score to left or right side
    addScore(side, amount = 1) {
        const multiplier = this.battleState.tapMultiplier;
        const actualAmount = amount * multiplier;
        
        if (side === 'left') {
            this.battleState.leftScore += actualAmount;
            const scoreEl = document.getElementById('left-score');
            if (scoreEl) scoreEl.textContent = this.battleState.leftScore;
            this.showTapEffect('left', actualAmount);
        } else {
            this.battleState.rightScore += actualAmount;
            const scoreEl = document.getElementById('right-score');
            if (scoreEl) scoreEl.textContent = this.battleState.rightScore;
            this.showTapEffect('right', actualAmount);
        }
        
        this.updateTugBar();
    }
    
    showTapEffect(side, amount) {
        const container = document.querySelector('.battle-container');
        if (!container) return;
        
        const effect = document.createElement('div');
        effect.className = 'tap-effect';
        effect.textContent = `+${amount}`;
        effect.style.cssText = `
            position: absolute;
            ${side}: 20%;
            top: 30%;
            font-size: 24px;
            font-weight: bold;
            color: ${side === 'left' ? '#ff5500' : '#00CCFF'};
            text-shadow: 0 0 10px ${side === 'left' ? '#ff5500' : '#00CCFF'};
            animation: float-up 1s forwards;
            z-index: 1000;
            pointer-events: none;
        `;
        
        container.appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 1000);
    }
    
    // Power-up activation
    activatePowerup(type) {
        if (this.powerups[type].active) return;
        
        this.powerups[type].active = true;
        this.battleState.activePowerup = type;
        
        switch(type) {
            case 'battery':
                this.battleState.tapMultiplier = 2;
                setTimeout(() => {
                    this.battleState.tapMultiplier = 1;
                    this.powerups.battery.active = false;
                    this.battleState.activePowerup = null;
                    this.updatePowerupUI('battery', false);
                }, this.powerups.battery.duration * 1000);
                break;
                
            case 'thimble':
                this.battleState.tapMultiplier = 3;
                setTimeout(() => {
                    this.battleState.tapMultiplier = 1;
                    this.powerups.thimble.active = false;
                    this.battleState.activePowerup = null;
                    this.updatePowerupUI('thimble', false);
                }, this.powerups.thimble.duration * 1000);
                break;
                
            case 'hold':
                this.powerups.hold.active = true;
                break;
        }
        
        this.updatePowerupUI(type, true);
    }
    
    updatePowerupUI(type, active) {
        const btn = document.getElementById(`powerup-${type}`);
        if (btn) {
            if (active) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }
    
    // Reset battle
    reset() {
        this.battleState = {
            leftScore: 0,
            rightScore: 0,
            leftVolume: 50,
            rightVolume: 50,
            activePowerup: null,
            tapMultiplier: 1,
            isTapping: false,
            tapInterval: null,
            holdInterval: null
        };
        
        this.timer = 90;
        clearInterval(this.timerInterval);
        
        // Reset UI
        const leftScore = document.getElementById('left-score');
        const rightScore = document.getElementById('right-score');
        if (leftScore) leftScore.textContent = '0';
        if (rightScore) rightScore.textContent = '0';
        
        this.updateTimerDisplay();
        this.updateTugBar();
    }
}

// Initialize battle engine
let battleEngine = null;

document.addEventListener('DOMContentLoaded', function() {
    battleEngine = new BattleEngine();
    window.battleEngine = battleEngine;
    
    // Add tap effect animation
    if (!document.querySelector('#tap-effect-style')) {
        const style = document.createElement('style');
        style.id = 'tap-effect-style';
        style.textContent = `
            @keyframes float-up {
                0% { transform: translateY(0) scale(1); opacity: 1; }
                100% { transform: translateY(-50px) scale(1.5); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
});

// Global functions for onclick handlers
function goHome() {
    window.location.href = '/';
}

function startBattle() {
    if (battleEngine) {
        battleEngine.reset();
        battleEngine.startTimer();
    }
}

function tapLeft() {
    if (battleEngine) {
        battleEngine.addScore('left', 1);
    }
}

function tapRight() {
    if (battleEngine) {
        battleEngine.addScore('right', 1);
    }
}

function activatePowerup(type) {
    if (battleEngine) {
        battleEngine.activatePowerup(type);
    }
}

function closeBattleResults() {
    const resultsEl = document.getElementById('battle-results');
    if (resultsEl) {
        resultsEl.style.display = 'none';
    }
    window.location.href = '/';
}
