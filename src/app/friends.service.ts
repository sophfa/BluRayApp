import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile, PUBLIC_PROFILE_FIELDS } from './profile.service';

export interface Friendship {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  requester?: Profile;
  recipient?: Profile;
}

export interface FriendEntry {
  friendship: Friendship;
  friend: Profile;
}

@Injectable({ providedIn: 'root' })
export class FriendsService {
  constructor(private supabase: SupabaseService) {}

  public async getFriends(profileId: string): Promise<FriendEntry[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data, error } = await client.from('friendships')
      .select(`*, requester:profiles!requester_id(${PUBLIC_PROFILE_FIELDS}), recipient:profiles!recipient_id(${PUBLIC_PROFILE_FIELDS})`)
      .or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`)
      .eq('status', 'accepted');
    if (error) {
      console.warn('Failed to load friends', error);
      return [];
    }
    type Row = Friendship & { requester: Profile; recipient: Profile };
    return ((data ?? []) as Row[]).map(f => ({
      friendship: f,
      friend: f.requester_id === profileId ? f.recipient : f.requester,
    }));
  }

  public async getPendingReceived(profileId: string): Promise<Friendship[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data, error } = await client.from('friendships')
      .select(`*, requester:profiles!requester_id(${PUBLIC_PROFILE_FIELDS})`)
      .eq('recipient_id', profileId)
      .eq('status', 'pending');
    if (error) {
      console.warn('Failed to load incoming friend requests', error);
      return [];
    }
    return (data ?? []) as Friendship[];
  }

  public async getPendingSent(profileId: string): Promise<Friendship[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data, error } = await client.from('friendships')
      .select(`*, recipient:profiles!recipient_id(${PUBLIC_PROFILE_FIELDS})`)
      .eq('requester_id', profileId)
      .eq('status', 'pending');
    if (error) {
      console.warn('Failed to load sent friend requests', error);
      return [];
    }
    return (data ?? []) as Friendship[];
  }

  public async sendRequest(requesterId: string, recipientId: string): Promise<Friendship> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const { data, error } = await client.from('friendships')
      .insert({ requester_id: requesterId, recipient_id: recipientId })
      .select('*')
      .single();
    if (error) throw this.describeWriteError(error);
    return data as Friendship;
  }

  public async acceptRequest(friendshipId: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) return;
    const { error } = await client.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    if (error) throw this.describeWriteError(error);
  }

  public async declineOrRemove(friendshipId: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) return;
    const { error } = await client.from('friendships').delete().eq('id', friendshipId);
    if (error) throw this.describeWriteError(error);
  }

  private describeWriteError(error: { code?: string; message?: string }): Error {
    const message = error.message ?? 'Supabase request failed.';
    const lower = message.toLowerCase();

    if (error.code === 'PGRST205' || lower.includes("public.friendships")) {
      return new Error('Supabase friendships table is missing.');
    }

    if (lower.includes("public.profiles")) {
      return new Error('Supabase profiles table is missing.');
    }

    if (error.code === '23505' || lower.includes('unique')) {
      return new Error('Friend request already exists.');
    }

    return new Error(message);
  }
}
