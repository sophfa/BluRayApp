import { Injectable, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { catchError, filter, firstValueFrom, map, of, take, timeout } from 'rxjs';
import { Movie } from './movies.data';

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseKey: string;
  stateTable: string;
}

interface AuthIdentity {
  token: string;
  userId: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  supabaseUrl: '',
  supabaseKey: '',
  stateTable: 'user_app_state',
};

@Injectable({ providedIn: 'root' })
export class CollectionStorageService {
  private readonly auth = inject(AuthService);
  private client: SupabaseClient | null = null;
  private config: RuntimeConfig = DEFAULT_CONFIG;
  private initialized = false;
  private saveQueues: Record<string, Promise<void>> = {};

  public async loadMovies(collectionKey: string, initialMovies: Movie[]): Promise<Movie[]> {
    await this.initialize();
    const authIdentity = await this.getAuthIdentity();
    const localKey = this.getLocalKey(collectionKey, authIdentity?.userId);
    const localMovies = this.readLocalWithLegacyFallback(collectionKey, localKey);

    if (!this.client || !authIdentity) {
      const fallback = localMovies ?? initialMovies;
      this.writeLocal(localKey, fallback);
      return fallback;
    }

    try {
      const { data, error } = await this.client
        .from(this.config.stateTable)
        .select('movies')
        .eq('owner_user_id', authIdentity.userId)
        .eq('collection_key', collectionKey)
        .maybeSingle();

      if (error) throw error;

      const remoteMovies = data?.['movies'];

      if (this.isMovieArray(remoteMovies)) {
        this.writeLocal(localKey, remoteMovies);
        return remoteMovies;
      }

      const seedMovies = localMovies ?? initialMovies;
      await this.saveRemote(collectionKey, authIdentity.userId, seedMovies);
      this.writeLocal(localKey, seedMovies);
      return seedMovies;
    } catch (error) {
      console.warn('Supabase unavailable. Using local cache instead.', error);
      const fallback = localMovies ?? initialMovies;
      this.writeLocal(localKey, fallback);
      return fallback;
    }
  }

  /** Load another user's collection (read-only, for friend view). */
  public async loadMoviesForUser(ownerUserId: string, collectionKey: string): Promise<Movie[]> {
    await this.initialize();
    if (!this.client) return [];
    const { data, error } = await this.client
      .from(this.config.stateTable)
      .select('movies')
      .eq('owner_user_id', ownerUserId)
      .eq('collection_key', collectionKey)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return this.isMovieArray(data?.['movies']) ? data!['movies'] : [];
  }

