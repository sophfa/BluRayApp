import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from './profile.service';

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
    const { data } = await client.from('friendships')
      .select('*, requester:profiles!requester_id(*), recipient:profiles!recipient_id(*)')
      .or(`requester_id.eq.${profileId},recipient_id.eq.${profileId}`)
      .eq('status', 'accepted');
    type Row = Friendship & { requester: Profile; recipient: Profile };
    return ((data ?? []) as Row[]).map(f => ({
      friendship: f,
      friend: f.requester_id === profileId ? f.recipient : f.requester,
    }));
  }

  public async getPendingReceived(profileId: string): Promise<Friendship[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data } = await client.from('friendships')
      .select('*, requester:profiles!requester_id(*)')
      .eq('recipient_id', profileId)
      .eq('status', 'pending');
    return (data ?? []) as Friendship[];
  }

  public async getPendingSent(profileId: string): Promise<Friendship[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const { data } = await client.from('friendships')
      .select('*, recipient:profiles!recipient_id(*)')
      .eq('requester_id', profileId)
      .eq('status', 'pending');
    return (data ?? []) as Friendship[];
  }

  public async sendRequest(requesterId: string, recipientId: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');
    const { error } = await client.from('friendships')
      .insert({ requester_id: requesterId, recipient_id: recipientId });
    if (error) throw error;
  }

  public async acceptRequest(friendshipId: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) return;
    await client.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  }

  public async declineOrRemove(friendshipId: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) return;
    await client.from('friendships').delete().eq('id', friendshipId);
  }
}
