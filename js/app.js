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

    let startX = 0;
    let dragX = 0;
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      dragX = 0;
      dragging = false;
      el.setPointerCapture(e.pointerId);
      el.style.transition = 'none';
    }, { signal });

    el.addEventListener('pointermove', (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      dragX = e.clientX - startX;
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
