import { Injectable, signal } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Movie } from './movies.data';

type StorageMode = 'loading' | 'remote' | 'local' | 'error';

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseKey: string;
  stateTable: string;
  stateId: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  supabaseUrl: '',
  supabaseKey: '',
  stateTable: 'app_state',
  stateId: 'default'
};

const LOCAL_CACHE_KEY = 'bluray-collection';

@Injectable({ providedIn: 'root' })
export class CollectionStorageService {
  public readonly mode = signal<StorageMode>('loading');
  public readonly message = signal('Connecting storage...');

  private client: SupabaseClient | null = null;
  private config: RuntimeConfig = DEFAULT_CONFIG;
  private initialized = false;
  private saveQueue = Promise.resolve();

  public async loadMovies(initialMovies: Movie[]): Promise<Movie[]> {
    const localMovies = this.readLocalMovies();

    await this.initialize();

    if (!this.client) {
      const fallback = localMovies ?? initialMovies;
      this.writeLocalMovies(fallback);
      return fallback;
    }

    try {
      const { data, error } = await this.client
        .from(this.config.stateTable)
        .select('movies')
        .eq('id', this.config.stateId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const remoteMovies = data?.['movies'];

      if (this.isMovieArray(remoteMovies)) {
        this.writeLocalMovies(remoteMovies);
        this.mode.set('remote');
        this.message.set('Supabase sync active.');
        return remoteMovies;
      }

      const seedMovies = localMovies ?? initialMovies;
      await this.saveRemote(seedMovies);
      return seedMovies;
    } catch (error) {
      console.error('Failed to load Supabase state, falling back to local cache.', error);

      const fallback = localMovies ?? initialMovies;
      this.writeLocalMovies(fallback);
      this.mode.set('error');
      this.message.set('Supabase unavailable. Using local cache.');
      return fallback;
    }
  }

  public saveMovies(movies: Movie[]) {
    const snapshot = movies.map((movie) => ({ ...movie }));
    this.writeLocalMovies(snapshot);

    this.saveQueue = this.saveQueue
      .then(() => this.saveRemote(snapshot))
      .catch((error) => {
        console.error('Failed to sync Supabase state.', error);
      });

    return this.saveQueue;
  }

  private async initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.config = await this.loadRuntimeConfig();

    if (!this.config.supabaseUrl || !this.config.supabaseKey) {
      this.mode.set('local');
      this.message.set('Local-only mode. Configure public/app-config.json to enable Supabase.');
      return;
    }

    this.client = createClient(this.config.supabaseUrl, this.config.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    this.mode.set('loading');
    this.message.set('Connecting to Supabase...');
  }

  private async loadRuntimeConfig(): Promise<RuntimeConfig> {
    try {
      const configUrl = new URL('app-config.json', document.baseURI).toString();
      const response = await fetch(configUrl, { cache: 'no-store' });

      if (!response.ok) {
        return DEFAULT_CONFIG;
      }

      const data = await response.json();

      return {
        supabaseUrl: typeof data.supabaseUrl === 'string' ? data.supabaseUrl.trim() : '',
        supabaseKey:
          typeof data.supabaseKey === 'string'
            ? data.supabaseKey.trim()
            : typeof data.supabaseAnonKey === 'string'
              ? data.supabaseAnonKey.trim()
              : '',
        stateTable:
          typeof data.stateTable === 'string' && data.stateTable.trim()
            ? data.stateTable.trim()
            : DEFAULT_CONFIG.stateTable,
        stateId:
          typeof data.stateId === 'string' && data.stateId.trim()
            ? data.stateId.trim()
            : DEFAULT_CONFIG.stateId
      };
    } catch (error) {
      console.error('Failed to load runtime config.', error);
      return DEFAULT_CONFIG;
    }
  }

  private async saveRemote(movies: Movie[]) {
    if (!this.client) {
      return;
    }

    const { error } = await this.client.from(this.config.stateTable).upsert(
      {
        id: this.config.stateId,
        movies,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'id'
      }
    );

    if (error) {
      this.mode.set('error');
      this.message.set('Saved locally. Supabase sync failed.');
      throw error;
    }

    this.mode.set('remote');
    this.message.set('Supabase sync active.');
  }

  private readLocalMovies(): Movie[] | null {
    try {
      const saved = localStorage.getItem(LOCAL_CACHE_KEY);

      if (!saved) {
        return null;
      }

      const parsed = JSON.parse(saved);
      return this.isMovieArray(parsed) ? parsed : null;
    } catch (error) {
      console.error('Failed to read local cache.', error);
      return null;
    }
  }

  private writeLocalMovies(movies: Movie[]) {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(movies));
  }

  private isMovieArray(value: unknown): value is Movie[] {
    return (
      Array.isArray(value) &&
      value.every((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }

        const movie = item as Movie;

        return (
          typeof movie.id === 'number' &&
          typeof movie.title === 'string' &&
          typeof movie.notes === 'string'
        );
      })
    );
  }
}
