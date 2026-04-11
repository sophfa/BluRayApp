import { Injectable } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Movie } from './movies.data';

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseKey: string;
  stateTable: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  supabaseUrl: '',
  supabaseKey: '',
  stateTable: 'app_state',
};

@Injectable({ providedIn: 'root' })
export class CollectionStorageService {
  private client: SupabaseClient | null = null;
  private config: RuntimeConfig = DEFAULT_CONFIG;
  private initialized = false;
  private saveQueues: Record<string, Promise<void>> = {};

  public async loadMovies(collectionKey: string, initialMovies: Movie[]): Promise<Movie[]> {
    const localMovies = this.readLocal(collectionKey);

    await this.initialize();

    if (!this.client) {
      const fallback = localMovies ?? initialMovies;
      this.writeLocal(collectionKey, fallback);
      return fallback;
    }

    try {
      const { data, error } = await this.client
        .from(this.config.stateTable)
        .select('movies')
        .eq('id', collectionKey)
        .maybeSingle();

      if (error) throw error;

      const remoteMovies = data?.['movies'];

      if (this.isMovieArray(remoteMovies)) {
        this.writeLocal(collectionKey, remoteMovies);
        return remoteMovies;
      }

      const seedMovies = localMovies ?? initialMovies;
      await this.saveRemote(collectionKey, seedMovies);
      return seedMovies;
    } catch (error) {
      console.warn('Supabase unavailable. Using local cache instead.', error);
      const fallback = localMovies ?? initialMovies;
      this.writeLocal(collectionKey, fallback);
      return fallback;
    }
  }

  public saveMovies(collectionKey: string, movies: Movie[]) {
    const snapshot = movies.map(m => ({ ...m }));
    this.writeLocal(collectionKey, snapshot);

    if (!this.saveQueues[collectionKey]) {
      this.saveQueues[collectionKey] = Promise.resolve();
    }

    this.saveQueues[collectionKey] = this.saveQueues[collectionKey]
      .then(() => this.saveRemote(collectionKey, snapshot))
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

  private async saveRemote(collectionKey: string, movies: Movie[]) {
    if (!this.client) return;
    const { error } = await this.client.from(this.config.stateTable).upsert(
      { id: collectionKey, movies, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    if (error) {
      throw error;
    }
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
      return typeof m.id === 'number' && typeof m.title === 'string' && typeof m.notes === 'string';
    });
  }
}
