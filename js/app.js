'use strict';

class CultureG {
  constructor() {
    this.currentCategory = null;
    this.deck = [];
    this.currentIndex = 0;
    this.sessionCorrect = 0;
    this.isFlipped = false;
    this._swipeAbort = null;
    this.activeTab = 'login';
    this.$ = id => document.getElementById(id);
    this.init();
  }

  // ─── INIT ────────────────────────────────────────────────────────────────

  async init() {
    this.registerServiceWorker();
    this.bindAuthUI();
    this.bindHomeUI();
    this.bindCardUI();
    this.bindResultsUI();
    this.bindVinylUI();
    this.bindLabUI();
    this.bindHistoireUI();

    const session = await auth.getSession();
    if (session) {
      this.enterHome();
    } else {
      this.showScreen('auth');
    }
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
  }

  // ─── AUTH ────────────────────────────────────────────────────────────────

  bindAuthUI() {
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.dataset.tab;
        this.$('auth-submit').textContent =
          this.activeTab === 'login' ? 'Se connecter' : "S'inscrire";
        this.$('auth-error').textContent = '';
      });
    });

    this.$('auth-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = this.$('auth-email').value.trim();
      const password = this.$('auth-password').value;
      const btn = this.$('auth-submit');
      btn.disabled = true;
      btn.textContent = '…';
      this.$('auth-error').textContent = '';
      try {
        if (this.activeTab === 'login') {
          await auth.login(email, password);
        } else {
          await auth.register(email, password);
        }
        this.enterHome();
      } catch (err) {
        this.$('auth-error').textContent = this._friendlyError(err.message);
        btn.disabled = false;
        btn.textContent = this.activeTab === 'login' ? 'Se connecter' : "S'inscrire";
      }
    });

    this.$('btn-skip-auth').addEventListener('click', () => this.enterHome());
  }

  _friendlyError(msg) {
    if (msg.includes('Invalid login')) return 'Email ou mot de passe incorrect.';
    if (msg.includes('already registered')) return 'Cet email est déjà utilisé.';
    if (msg.includes('weak')) return 'Mot de passe trop court (min. 6 caractères).';
    if (msg.includes('network') || msg.includes('fetch')) return 'Pas de connexion internet.';
    return msg;
  }

  // ─── HOME ────────────────────────────────────────────────────────────────

  async enterHome() {
    this._stopVinyl();
    this.renderCategories();
    this.updateDailyProgress();
    await this.refreshScore();
    this.showScreen('home');
  }

  renderCategories() {
    const grid = this.$('categories-grid');
    grid.innerHTML = '';
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const count = QUESTIONS.filter(q => q.cat === key).length;
      const card = document.createElement('div');
      card.className = 'cat-card';
      card.style.setProperty('--cat-color', cat.color);
      card.style.setProperty('--cat-bg', cat.bg);
      card.innerHTML = `
        <div class="cat-card-top">
          <span class="cat-emoji">${cat.emoji}</span>
        </div>
        <div class="cat-card-body">
          <span class="cat-name">${cat.label}</span>
          <span class="cat-count">${count} cartes</span>
        </div>
        <div class="cat-perf"></div>
      `;
      card.addEventListener('click', () => this.startSession(key));
      grid.appendChild(card);
    });
  }

  updateDailyProgress() {
    const today = new Date().toDateString();
    const progress = JSON.parse(localStorage.getItem('cg_daily') || '{}');
    const count = progress[today] || 0;
    const goal = 20;
    this.$('daily-count').textContent = count;
    this.$('progress-fill').style.width = `${Math.min(100, (count / goal) * 100)}%`;
  }

  async refreshScore() {
    let score = null;
    if (auth.user) {
      score = await auth.getTotalScore();
    }
    if (score === null) {
      const local = JSON.parse(localStorage.getItem('cg_score') || '{"correct":0}');
      score = local.correct;
    }
    this.$('total-score').textContent = score;
  }

  bindHomeUI() {
    this.$('btn-logout').addEventListener('click', async () => {
      await auth.logout();
      this.showScreen('auth');
    });
  }

  // ─── CARDS SESSION ───────────────────────────────────────────────────────

  startSession(categoryKey) {
    if (categoryKey === 'musique') { this.startVinylSession(categoryKey); return; }
    if (categoryKey === 'science') { this.startLabSession(categoryKey); return; }
    if (categoryKey === 'histoire') { this.startHistoireSession(categoryKey); return; }
    this.currentCategory = categoryKey;
    this.deck = this._shuffle(QUESTIONS.filter(q => q.cat === categoryKey));
    this.currentIndex = 0;
    this.sessionCorrect = 0;
    this.isFlipped = false;
    this._animating = false;

    const cat = CATEGORIES[categoryKey];
    this.$('card-total').textContent = this.deck.length;
    this.$('card-current').textContent = 1;
    this.$('session-score').textContent = '0 ✓';

    this.showScreen('cards');
    this.$('screen-cards').classList.toggle('art-mode', categoryKey === 'art');
    this.renderStack();
    this.updateTapHint(true);
    this.$('card-actions').classList.remove('visible');
  }

  renderStack() {
    const stack = this.$('card-stack');
    stack.innerHTML = '';
    stack.classList.toggle('fan', this.currentCategory === 'art');
    const visible = Math.min(3, this.deck.length - this.currentIndex);
    for (let i = visible - 1; i >= 0; i--) {
      const q = this.deck[this.currentIndex + i];
      const el = this.createCardEl(q, this.currentIndex + i);
      if (i === 0) {
        el.classList.add('card-top');
        this.attachSwipe(el);
      } else {
        el.classList.add(`card-behind-${i}`);
      }
      stack.appendChild(el);
    }
  }

  createCardEl(q, idx) {
    if (q.cat === 'art') return this.createArtCard(q, idx);
    const cat = CATEGORIES[q.cat];
    const el = document.createElement('div');
    el.className = 'card';
    el.style.setProperty('--cat-color', cat.color);
    el.style.setProperty('--cat-bg', cat.bg);
    el.style.setProperty('--cat-text', cat.textColor);

    el.innerHTML = `
      <div class="card-inner">
        <div class="card-face card-front">
          <div class="ticket-head">
            <span class="ticket-cat">${cat.label.toUpperCase()}</span>
            <span class="ticket-num">${String(idx + 1).padStart(3, '0')}</span>
          </div>
          <div class="ticket-artwork">
            <span class="ticket-emoji">${cat.emoji}</span>
          </div>
          <div class="ticket-content">
            <p class="ticket-label-sm">QUESTION</p>
            <h2 class="ticket-question">${q.q}</h2>
          </div>
          <div class="ticket-perf">
            <div class="perf-notch perf-left"></div>
            <div class="perf-line"></div>
            <div class="perf-notch perf-right"></div>
          </div>
          <div class="ticket-foot">
            <span class="ticket-badge">● QUESTION</span>
            <div class="barcode">${this._barcode()}</div>
          </div>
        </div>

        <div class="card-face card-back">
          <div class="ticket-head">
            <span class="ticket-cat">${cat.label.toUpperCase()}</span>
            <span class="ticket-diff">${'★'.repeat(q.diff)}${'☆'.repeat(3 - q.diff)}</span>
          </div>
          <div class="ticket-content ticket-content-back">
            <p class="ticket-label-sm">RÉPONSE</p>
            <h2 class="ticket-answer">${q.a}</h2>
            <p class="ticket-exp">${q.exp}</p>
          </div>
          <div class="ticket-perf">
            <div class="perf-notch perf-left"></div>
            <div class="perf-line"></div>
            <div class="perf-notch perf-right"></div>
          </div>
          <div class="ticket-foot">
            <span class="ticket-badge">● RÉPONSE</span>
            <div class="barcode">${this._barcode()}</div>
          </div>
        </div>
      </div>
    `;
    return el;
  }

  createArtCard(q, idx) {
    const el = document.createElement('div');
    el.className = 'card card-art';
    el.innerHTML = `
      <div class="art-front">
        <div class="art-body">
          <div class="art-num">N°${String(idx + 1).padStart(2, '0')}</div>
          <h2 class="art-title">${q.title}</h2>
          <div class="art-answer">
            <span class="art-artist">${q.artist}</span>
            <p class="art-exp">${q.exp}</p>
          </div>
          <span class="art-hint-reveal">Touchez pour révéler →</span>
          <span class="art-kicker">● ART · PEINTURE</span>
        </div>
        <div class="art-image" style="background-image:url('${q.img}')">
          <span class="art-image-tag">${q.year}</span>
        </div>
        <div class="art-stub">
          <span class="art-stub-notch art-stub-notch-top"></span>
          <span class="art-stub-notch art-stub-notch-bot"></span>
          <div class="art-barcode">${this._barcode()}</div>
        </div>
      </div>
    `;
    return el;
  }

  flipCard() {
    const top = document.querySelector('.card-top');
    if (!top) return;
    this.isFlipped = !this.isFlipped;
    top.classList.toggle('flipped', this.isFlipped);
    this.$('card-actions').classList.toggle('visible', this.isFlipped);
    this.updateTapHint(!this.isFlipped);
  }

  updateTapHint(show) {
    const hint = this.$('tap-hint');
    hint.classList.toggle('visible', show);
  }

  recordAnswer(correct) {
    if (this._animating) return;           // ignore re-entry while a card flies out
    this._animating = true;

    const q = this.deck[this.currentIndex];
    if (correct) this.sessionCorrect++;
    this.$('session-score').textContent = `${this.sessionCorrect} ✓`;

    // Save progress (fire-and-forget — must not delay the animation)
    this._incrementDaily();
    this._saveLocalScore(correct);
    auth.saveProgress(q.id, q.cat, correct);

    this.animateOut(correct);
  }

  animateOut(correct) {
    const top = document.querySelector('.card-top');
    if (!top) return;

    top.style.transition = 'transform 0.4s cubic-bezier(0.55, 0, 1, 0.45), opacity 0.4s ease';
    const dir = correct ? 1 : -1;
    top.style.transform = `translateX(${dir * 110}%) rotate(${dir * 20}deg)`;
    top.style.opacity = '0';

    // Remove left/right hint
    this.$('hint-left').classList.remove('active');
    this.$('hint-right').classList.remove('active');

    setTimeout(() => {
      this.currentIndex++;
      this.isFlipped = false;
      this.$('card-actions').classList.remove('visible');
      this.updateTapHint(true);

      if (this.currentIndex >= this.deck.length) {
        this.showResults();
      } else {
        this.$('card-current').textContent = this.currentIndex + 1;
        this.renderStack();
      }
      this._animating = false;
    }, 380);
  }

  bindCardUI() {
    this.$('btn-back').addEventListener('click', () => this.enterHome());
    this.$('btn-correct').addEventListener('click', () => this.recordAnswer(true));
    this.$('btn-wrong').addEventListener('click', () => this.recordAnswer(false));
  }

  // ─── SWIPE ───────────────────────────────────────────────────────────────

  attachSwipe(el) {
    // Abort previous card's listeners if any
    if (this._swipeAbort) this._swipeAbort.abort();
    this._swipeAbort = new AbortController();
    const { signal } = this._swipeAbort;

    let startX = 0, startY = 0;
    let dragX = 0;
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
      dragX = 0;
      dragging = false;
      el.setPointerCapture(e.pointerId);
      el.style.transition = 'none';
    }, { signal });

    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      dragX = e.clientX - startX;
      const dragY = e.clientY - startY;
      // Carte révélée + intention verticale → scroll natif
      if (this.isFlipped && Math.abs(dragY) > Math.abs(dragX) && Math.abs(dragY) > 8) {
        el.releasePointerCapture(e.pointerId);
        return;
      }
      if (Math.abs(dragX) > 8) dragging = true;
      if (!dragging) return;

      const rot = dragX * 0.08;
      el.style.transform = `translateX(${dragX}px) rotate(${rot}deg)`;
      this.$('hint-right').classList.toggle('active', dragX > 60);
      this.$('hint-left').classList.toggle('active', dragX < -60);
    }, { signal });

    el.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      el.style.transition = 'transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      this.$('hint-left').classList.remove('active');
      this.$('hint-right').classList.remove('active');

      if (Math.abs(dragX) > 100) {
        const correct = dragX > 0;
        if (!this.isFlipped) {
          el.classList.add('flipped');
          setTimeout(() => this.recordAnswer(correct), 300);
        } else {
          this.recordAnswer(correct);
        }
      } else {
        el.style.transform = '';
      }
      dragging = false;
    }, { signal });

    el.addEventListener('click', () => {
      if (!dragging && Math.abs(dragX) < 8) this.flipCard();
    }, { signal });
  }

  // ─── RESULTS ─────────────────────────────────────────────────────────────

  showResults() {
    const total = this.deck.length;
    const correct = this.sessionCorrect;
    const pct = Math.round((correct / total) * 100);
    const cat = CATEGORIES[this.currentCategory];

    this.$('results-emoji').textContent = pct >= 80 ? '🏆' : pct >= 50 ? '💪' : '📚';
    this.$('results-category').textContent = cat.label;
    this.$('results-correct').textContent = correct;
    this.$('results-total').textContent = total;
    this.$('results-percentage').textContent = `${pct}%`;
    this.$('results-message').textContent = this._resultMessage(pct);

    this.showScreen('results');
  }

  _resultMessage(pct) {
    if (pct === 100) return 'Parfait ! Tu es imbattable 🔥';
    if (pct >= 80) return 'Excellent travail !';
    if (pct >= 60) return 'Très bon score, continue !';
    if (pct >= 40) return 'Bien, mais il reste du boulot !';
    return 'Révise encore, tu progresseras !';
  }

  bindResultsUI() {
    this.$('btn-replay').addEventListener('click', () => this.startSession(this.currentCategory));
    this.$('btn-home').addEventListener('click', () => this.enterHome());
  }

  // ─── LOCAL STORAGE ───────────────────────────────────────────────────────

  _incrementDaily() {
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem('cg_daily') || '{}');
    data[today] = (data[today] || 0) + 1;
    localStorage.setItem('cg_daily', JSON.stringify(data));
  }

  _saveLocalScore(correct) {
    const data = JSON.parse(localStorage.getItem('cg_score') || '{"correct":0,"total":0}');
    data.total++;
    if (correct) data.correct++;
    localStorage.setItem('cg_score', JSON.stringify(data));
  }

  // ─── UTILS ───────────────────────────────────────────────────────────────

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ─── VINYL SESSION ───────────────────────────────────────────────────────

  startVinylSession(categoryKey) {
    this.currentCategory = categoryKey;
    this.deck = this._shuffle(QUESTIONS.filter(q => q.cat === categoryKey));
    this.currentIndex = 0;
    this.sessionCorrect = 0;
    this._vinylAnswered = false;

    this.$('vinyl-total').textContent = this.deck.length;
    this.$('vinyl-score').textContent = '0 ✓';

    this.showScreen('vinyl');
    this.loadVinylSong(0, true);
  }

  loadVinylSong(index, first = false) {
    const song = this.deck[index];
    const wrap = this.$('vinyl-wrap');
    const disc = this.$('vinyl-disc');
    const stage = this.$('vinyl-stage');
    const arm = this.$('tonearm');

    this.$('vinyl-current').textContent = index + 1;
    this.$('vinyl-song-name').textContent = song.song;
    this.$('vinyl-artist-line').textContent = `${song.artist} · ${song.year}`;
    this.$('vlabel-artist').textContent = song.artist.toUpperCase();
    this.$('vlabel-song').textContent = song.song;
    this.$('vlabel-year').textContent = song.year;

    this.$('vinyl-exp').hidden = true;
    this.$('vinyl-tap-overlay').hidden = true;
    this._vinylAnswered = false;

    // Lift arm, fade vinyl, swap color, drop arm, play
    arm.classList.remove('playing');

    const doLoad = () => {
      disc.style.setProperty('--vinyl-color', song.vinylColor);
      stage.style.setProperty('--vinyl-color', song.vinylColor);
      wrap.classList.remove('changing');

      setTimeout(() => {
        arm.classList.add('playing');
        this._playVinyl(song.preview);
      }, 300);
    };

    if (first) {
      doLoad();
    } else {
      wrap.classList.add('changing');
      disc.classList.remove('spinning');
      setTimeout(doLoad, 280);
    }
  }

  _playVinyl(src) {
    const audio = this.$('vinyl-audio');
    const disc = this.$('vinyl-disc');
    audio.src = src;
    audio.volume = 0.75;
    audio.play()
      .then(() => {
        disc.classList.add('spinning');
        this.$('vinyl-tap-overlay').hidden = true;
      })
      .catch(() => {
        disc.classList.remove('spinning');
        this.$('vinyl-tap-overlay').hidden = false;
      });
  }

  _stopVinyl() {
    const audio = this.$('vinyl-audio');
    if (audio) { audio.pause(); audio.src = ''; }
    const disc = this.$('vinyl-disc');
    if (disc) disc.classList.remove('spinning');
    const arm = this.$('tonearm');
    if (arm) arm.classList.remove('playing');
  }

  vinylAnswer(correct) {
    if (this._vinylAnswered) return;
    this._vinylAnswered = true;

    const song = this.deck[this.currentIndex];
    if (correct) this.sessionCorrect++;
    this.$('vinyl-score').textContent = `${this.sessionCorrect} ✓`;

    this._incrementDaily();
    this._saveLocalScore(correct);
    auth.saveProgress(song.id, song.cat, correct);

    // Montre l'anecdote puis passe à la suivante
    const exp = this.$('vinyl-exp');
    exp.textContent = song.exp;
    exp.hidden = false;

    setTimeout(() => {
      this.currentIndex++;
      if (this.currentIndex >= this.deck.length) {
        this._stopVinyl();
        this.showResults();
      } else {
        this.loadVinylSong(this.currentIndex);
      }
    }, 2200);
  }

  // ─── LAB (SCIENCE) SESSION ───────────────────────────────────────────────

  startLabSession(categoryKey) {
    this.currentCategory = categoryKey;
    this.deck = this._shuffle(QUESTIONS.filter(q => q.cat === categoryKey));
    this.currentIndex = 0;
    this.sessionCorrect = 0;
    this._labRevealed = false;

    this.$('lab-total').textContent = this.deck.length;
    this.$('lab-score').textContent = '0 ✓';

    this.showScreen('lab');
    this.loadLabQuestion(0, true);
  }

  _labPalette() {
    return [
      ['#4FC3E8', '#2E7BC4'], // cyan
      ['#7BE38C', '#2FA84F'], // vert
      ['#E87BC8', '#B43A8E'], // magenta
      ['#F5C45A', '#D48A1E'], // ambre
      ['#B68BE8', '#7A4FC4'], // violet
      ['#F58A6A', '#D4451E'], // orange-rouge
    ];
  }

  loadLabQuestion(index, first = false) {
    const q = this.deck[index];
    const stage = this.$('lab-beaker-stage');
    const beaker = this.$('lab-beaker');
    const [light, deep] = this._labPalette()[index % this._labPalette().length];

    this.$('lab-current').textContent = index + 1;
    this.$('lab-question').textContent = q.q;

    beaker.style.setProperty('--lab-color', light);
    beaker.style.setProperty('--lab-deep', deep);
    stage.style.setProperty('--lab-color', light);
    this.$('screen-lab').style.setProperty('--lab-color', light);

    // Reset état
    beaker.classList.remove('filling', 'bubbling');
    stage.classList.remove('lit');
    this.$('lab-answer').hidden = true;
    this.$('lab-actions').hidden = true;
    this.$('lab-tap-hint').classList.remove('hidden');
    this._labRevealed = false;

    const reveal = () => {
      const wrap = this.$('lab-arena');
      if (wrap) wrap.style.opacity = '1';
    };

    if (first) {
      reveal();
    } else {
      const arena = this.$('lab-arena');
      arena.style.transition = 'opacity 0.25s ease';
      arena.style.opacity = '0';
      setTimeout(() => { arena.style.opacity = '1'; }, 260);
    }
  }

  revealLab() {
    if (this._labRevealed) return;
    this._labRevealed = true;

    const q = this.deck[this.currentIndex];
    const beaker = this.$('lab-beaker');
    const stage = this.$('lab-beaker-stage');

    this.$('lab-tap-hint').classList.add('hidden');
    beaker.classList.add('filling', 'bubbling');
    stage.classList.add('lit');

    // À la fin du remplissage : on dévoile la réponse
    setTimeout(() => {
      this.$('lab-answer-text').textContent = q.a;
      this.$('lab-exp').textContent = q.exp;
      this.$('lab-answer').hidden = false;
      this.$('lab-actions').hidden = false;
      beaker.classList.remove('bubbling');
    }, 1100);
  }

  labAnswer(correct) {
    if (!this._labRevealed) return;
    if (this._labAnimating) return;
    this._labAnimating = true;

    const q = this.deck[this.currentIndex];
    if (correct) this.sessionCorrect++;
    this.$('lab-score').textContent = `${this.sessionCorrect} ✓`;

    this._incrementDaily();
    this._saveLocalScore(correct);
    auth.saveProgress(q.id, q.cat, correct);

    this.currentIndex++;
    if (this.currentIndex >= this.deck.length) {
      this.showResults();
      this._labAnimating = false;
    } else {
      this.loadLabQuestion(this.currentIndex);
      setTimeout(() => { this._labAnimating = false; }, 280);
    }
  }

  bindLabUI() {
    this.$('btn-back-lab').addEventListener('click', () => this.enterHome());
    this.$('lab-beaker-stage').addEventListener('click', () => this.revealLab());
    this.$('btn-lab-wrong').addEventListener('click', () => this.labAnswer(false));
    this.$('btn-lab-correct').addEventListener('click', () => this.labAnswer(true));
  }

  // ─── HISTOIRE (ÉVÉNEMENTS) SESSION ───────────────────────────────────────

  startHistoireSession(categoryKey) {
    this.currentCategory = categoryKey;
    this.deck = this._shuffle(QUESTIONS.filter(q => q.cat === categoryKey));
    this.currentIndex = 0;
    this.sessionCorrect = 0;
    this._histRevealed = false;
    this._histAnimating = false;

    this.$('hist-total').textContent = this.deck.length;
    this.$('hist-current').textContent = 1;
    this.$('hist-score').textContent = '0 ✓';

    this.showScreen('histoire');
    this.loadHistoireCard(0, true);
  }

  loadHistoireCard(index, first = false) {
    const q = this.deck[index];
    const card = this.$('hist-card');

    this.$('hist-current').textContent = index + 1;
    this.$('hist-image').style.backgroundImage = `url('${q.img}')`;
    this.$('hist-title').textContent = q.event;
    this.$('hist-era').textContent = q.era;
    this.$('hist-place').textContent = q.place;
    this.$('hist-type').textContent = q.type;
    this.$('hist-mark-top').textContent = q.markTop || '';
    this.$('hist-mark-bot').textContent = q.markBot || '';
    this.$('hist-year-vert').textContent = q.markTop || '';
    this.$('hist-desc').textContent = q.exp;

    // Trait de séparation des dates seulement si l'événement a une fin
    card.querySelector('.hist-mark-line').style.display = q.markBot ? '' : 'none';

    // Reset état
    card.classList.remove('revealed');
    card.scrollTop = 0;
    const panel = card.querySelector('.hist-panel');
    if (panel) panel.scrollTop = 0;
    this.$('hist-actions').hidden = true;
    this._histRevealed = false;

    if (!first) {
      const arena = this.$('hist-arena');
      arena.style.opacity = '0';
      setTimeout(() => { arena.style.opacity = '1'; }, 240);
    }
  }

  revealHistoire() {
    if (this._histRevealed) return;
    this._histRevealed = true;
    this.$('hist-card').classList.add('revealed');
    this.$('hist-actions').hidden = false;
  }

  histoireAnswer(correct) {
    if (!this._histRevealed) return;
    if (this._histAnimating) return;
    this._histAnimating = true;

    const q = this.deck[this.currentIndex];
    if (correct) this.sessionCorrect++;
    this.$('hist-score').textContent = `${this.sessionCorrect} ✓`;

    this._incrementDaily();
    this._saveLocalScore(correct);
    auth.saveProgress(q.id, q.cat, correct);

    this.currentIndex++;
    if (this.currentIndex >= this.deck.length) {
      this.showResults();
      this._histAnimating = false;
    } else {
      this.loadHistoireCard(this.currentIndex);
      setTimeout(() => { this._histAnimating = false; }, 260);
    }
  }

  bindHistoireUI() {
    this.$('btn-back-hist').addEventListener('click', () => this.enterHome());
    this.$('hist-card').addEventListener('click', () => this.revealHistoire());
    this.$('btn-hist-wrong').addEventListener('click', () => this.histoireAnswer(false));
    this.$('btn-hist-correct').addEventListener('click', () => this.histoireAnswer(true));
  }

  bindVinylUI() {
    this.$('btn-back-vinyl').addEventListener('click', () => this.enterHome());
    this.$('btn-vinyl-wrong').addEventListener('click', () => this.vinylAnswer(false));
    this.$('btn-vinyl-correct').addEventListener('click', () => this.vinylAnswer(true));

    // Tap sur le vinyl : play/pause
    this.$('vinyl-wrap').addEventListener('click', () => {
      const audio = this.$('vinyl-audio');
      const disc = this.$('vinyl-disc');
      if (!audio.src) return;
      if (audio.paused) {
        audio.play().then(() => {
          disc.classList.add('spinning');
          this.$('vinyl-tap-overlay').hidden = true;
        }).catch(() => {});
      } else {
        audio.pause();
        disc.classList.remove('spinning');
      }
    });

    // Tap-to-play overlay
    this.$('vinyl-tap-overlay').addEventListener('click', e => {
      e.stopPropagation();
      const song = this.deck[this.currentIndex];
      if (song) this._playVinyl(song.preview);
    });
  }

  _barcode() {
    const bars = [];
    const pattern = [3,1,2,1,3,2,1,1,2,3,1,2,1,3,1,2,1,1,3,2,1,3,1,2,3,1,1,2,1,3,2,1];
    pattern.forEach((w, i) => {
      const h = i % 5 === 0 ? '100%' : i % 3 === 0 ? '75%' : '55%';
      bars.push(`<div class="bar" style="width:${w}px;height:${h}"></div>`);
    });
    return bars.join('');
  }
}

document.addEventListener('DOMContentLoaded', () => new CultureG());
