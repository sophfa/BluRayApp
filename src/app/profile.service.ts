import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Profile {
  id: string;
  auth0_id: string;
  username: string;
  avatar_url: string | null;
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
    const { data, error } = await client.from('profiles').select('*').eq('auth0_id', auth0Id).maybeSingle();
    if (error) {
      console.warn('Failed to load profile by Auth0 id', error);
      return null;
    }
    const profile = (data as Profile | null) ?? null;
    if (auth0Id === await this.supabase.getCurrentUserId()) {
      this.current.set(profile);
    }
    return profile;
  }

  public async getByUsername(username: string): Promise<Profile | null> {
    const client = await this.supabase.getClient();
    if (!client) return null;
    const { data, error } = await client.from('profiles').select('*').ilike('username', username).maybeSingle();
    if (error) {
      console.warn('Failed to load profile by username', error);
      return null;
    }
    return (data as Profile | null) ?? null;
  }

  public async searchByUsername(query: string): Promise<Profile[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data, error } = await client.from('profiles').select('*').ilike('username', `%${query}%`).limit(10);
    if (error) {
      console.warn('Failed to search profiles', error);
      return [];
    }
    return (data as Profile[]) ?? [];
  }

  public async create(auth0Id: string, username: string, avatarUrl: string | null): Promise<Profile> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const { data, error } = await client.from('profiles')
      .insert({ auth0_id: auth0Id, username, avatar_url: avatarUrl })
      .select().single();
    if (error) {
      throw this.describeWriteError(error, 'profiles');
    }
    const profile = data as Profile;
    this.current.set(profile);
    return profile;
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

  private storageKeySegment(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}
