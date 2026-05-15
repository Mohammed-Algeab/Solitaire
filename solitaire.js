// ===== Solitaire Game =====
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_SYMBOLS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_COLORS = { hearts: 'red', diamonds: 'red', clubs: 'black', spades: 'black' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.faceUp = false;
        this.id = `${suit}_${rank}_${Math.random().toString(36).substr(2, 5)}`;
    }

    get color() { return SUIT_COLORS[this.suit]; }
    get value() { return RANK_VALUES[this.rank]; }
    get symbol() { return SUIT_SYMBOLS[this.suit]; }

    canPlaceOnTableau(other) {
        if (!other) return this.rank === 'K';
        if (!other.faceUp) return false;
        if (this.color === other.color) return false;
        return other.value === this.value + 1;
    }

    canPlaceOnFoundation(foundationSuit, topCard) {
        if (this.suit !== foundationSuit) return false;
        if (!topCard) return this.rank === 'A';
        return this.value === topCard.value + 1;
    }
}

class SolitaireGame {
    constructor() {
        this.deck = [];
        this.stock = [];
        this.waste = [];
        this.foundations = { hearts: [], diamonds: [], clubs: [], spades: [] };
        this.tableau = [[], [], [], [], [], [], []];
        this.selectedCard = null;
        this.selectedSource = null;
        this.score = 0;
        this.moves = 0;
        this.startTime = null;
        this.timerInterval = null;
        this.gamesPlayed = 0;
        this.bestScore = 0;
        this.isGameOver = false;
        this.difficulty = 'normal';
        this.saveTimeout = null;
        this.isDealing = false;

        this.els = {
            score: document.getElementById('score-display'),
            time: document.getElementById('time-display'),
            moves: document.getElementById('moves-display'),
            stock: document.getElementById('stock-pile'),
            waste: document.getElementById('waste-pile'),
            foundations: document.querySelectorAll('.foundation-slot'),
            tableauCols: document.querySelectorAll('.tableau-column'),
            autoComplete: document.getElementById('btn-auto-complete'),
            winModal: document.getElementById('win-modal'),
            modalScore: document.getElementById('modal-score'),
            modalTime: document.getElementById('modal-time'),
            modalMoves: document.getElementById('modal-moves'),
            achievementToast: document.getElementById('achievement-toast'),
            achievementText: document.getElementById('achievement-text'),
            loading: document.getElementById('loading-overlay')
        };

        this.zg = new ZeroGateSDK({
            gameId: 'solitaire-zerogate-001',
            debug: false,
            autoReady: false
        });
        this.zgConnected = false;

        this.init();
    }

    async init() {
        await this.zg.requestOrientation('portrait');

        try {
            const session = await this.zg.init();
            this.zgConnected = true;
            console.log('ZeroGate connected:', session);

            const savedData = await this.zg.loadData('gameState');
            if (savedData) {
                this.gamesPlayed = savedData.gamesPlayed || 0;
                this.bestScore = savedData.bestScore || 0;
            }

            await this.zg.ready();
        } catch (e) {
            this.zgConnected = false;
            console.log('Running in standalone mode');
            try {
                const local = localStorage.getItem('solitaire_stats');
                if (local) {
                    const data = JSON.parse(local);
                    this.gamesPlayed = data.gamesPlayed || 0;
                    this.bestScore = data.bestScore || 0;
                }
            } catch (e) {}
        }

        this.els.loading.classList.add('hidden');
        this.bindEvents();
        this.newGame();
    }