  public async loadTagColors(collectionKey: string): Promise<Record<string, unknown>> {
    await this.initialize();
    const authIdentity = await this.getAuthIdentity();
    if (!this.client || !authIdentity) return {};
    try {
      const { data, error } = await this.client
        .from(this.config.stateTable)
        .select('tag_colors')
        .eq('owner_user_id', authIdentity.userId)
        .eq('collection_key', collectionKey)
        .maybeSingle();
      if (error) throw error;
      const colors = data?.['tag_colors'];
      return (colors && typeof colors === 'object' && !Array.isArray(colors))
        ? colors as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  public async loadHiddenIds(collectionKey: string): Promise<Set<number>> {
    await this.initialize();
    const authIdentity = await this.getAuthIdentity();
    const key = this.getHiddenKey(collectionKey, authIdentity?.userId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((v): v is number => typeof v === 'number'));
    } catch {
      return new Set();
    }
  }

  public async saveHiddenIds(collectionKey: string, ids: Set<number>): Promise<void> {
    await this.initialize();
    const authIdentity = await this.getAuthIdentity();
    const key = this.getHiddenKey(collectionKey, authIdentity?.userId);
    localStorage.setItem(key, JSON.stringify([...ids]));
  }

  public saveTagColors(collectionKey: string, colors: Record<string, unknown>): Promise<void> {
    const queueKey = `${collectionKey}:colors`;
    if (!this.saveQueues[queueKey]) {
      this.saveQueues[queueKey] = Promise.resolve();
    }
    this.saveQueues[queueKey] = this.saveQueues[queueKey]
      .then(async () => {
        const authIdentity = await this.getAuthIdentity();
        if (!this.client || !authIdentity) return;
        const { error } = await this.client
          .from(this.config.stateTable)
          .update({ tag_colors: colors, updated_at: new Date().toISOString() })
          .eq('owner_user_id', authIdentity.userId)
          .eq('collection_key', collectionKey);
        if (error) console.warn('CollectionStorageService: failed to save tag colors', error);
      })
      .catch(err => console.warn('CollectionStorageService: tag color sync failed', err));
    return this.saveQueues[queueKey];
  }

  public saveMovies(collectionKey: string, movies: Movie[]) {
    const snapshot = movies.map(m => ({ ...m }));

    if (!this.saveQueues[collectionKey]) {
      this.saveQueues[collectionKey] = Promise.resolve();
    }

    this.saveQueues[collectionKey] = this.saveQueues[collectionKey]
      .then(async () => {
        const authIdentity = await this.getAuthIdentity();
        const localKey = this.getLocalKey(collectionKey, authIdentity?.userId);
        this.writeLocal(localKey, snapshot);

        if (!this.client || !authIdentity) {
          console.warn('Saved locally only. Auth0 identity or Supabase client unavailable.');
          return;
        }

        await this.saveRemote(collectionKey, authIdentity.userId, snapshot);
      })
      .catch(error => { console.warn('Saved locally, but Supabase sync failed.', error); });

    return this.saveQueues[collectionKey];
  }

  private async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.config = await this.loadRuntimeConfig();

    if (!this.config.supabaseUrl || !this.config.supabaseKey) {
      console.warn('Supabase is not configured. Running in local-only mode.');
      return;
    }

    this.client = createClient(this.config.supabaseUrl, this.config.supabaseKey, {
      accessToken: async () => (await this.getAuthIdentity())?.token ?? null,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }

  private async loadRuntimeConfig(): Promise<RuntimeConfig> {
    try {
      const configUrl = new URL('app-config.json', document.baseURI).toString();
      const response = await fetch(configUrl, { cache: 'no-store' });
      if (!response.ok) return DEFAULT_CONFIG;
      const data = await response.json();
      return {
        supabaseUrl: typeof data.supabaseUrl === 'string' ? data.supabaseUrl.trim() : '',
        supabaseKey: typeof data.supabaseKey === 'string' ? data.supabaseKey.trim()
          : typeof data.supabaseAnonKey === 'string' ? data.supabaseAnonKey.trim() : '',
        stateTable: typeof data.stateTable === 'string' && data.stateTable.trim()
          ? data.stateTable.trim() : DEFAULT_CONFIG.stateTable,
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  private async saveRemote(collectionKey: string, ownerUserId: string, movies: Movie[]) {
    if (!this.client) return;
    const { error } = await this.client.from(this.config.stateTable).upsert(
      {
        owner_user_id: ownerUserId,
        collection_key: collectionKey,
        movies,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'owner_user_id,collection_key' }
    );
    if (error) {
      throw error;
    }
  }

  private async getAuthIdentity(): Promise<AuthIdentity | null> {
    return firstValueFrom(
      this.auth.idTokenClaims$.pipe(
        map((claims) => this.parseAuthIdentity(claims)),
        filter((identity): identity is AuthIdentity => identity !== null),
        take(1),
        timeout({ first: 5000 }),
        catchError(() => of(null))
      )
    );
  }

  private parseAuthIdentity(claims: unknown): AuthIdentity | null {
    if (!claims || typeof claims !== 'object') {
      return null;
    }

    const raw = (claims as Record<string, unknown>)['__raw'];
    const sub = (claims as Record<string, unknown>)['sub'];

    if (typeof raw !== 'string' || typeof sub !== 'string') {
      return null;
    }

    return { token: raw, userId: sub };
  }

  private getHiddenKey(collectionKey: string, userId?: string): string {
    return userId
      ? `hidden-ids:${encodeURIComponent(userId)}:${collectionKey}`
      : `hidden-ids:${collectionKey}`;
  }

  private getLocalKey(collectionKey: string, userId?: string) {
    if (!userId) {
      return collectionKey;
    }

    return `collection-cache:${encodeURIComponent(userId)}:${collectionKey}`;
  }

  private readLocalWithLegacyFallback(legacyKey: string, scopedKey: string): Movie[] | null {
    const scoped = this.readLocal(scopedKey);
    if (scoped) {
      return scoped;
    }

    if (scopedKey === legacyKey) {
      return null;
    }

    const legacy = this.readLocal(legacyKey);
    if (legacy) {
      this.writeLocal(scopedKey, legacy);
    }
    return legacy;
  }

  private readLocal(key: string): Movie[] | null {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return this.isMovieArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeLocal(key: string, movies: Movie[]) {
    localStorage.setItem(key, JSON.stringify(movies));
  }

  private isMovieArray(value: unknown): value is Movie[] {
    return Array.isArray(value) && value.every(item => {
      if (!item || typeof item !== 'object') return false;
      const m = item as Movie;
      const hasValidTags = m.tags === undefined || (Array.isArray(m.tags) && m.tags.every(tag => typeof tag === 'string'));
      return typeof m.id === 'number' && typeof m.title === 'string' && typeof m.notes === 'string' && hasValidTags;
    });
  }
}
