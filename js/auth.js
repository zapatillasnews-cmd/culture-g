class AuthManager {
  constructor() {
    this.client = null;
    this.user = null;
    this._init();
  }

  _init() {
    if (
      typeof supabase !== 'undefined' &&
      SUPABASE_URL !== 'VOTRE_SUPABASE_URL'
    ) {
      this.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  get isConfigured() {
    return !!this.client;
  }

  async getSession() {
    if (!this.isConfigured) return null;
    try {
      const { data: { session } } = await this.client.auth.getSession();
      this.user = session?.user ?? null;
      return session;
    } catch { return null; }
  }

  async login(email, password) {
    if (!this.isConfigured) throw new Error('Supabase non configuré');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data.user;
  }

  async register(email, password) {
    if (!this.isConfigured) throw new Error('Supabase non configuré');
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    this.user = data.user;
    return data.user;
  }

  async logout() {
    if (!this.isConfigured) return;
    await this.client.auth.signOut();
    this.user = null;
  }

  async saveProgress(cardId, category, correct) {
    if (!this.isConfigured || !this.user) return;
    try {
      await this.client.from('user_progress').insert({
        user_id: this.user.id,
        card_id: cardId,
        category,
        correct,
      });
    } catch { /* silent — offline is fine */ }
  }

  async getTotalScore() {
    if (!this.isConfigured || !this.user) return null;
    try {
      const { data } = await this.client
        .from('user_progress')
        .select('correct')
        .eq('user_id', this.user.id);
      if (!data) return null;
      return data.filter(r => r.correct).length;
    } catch { return null; }
  }
}

const auth = new AuthManager();