    bindEvents() {
        document.getElementById('btn-new-game').addEventListener('click', () => this.newGame());
        document.getElementById('btn-modal-new').addEventListener('click', () => this.newGame());
        document.getElementById('btn-modal-close').addEventListener('click', () => this.closeModal());
        this.els.autoComplete.addEventListener('click', () => this.autoComplete());
        this.els.stock.addEventListener('click', () => this.drawFromStock());
        this.els.waste.addEventListener('click', () => this.onWasteClick());

        this.els.foundations.forEach((slot, i) => {
            slot.addEventListener('click', () => this.onFoundationClick(i));
        });

        this.els.tableauCols.forEach((col, i) => {
            col.addEventListener('click', () => this.onTableauClick(i));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'n' || e.key === 'N') this.newGame();
            if (e.key === ' ') this.drawFromStock();
        });
    }

    createDeck() {
        const deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push(new Card(suit, rank));
            }
        }
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    async newGame() {
        if (this.isDealing) return;
        this.isDealing = true;

        this.closeModal();
        this.isGameOver = false;
        this.score = 0;
        this.moves = 0;
        this.startTime = Date.now();
        this.selectedCard = null;
        this.selectedSource = null;
        this.gamesPlayed++;

        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => this.updateTimer(), 1000);

        this.deck = this.createDeck();
        this.stock = [];
        this.waste = [];
        this.foundations = { hearts: [], diamonds: [], clubs: [], spades: [] };
        this.tableau = [[], [], [], [], [], [], []];

        // Deal with animation
        let cardIndex = 0;
        for (let col = 0; col < 7; col++) {
            for (let row = 0; row <= col; row++) {
                const card = this.deck[cardIndex++];
                if (row === col) card.faceUp = true;
                this.tableau[col].push(card);
            }
        }

        this.stock = this.deck.slice(cardIndex);

        // Animate the deal
        await this.animateDeal();

        this.render();
        this.updateStats();
        this.els.autoComplete.classList.remove('show');
        this.saveGameState();

        this.isDealing = false;
    }

    async animateDeal() {
        // Add dealing animation class to all cards
        const allCards = [];
        for (let col = 0; col < 7; col++) {
            for (let row = 0; row <= col; row++) {
                allCards.push({ col, row, delay: (col * 7 + row) * 50 });
            }
        }

        // We'll use CSS animation, so just render with delay
        this.render();

        // Add dealing class to all cards
        const cards = document.querySelectorAll('.card');
        cards.forEach((card, i) => {
            card.style.animationDelay = `${i * 30}ms`;
            card.classList.add('dealing');
            setTimeout(() => card.classList.remove('dealing'), 500 + i * 30);
        });

        // Wait for animation
        await new Promise(r => setTimeout(r, 800));
    }

    drawFromStock() {
        if (this.isGameOver || this.isDealing) return;

        if (this.stock.length === 0) {
            if (this.waste.length === 0) return;
            // Recycle with animation
            this.els.stock.classList.add('stock-recycling');
            setTimeout(() => this.els.stock.classList.remove('stock-recycling'), 600);

            this.stock = [...this.waste].reverse();
            this.stock.forEach(c => c.faceUp = false);
            this.waste = [];
            this.score = Math.max(0, this.score - 100);
            this.showScorePopup(this.els.stock, '-100');
        } else {
            const drawCount = this.difficulty === 'easy' ? 1 : 3;
            for (let i = 0; i < drawCount && this.stock.length > 0; i++) {
                const card = this.stock.pop();
                card.faceUp = true;
                this.waste.push(card);
            }
        }

        this.deselect();
        this.render();
        this.updateStats();
        this.saveGameState();
    }

    onWasteClick() {
        if (this.isGameOver || this.waste.length === 0) return;
        const card = this.waste[this.waste.length - 1];

        if (this.selectedCard === card) {
            this.deselect();
            return;
        }

        if (this.selectedCard) {
            for (const suit of SUITS) {
                const top = this.foundations[suit].length > 0 ? this.foundations[suit][this.foundations[suit].length - 1] : null;
                if (this.selectedCard.canPlaceOnFoundation(suit, top)) {
                    this.moveCardToFoundation(this.selectedCard, suit);
                    return;
                }
            }
            this.deselect();
        } else {
            this.selectCard(card, 'waste');
        }
    }

    onTableauClick(colIndex) {
        if (this.isGameOver) return;
        const column = this.tableau[colIndex];
        const faceUpCards = column.filter(c => c.faceUp);

        if (faceUpCards.length === 0) {
            if (this.selectedCard) {
                if (this.selectedCard.rank === 'K') {
                    this.moveCardToTableau(this.selectedCard, colIndex);
                } else {
                    this.shakeCard(this.selectedCard);
                    this.deselect();
                }
            }
            return;
        }

        const topCard = faceUpCards[faceUpCards.length - 1];

        if (this.selectedCard) {
            if (this.selectedCard === topCard) {
                this.deselect();
                return;
            }

            // Try foundation first
            if (this.selectedSource.type === 'tableau' || this.selectedSource.type === 'waste') {
                for (const suit of SUITS) {
                    const top = this.foundations[suit].length > 0 ? this.foundations[suit][this.foundations[suit].length - 1] : null;
                    if (this.selectedCard.canPlaceOnFoundation(suit, top)) {
                        this.moveCardToFoundation(this.selectedCard, suit);
                        return;
                    }
                }
            }

            // Try tableau
            if (this.selectedCard.canPlaceOnTableau(topCard)) {
                this.moveCardToTableau(this.selectedCard, colIndex);
            } else {
                this.shakeCard(this.selectedCard);
                this.deselect();
                this.selectCard(topCard, 'tableau', colIndex);
            }
        } else {
            this.selectCard(topCard, 'tableau', colIndex);
        }
    }

    onFoundationClick(suitIndex) {
        if (this.isGameOver) return;
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const suit = suits[suitIndex];
        const foundation = this.foundations[suit];

        if (this.selectedCard) {
            const topCard = foundation.length > 0 ? foundation[foundation.length - 1] : null;
            if (this.selectedCard.canPlaceOnFoundation(suit, topCard)) {
                this.moveCardToFoundation(this.selectedCard, suit);
            } else {
                this.shakeCard(this.selectedCard);
                this.deselect();
            }
        } else if (foundation.length > 0) {
            const card = foundation[foundation.length - 1];
            this.selectCard(card, 'foundation', suit);
        }
    }

    selectCard(card, source, extra = null) {
        this.selectedCard = card;
        this.selectedSource = { type: source, extra };
        this.render();
        this.highlightValidDrops();
    }

    deselect() {
        this.selectedCard = null;
        this.selectedSource = null;
        this.clearValidDrops();
        this.render();
    }

    shakeCard(card) {
        // Find the element and shake it
        setTimeout(() => {
            const el = document.querySelector(`[data-card-id="${card.id}"]`);
            if (el) {
                el.classList.add('shake');
                setTimeout(() => el.classList.remove('shake'), 400);
            }
        }, 10);
    }

    highlightValidDrops() {
        if (!this.selectedCard) return;

        // Highlight valid tableau columns
        this.els.tableauCols.forEach((col, i) => {
            const column = this.tableau[i];
            const topCard = column.length > 0 ? column[column.length - 1] : null;
            if (this.selectedCard.canPlaceOnTableau(topCard)) {
                col.classList.add('valid-drop');
            }
        });

        // Highlight valid foundations
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        this.els.foundations.forEach((slot, i) => {
            const suit = suits[i];
            const top = this.foundations[suit].length > 0 ? this.foundations[suit][this.foundations[suit].length - 1] : null;
            if (this.selectedCard.canPlaceOnFoundation(suit, top)) {
                slot.classList.add('valid-drop');
            }
        });
    }

    clearValidDrops() {
        document.querySelectorAll('.valid-drop').forEach(el => el.classList.remove('valid-drop'));
    }

    moveCardToTableau(card, toCol) {
        const fromSource = this.selectedSource;
        let cardsToMove = [card];
        let scoreChange = 0;

        if (fromSource.type === 'tableau') {
            const fromCol = this.tableau[fromSource.extra];
            const cardIndex = fromCol.indexOf(card);
            cardsToMove = fromCol.slice(cardIndex);
        }

        if (fromSource.type === 'waste') {
            this.waste.pop();
            scoreChange = 5;
        } else if (fromSource.type === 'tableau') {
            const fromCol = this.tableau[fromSource.extra];
            const cardIndex = fromCol.indexOf(card);
            fromCol.splice(cardIndex, cardsToMove.length);
            const lastCard = fromCol[fromCol.length - 1];
            if (lastCard && !lastCard.faceUp) {
                lastCard.faceUp = true;
                scoreChange += 5;
                this.animateFlip(lastCard);
            }
        } else if (fromSource.type === 'foundation') {
            this.foundations[fromSource.extra].pop();
            scoreChange = -15;
        }

        this.tableau[toCol].push(...cardsToMove);
        this.score += scoreChange;
        this.moves++;

        if (scoreChange > 0) {
            this.showScorePopup(this.els.tableauCols[toCol], `+${scoreChange}`);
        }

        this.deselect();
        this.render();
        this.updateStats();
        this.checkWin();
        this.checkAutoComplete();
        this.saveGameState();
    }

    moveCardToFoundation(card, suit) {
        const fromSource = this.selectedSource;
        let scoreChange = 10;

        if (fromSource.type === 'waste') {
            this.waste.pop();
        } else if (fromSource.type === 'tableau') {
            const fromCol = this.tableau[fromSource.extra];
            fromCol.pop();
            const lastCard = fromCol[fromCol.length - 1];
            if (lastCard && !lastCard.faceUp) {
                lastCard.faceUp = true;
                scoreChange += 5;
                this.animateFlip(lastCard);
            }
        }

        this.foundations[suit].push(card);
        this.score += scoreChange;
        this.moves++;

        // Foundation complete animation
        const foundationEl = this.els.foundations[['hearts', 'diamonds', 'clubs', 'spades'].indexOf(suit)];
        foundationEl.classList.add('foundation-complete');
        setTimeout(() => foundationEl.classList.remove('foundation-complete'), 500);

        this.showScorePopup(foundationEl, `+${scoreChange}`);

        this.deselect();
        this.render();
        this.updateStats();
        this.checkWin();
        this.checkAutoComplete();
        this.saveGameState();
    }

    animateFlip(card) {
        setTimeout(() => {
            const el = document.querySelector(`[data-card-id="${card.id}"]`);
            if (el) {
                el.classList.add('flipping');
                setTimeout(() => el.classList.remove('flipping'), 400);
            }
        }, 10);
    }

    showScorePopup(element, text) {
        const rect = element.getBoundingClientRect();
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = text;
        popup.style.left = `${rect.left + rect.width / 2}px`;
        popup.style.top = `${rect.top}px`;
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 1200);
    }

    checkAutoComplete() {
        const allFaceUp = this.tableau.every(col => col.every(c => c.faceUp));
        const noStock = this.stock.length === 0;
        const noWaste = this.waste.length === 0;

        if (allFaceUp && noStock && noWaste) {
            this.els.autoComplete.classList.add('show');
        }
    }

    autoComplete() {
        if (this.isGameOver) return;
        let moved = true;

        while (moved) {
            moved = false;

            if (this.waste.length > 0) {
                const card = this.waste[this.waste.length - 1];
                for (const suit of SUITS) {
                    const top = this.foundations[suit].length > 0 ? this.foundations[suit][this.foundations[suit].length - 1] : null;
                    if (card.canPlaceOnFoundation(suit, top)) {
                        this.waste.pop();
                        this.foundations[suit].push(card);
                        this.score += 10;
                        moved = true;
                        break;
                    }
                }
            }

            if (!moved) {
                for (let col = 0; col < 7; col++) {
                    if (this.tableau[col].length === 0) continue;
                    const card = this.tableau[col][this.tableau[col].length - 1];
                    for (const suit of SUITS) {
                        const top = this.foundations[suit].length > 0 ? this.foundations[suit][this.foundations[suit].length - 1] : null;
                        if (card.canPlaceOnFoundation(suit, top)) {
                            this.tableau[col].pop();
                            this.foundations[suit].push(card);
                            this.score += 10;
                            const lastCard = this.tableau[col][this.tableau[col].length - 1];
                            if (lastCard && !lastCard.faceUp) {
                                lastCard.faceUp = true;
                                this.score += 5;
                            }
                            moved = true;
                            break;
                        }
                    }
                    if (moved) break;
                }
            }
        }

        this.moves++;
        this.render();
        this.updateStats();
        this.checkWin();
        this.saveGameState();
    }

    checkWin() {
        const totalFoundation = Object.values(this.foundations).reduce((sum, f) => sum + f.length, 0);
        if (totalFoundation === 52) {
            this.gameWon();
        }
    }

    async gameWon() {
        this.isGameOver = true;
        if (this.timerInterval) clearInterval(this.timerInterval);

        const timeTaken = Math.floor((Date.now() - this.startTime) / 1000);
        const bonus = Math.max(0, 700 - timeTaken) * 2;
        this.score += bonus;

        if (this.score > this.bestScore) this.bestScore = this.score;

        this.els.modalScore.textContent = this.score;
        this.els.modalTime.textContent = this.formatTime(timeTaken);
        this.els.modalMoves.textContent = this.moves;
        this.els.winModal.classList.add('active');
        this.els.autoComplete.classList.remove('show');

        // Win particles
        this.createWinParticles();

        if (this.zgConnected) {
            try {
                const result = await this.zg.submitScore(this.score, {
                    level: this.difficulty,
                    durationSeconds: timeTaken,
                    moves: this.moves
                });

                if (result.newBest) {
                    this.showAchievement(`رقم قياسي جديد! +${result.xpEarned} XP`);
                }

                await this.checkAchievements(timeTaken);

                await this.zg.saveData('gameState', {
                    gamesPlayed: this.gamesPlayed,
                    bestScore: this.bestScore,
                    lastPlayed: Date.now()
                });
            } catch (e) {
                console.error('ZeroGate error:', e);
            }
        } else {
            try {
                localStorage.setItem('solitaire_stats', JSON.stringify({
                    gamesPlayed: this.gamesPlayed,
                    bestScore: this.bestScore,
                    lastPlayed: Date.now()
                }));
            } catch (e) {}
        }

        this.animateWin();
    }

    createWinParticles() {
        const colors = ['#ffd700', '#ff6b35', '#4caf50', '#2196f3', '#e91e63', '#9c27b0'];
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const particle = document.createElement('div');
                particle.className = 'win-particle';
                particle.style.left = `${Math.random() * 100}vw`;
                particle.style.bottom = '0';
                particle.style.background = colors[Math.floor(Math.random() * colors.length)];
                particle.style.width = `${Math.random() * 8 + 4}px`;
                particle.style.height = particle.style.width;
                particle.style.animationDuration = `${Math.random() * 1 + 1.5}s`;
                document.body.appendChild(particle);
                setTimeout(() => particle.remove(), 3000);
            }, i * 50);
        }
    }

    async checkAchievements(timeTaken) {
        const checks = [
            { condition: this.gamesPlayed === 1, key: 'first_win' },
            { condition: this.score >= 1000, key: 'score_1000' },
            { condition: this.score >= 10000, key: 'score_10000' },
            { condition: this.score >= 100000, key: 'score_100000' },
            { condition: timeTaken < 60, key: 'speed_demon' },
            { condition: this.gamesPlayed >= 10, key: 'play_10_games' },
            { condition: this.gamesPlayed >= 100, key: 'play_100_games' }
        ];

        for (const check of checks) {
            if (check.condition) {
                try {
                    const result = await this.zg.unlockAchievement(check.key);
                    if (result.unlocked && !result.alreadyHad) {
                        this.showAchievement(`🏆 ${this.getAchievementName(check.key)} +${result.xpEarned} XP`);
                    }
                } catch (e) {}
            }
        }
    }

    getAchievementName(key) {
        const names = {
            first_win: 'أول فوز',
            score_1000: '1,000 نقطة',
            score_10000: '10,000 نقطة',
            score_100000: '100,000 نقطة',
            play_10_games: '10 ألعاب',
            play_100_games: '100 لعبة',
            speed_demon: 'سريع البرق'
        };
        return names[key] || key;
    }

    showAchievement(text) {
        this.els.achievementText.textContent = text;
        this.els.achievementToast.classList.add('show');
        setTimeout(() => this.els.achievementToast.classList.remove('show'), 3000);
    }

    animateWin() {
        const cards = document.querySelectorAll('.card');
        cards.forEach((card, i) => {
            setTimeout(() => {
                card.style.animation = `winBounce 0.8s ease ${i * 0.02}s`;
            }, i * 30);
        });
    }

    closeModal() {
        this.els.winModal.classList.remove('active');
    }

    // ===== RENDERING =====
    render() {
        this.renderStock();
        this.renderWaste();
        this.renderFoundations();
        this.renderTableau();
    }

    renderStock() {
        this.els.stock.innerHTML = '';
        if (this.stock.length > 0) {
            this.els.stock.appendChild(this.createCardElement(this.stock[this.stock.length - 1], false));
        } else {
            const icon = document.createElement('div');
            icon.className = 'slot-icon';
            icon.textContent = this.waste.length > 0 ? '🔄' : '';
            this.els.stock.appendChild(icon);
        }
    }

    renderWaste() {
        this.els.waste.innerHTML = '';
        const visible = this.waste.slice(-3);
        visible.forEach((card, i) => {
            const el = this.createCardElement(card, true);
            el.style.left = `${i * 12}px`;
            el.style.zIndex = i;
            if (i === visible.length - 1) el.style.zIndex = 10;
            this.els.waste.appendChild(el);
        });
    }

    renderFoundations() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        this.els.foundations.forEach((slot, i) => {
            const suit = suits[i];
            const foundation = this.foundations[suit];
            slot.innerHTML = '';

            if (foundation.length === 0) {
                const sym = document.createElement('span');
                sym.className = 'slot-symbol';
                sym.textContent = SUIT_SYMBOLS[suit];
                slot.appendChild(sym);
            } else {
                slot.appendChild(this.createCardElement(foundation[foundation.length - 1], true));
            }
        });
    }

    renderTableau() {
        const offset = getComputedStyle(document.documentElement).getPropertyValue('--tableau-offset').trim();
        const offsetVal = parseInt(offset) || 20;

        this.els.tableauCols.forEach((col, i) => {
            col.innerHTML = '';
            const column = this.tableau[i];

            column.forEach((card, j) => {
                const el = this.createCardElement(card, true);
                el.style.top = `${j * offsetVal}px`;
                el.style.zIndex = j;
                col.appendChild(el);
            });
        });
    }

    createCardElement(card, faceUpCheck) {
        const el = document.createElement('div');
        el.className = `card ${card.color}`;
        el.dataset.cardId = card.id;

        if (!card.faceUp) {
            el.classList.add('face-down');
            const pattern = document.createElement('div');
            pattern.className = 'card-pattern';
            pattern.textContent = '♠';
            el.appendChild(pattern);
        } else {
            el.innerHTML = `
                <div class="card-top">${card.rank}${card.symbol}</div>
                <div class="card-center">${card.symbol}</div>
                <div class="card-bottom">${card.rank}${card.symbol}</div>
            `;
        }

        if (this.selectedCard === card) {
            el.classList.add('selected');
        }

        return el;
    }

    updateStats() {
        const oldScore = parseInt(this.els.score.textContent) || 0;
        this.els.score.textContent = this.score;
        if (this.score !== oldScore) {
            this.els.score.classList.add('changed');
            setTimeout(() => this.els.score.classList.remove('changed'), 400);
        }
        this.els.moves.textContent = this.moves;
    }

    updateTimer() {
        if (!this.startTime || this.isGameOver) return;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        this.els.time.textContent = this.formatTime(elapsed);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    saveGameState() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            const state = {
                stock: this.stock.map(c => ({suit: c.suit, rank: c.rank, faceUp: c.faceUp})),
                waste: this.waste.map(c => ({suit: c.suit, rank: c.rank, faceUp: c.faceUp})),
                foundations: Object.fromEntries(
                    Object.entries(this.foundations).map(([k, v]) => [k, v.map(c => ({suit: c.suit, rank: c.rank}))])
                ),
                tableau: this.tableau.map(col => col.map(c => ({suit: c.suit, rank: c.rank, faceUp: c.faceUp}))),
                score: this.score,
                moves: this.moves,
                startTime: this.startTime,
                gamesPlayed: this.gamesPlayed,
                bestScore: this.bestScore,
                isGameOver: this.isGameOver
            };
            try {
                localStorage.setItem('solitaire_current', JSON.stringify(state));
            } catch (e) {}
        }, 1000);
    }

    destroy() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.zg.destroy();
    }
}

// ===== START =====
let game;
window.addEventListener('DOMContentLoaded', () => {
    game = new SolitaireGame();
});

window.addEventListener('beforeunload', () => {
    if (game) game.destroy();
});
