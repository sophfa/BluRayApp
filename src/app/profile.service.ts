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
    const { data } = await client.from('profiles').select('*').eq('auth0_id', auth0Id).maybeSingle();
    const profile = (data as Profile | null) ?? null;
    if (auth0Id === await this.supabase.getCurrentUserId()) {
      this.current.set(profile);
    }
    return profile;
  }

  public async getByUsername(username: string): Promise<Profile | null> {
    const client = await this.supabase.getClient();
    if (!client) return null;
    const { data } = await client.from('profiles').select('*').ilike('username', username).maybeSingle();
    return (data as Profile | null) ?? null;
  }

  public async searchByUsername(query: string): Promise<Profile[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data } = await client.from('profiles').select('*').ilike('username', `%${query}%`).limit(10);
    return (data as Profile[]) ?? [];
  }

  public async create(auth0Id: string, username: string, avatarUrl: string | null): Promise<Profile> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const { data, error } = await client.from('profiles')
      .insert({ auth0_id: auth0Id, username, avatar_url: avatarUrl })
      .select().single();
    if (error) throw error;
    const profile = data as Profile;
    this.current.set(profile);
    return profile;
  }

  public async uploadAvatar(auth0Id: string, file: File): Promise<string> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `${auth0Id}/avatar.${ext}`;
    const { error } = await client.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) throw error;
    return client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  }
}
