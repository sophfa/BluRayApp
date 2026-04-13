import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from './profile.service';

export type SuggestionStatus = 'new' | 'reviewing' | 'planned' | 'done' | 'dismissed';

export interface FeatureSuggestion {
  id: string;
  auth0_id: string;
  profile_id: string | null;
  title: string;
  body: string;
  status: SuggestionStatus;
  created_at: string;
  updated_at: string;
  reviewed_by_auth0_id: string | null;
  profile?: Profile;
}

@Injectable({ providedIn: 'root' })
export class SuggestionService {
  constructor(private supabase: SupabaseService) {}

  public async listOwn(auth0Id: string): Promise<FeatureSuggestion[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];

    const { data, error } = await client.from('feature_suggestions')
      .select('*')
      .eq('auth0_id', auth0Id)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to load own suggestions', error);
      return [];
    }

    return (data ?? []) as FeatureSuggestion[];
  }

  public async listAdminInbox(): Promise<FeatureSuggestion[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];

    const { data, error } = await client.from('feature_suggestions')
      .select('*, profile:profiles!profile_id(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to load admin suggestion inbox', error);
      return [];
    }

    return (data ?? []) as FeatureSuggestion[];
  }

  public async create(auth0Id: string, profileId: string | null, title: string, body: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');

    const { error } = await client.from('feature_suggestions').insert({
      auth0_id: auth0Id,
      profile_id: profileId,
      title,
      body
    });

    if (error) {
      throw this.describeWriteError(error);
    }
  }

  public async updateStatus(id: string, status: SuggestionStatus): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');

    const auth0Id = await this.supabase.getCurrentUserId();
    const { error } = await client.from('feature_suggestions')
      .update({
        status,
        reviewed_by_auth0_id: auth0Id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      throw this.describeWriteError(error);
    }
  }

  private describeWriteError(error: { code?: string; message?: string }): Error {
    const message = error.message ?? 'Supabase request failed.';
    const lower = message.toLowerCase();

    if (error.code === 'PGRST205' || lower.includes("public.feature_suggestions")) {
      return new Error('Supabase feature_suggestions table is missing.');
    }

    return new Error(message);
  }
}
