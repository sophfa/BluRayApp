import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile, PUBLIC_PROFILE_FIELDS } from './profile.service';

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
      .select(`*, profile:profiles!profile_id(${PUBLIC_PROFILE_FIELDS})`)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message ?? 'Failed to load admin suggestion inbox');
    }

    return (data ?? []) as FeatureSuggestion[];
  }

  public async create(auth0Id: string, profileId: string | null, title: string, body: string): Promise<FeatureSuggestion> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');

    const { data, error } = await client.from('feature_suggestions')
      .insert({
        auth0_id: auth0Id,
        profile_id: profileId,
        title,
        body
      })
      .select('*')
      .single();

    if (error) {
      throw this.describeWriteError(error);
    }

    return data as FeatureSuggestion;
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

    if (lower.includes('char_length(trim(title))')) {
      return new Error('Suggestion titles must be at least 3 characters.');
    }

    if (lower.includes('char_length(trim(body))')) {
      return new Error('Suggestion details must be at least 10 characters.');
    }

    if (error.code === '23514') {
      return new Error('Suggestion details did not meet the database validation rules.');
    }

    if (lower.includes('row-level security') || lower.includes('violates row-level security')) {
      return new Error('Your profile does not have permission to submit suggestions yet.');
    }

    return new Error(message);
  }
}
