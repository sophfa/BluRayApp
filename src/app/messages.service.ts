import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile, PUBLIC_PROFILE_FIELDS } from './profile.service';

export interface ChatMessage {
  id: string;
  friendship_id: string;
  sender_profile_id: string;
  recipient_profile_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender?: Profile;
  recipient?: Profile;
}

@Injectable({ providedIn: 'root' })
export class MessagesService {
  constructor(private supabase: SupabaseService) {}

  public async listConversation(friendshipId: string): Promise<ChatMessage[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];

    const { data, error } = await client.from('friend_messages')
      .select(`*, sender:profiles!sender_profile_id(${PUBLIC_PROFILE_FIELDS}), recipient:profiles!recipient_profile_id(${PUBLIC_PROFILE_FIELDS})`)
      .eq('friendship_id', friendshipId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Failed to load chat conversation', error);
      return [];
    }

    return (data ?? []) as ChatMessage[];
  }

  public async getUnreadIncoming(profileId: string): Promise<ChatMessage[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];

    const { data, error } = await client.from('friend_messages')
      .select(`*, sender:profiles!sender_profile_id(${PUBLIC_PROFILE_FIELDS}), recipient:profiles!recipient_profile_id(${PUBLIC_PROFILE_FIELDS})`)
      .eq('recipient_profile_id', profileId)
      .is('read_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Failed to load unread chat messages', error);
      return [];
    }

    return (data ?? []) as ChatMessage[];
  }

  public async sendMessage(friendshipId: string, senderProfileId: string, recipientProfileId: string, body: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) throw new Error('Supabase unavailable');

    const { error } = await client.from('friend_messages').insert({
      friendship_id: friendshipId,
      sender_profile_id: senderProfileId,
      recipient_profile_id: recipientProfileId,
      body
    });

    if (error) {
      throw this.describeWriteError(error);
    }
  }

  public async markConversationRead(friendshipId: string, recipientProfileId: string): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) return;

    const { error } = await client.from('friend_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('friendship_id', friendshipId)
      .eq('recipient_profile_id', recipientProfileId)
      .is('read_at', null);

    if (error) {
      throw this.describeWriteError(error);
    }
  }

  private describeWriteError(error: { code?: string; message?: string }): Error {
    const message = error.message ?? 'Supabase request failed.';
    const lower = message.toLowerCase();

    if (error.code === 'PGRST205' || lower.includes("public.friend_messages")) {
      return new Error('Supabase friend_messages table is missing.');
    }

    return new Error(message);
  }
}
