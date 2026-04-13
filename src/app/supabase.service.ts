import { Injectable, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { catchError, filter, firstValueFrom, map, of, take, timeout } from 'rxjs';

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseKey: string;
  stateTable: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  supabaseUrl: '',
  supabaseKey: '',
  stateTable: 'user_app_state',
};

/**
 * Shared Supabase client authenticated via Auth0 ID token.
 * Used by CollectionStorageService, ProfileService and FriendsService.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly auth = inject(AuthService);

  private _client: SupabaseClient | null = null;
  private _config: RuntimeConfig = DEFAULT_CONFIG;
  private initPromise: Promise<void> | null = null;

  public get stateTable() { return this._config.stateTable; }

  public async getClient(): Promise<SupabaseClient | null> {
    if (!this.initPromise) this.initPromise = this.init();
    await this.initPromise;
    return this._client;
  }

  /** Auth0 sub claim for the current user, or null if not authenticated. */
  public async getCurrentUserId(): Promise<string | null> {
    return firstValueFrom(
      this.auth.idTokenClaims$.pipe(
        map(claims => {
          const sub = (claims as Record<string, unknown> | null | undefined)?.['sub'];
          return typeof sub === 'string' ? sub : null;
        }),
        filter((id): id is string => id !== null),
        take(1),
        timeout({ first: 5000 }),
        catchError(() => of(null))
      )
    );
  }

  private async init(): Promise<void> {
    try {
      const res = await fetch(new URL('app-config.json', document.baseURI).toString(), { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const url = typeof data.supabaseUrl === 'string' ? data.supabaseUrl.trim() : '';
      const key = typeof data.supabaseKey === 'string' ? data.supabaseKey.trim()
        : typeof data.supabaseAnonKey === 'string' ? data.supabaseAnonKey.trim() : '';
      if (!url || !key) return;
      if (typeof data.stateTable === 'string' && data.stateTable.trim()) {
        this._config = { ...this._config, stateTable: data.stateTable.trim() };
      }
      this._config = { supabaseUrl: url, supabaseKey: key, stateTable: this._config.stateTable };
      this._client = createClient(url, key, {
        accessToken: async () => this.getToken(),
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch {
      // config unavailable
    }
  }

  private async getToken(): Promise<string | null> {
    return firstValueFrom(
      this.auth.idTokenClaims$.pipe(
        map(claims => {
          const raw = (claims as Record<string, unknown> | null | undefined)?.['__raw'];
          return typeof raw === 'string' ? raw : null;
        }),
        filter((t): t is string => t !== null),
        take(1),
        timeout({ first: 5000 }),
        catchError(() => of(null))
      )
    );
  }
}
