import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CollectionType, DEFAULT_ENABLED_COLLECTIONS, normalizeEnabledCollections } from './collection-types';

export const PUBLIC_PROFILE_FIELDS = 'id,auth0_id,username,avatar_url,enabled_collections';

export interface Profile {
  id: string;
  auth0_id: string;
  username: string;
  avatar_url: string | null;
  enabled_collections: CollectionType[];
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  /** undefined = not yet checked, null = no profile exists, Profile = loaded */
  public readonly current = signal<Profile | null | undefined>(undefined);

  constructor(private supabase: SupabaseService) {}

  public async loadForCurrentUser(): Promise<Profile | null> {
    const userId = await this.supabase.getCurrentUserId();
    if (!userId) return null;
    return this.loadByAuth0Id(userId);
  }

  public async loadByAuth0Id(auth0Id: string): Promise<Profile | null> {
    const client = await this.supabase.getClient();
    if (!client) return null;
    const { data, error } = await client.from('profiles')
      .select(PUBLIC_PROFILE_FIELDS)
      .eq('auth0_id', auth0Id)
      .maybeSingle();
    if (error) {
      console.warn('Failed to load profile by Auth0 id', error);
      return null;
    }
    const profile = this.normalizeProfile(data);
    if (auth0Id === await this.supabase.getCurrentUserId()) {
      this.current.set(profile);
    }
    return profile;
  }

  public async getByUsername(username: string): Promise<Profile | null> {
    const client = await this.supabase.getClient();
    if (!client) return null;
    const { data, error } = await client.from('profiles')
      .select(PUBLIC_PROFILE_FIELDS)
      .ilike('username', username)
      .maybeSingle();
    if (error) {
      console.warn('Failed to load profile by username', error);
      return null;
    }
    return this.normalizeProfile(data);
  }

  public async searchByUsername(query: string): Promise<Profile[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data, error } = await client.from('profiles')
      .select(PUBLIC_PROFILE_FIELDS)
      .ilike('username', `%${query}%`)
      .limit(10);
    if (error) {
      console.warn('Failed to search profiles', error);
      return [];
    }
    return Array.isArray(data) ? data.map((profile) => this.normalizeProfile(profile)).filter((profile): profile is Profile => profile !== null) : [];
  }

  public async create(auth0Id: string, username: string, avatarUrl: string | null, email: string | null): Promise<Profile> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const { data, error } = await client.from('profiles')
      .insert({ auth0_id: auth0Id, username, avatar_url: avatarUrl, enabled_collections: DEFAULT_ENABLED_COLLECTIONS })
      .select(PUBLIC_PROFILE_FIELDS)
      .single();
    if (error) {
      throw this.describeWriteError(error, 'profiles');
    }
    const profile = this.normalizeProfile(data);
    if (!profile) {
      throw new Error('Profile response was invalid.');
    }
    this.current.set(profile);
    await this.syncContactEmail(auth0Id, email);
    return profile;
  }

  public async updateEnabledCollections(auth0Id: string, enabledCollections: CollectionType[]): Promise<Profile> {
    const client = await this.supabase.getClient();
    if (!client) {
      throw new Error('Supabase unavailable');
    }

    const normalized = normalizeEnabledCollections(enabledCollections);
    const { data, error } = await client.from('profiles')
      .update({ enabled_collections: normalized })
      .eq('auth0_id', auth0Id)
      .select(PUBLIC_PROFILE_FIELDS)
      .single();

    if (error) {
      throw this.describeWriteError(error, 'profiles');
    }

    const profile = this.normalizeProfile(data);
    if (!profile) {
      throw new Error('Profile response was invalid.');
    }

    this.current.set(profile);
    return profile;
  }

  public async syncContactEmail(auth0Id: string, email: string | null): Promise<void> {
    if (!email) {
      return;
    }

    const client = await this.supabase.getClient();
    if (!client) {
      return;
    }

    const { error } = await client.from('profiles')
      .update({ email })
      .eq('auth0_id', auth0Id);

    if (error) {
      console.warn('Failed to sync profile email', error);
    }
  }

  public async uploadAvatar(auth0Id: string, file: File): Promise<string> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${this.storageKeySegment(auth0Id)}/avatar.${ext}`;
    const { error } = await client.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) {
      throw this.describeWriteError(error, 'avatars');
    }
    return client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }

  private describeWriteError(error: { code?: string; message?: string }, target: 'profiles' | 'avatars'): Error {
    const message = error.message ?? 'Supabase request failed.';

    if (error.code === 'PGRST205' || message.includes("public.profiles")) {
      return new Error('Supabase profiles table is missing.');
    }

    if (target === 'avatars' && (message.toLowerCase().includes('bucket') || message.toLowerCase().includes('avatars'))) {
      return new Error('Supabase avatars bucket is missing or blocked.');
    }

    if (target === 'avatars' && message.toLowerCase().includes('invalid key')) {
      return new Error('Supabase rejected the avatar storage path.');
    }

    if (error.code === '23505' || message.toLowerCase().includes('unique')) {
      return new Error('Username must be unique.');
    }

    return new Error(message);
  }

  private normalizeProfile(value: unknown): Profile | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;

    if (typeof record['id'] !== 'string' || typeof record['auth0_id'] !== 'string' || typeof record['username'] !== 'string') {
      return null;
    }

    return {
      id: record['id'],
      auth0_id: record['auth0_id'],
      username: record['username'],
      avatar_url: typeof record['avatar_url'] === 'string' ? record['avatar_url'] : null,
      enabled_collections: normalizeEnabledCollections(record['enabled_collections'] ?? DEFAULT_ENABLED_COLLECTIONS)
    };
  }

  private storageKeySegment(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}
