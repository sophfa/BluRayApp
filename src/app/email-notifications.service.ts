import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

type NotificationEmailPayload =
  | {
      type: 'suggestion_submitted';
      suggestionId: string;
      actionUrl: string;
    }
  | {
      type: 'suggestion_status_changed';
      suggestionId: string;
      actionUrl: string;
    }
  | {
      type: 'friend_request_sent';
      friendshipId: string;
      actionUrl: string;
    }
  | {
      type: 'friend_request_accepted';
      friendshipId: string;
      actionUrl: string;
    }
  | {
      type: 'chat_message_received';
      friendshipId: string;
      recipientProfileId: string;
      bodyPreview: string;
      actionUrl: string;
    };

@Injectable({ providedIn: 'root' })
export class EmailNotificationsService {
  constructor(private supabase: SupabaseService) {}

  public async notifySuggestionSubmitted(suggestionId: string, actionUrl: string): Promise<void> {
    await this.invoke({
      type: 'suggestion_submitted',
      suggestionId,
      actionUrl
    });
  }

  public async notifySuggestionStatusChanged(suggestionId: string, actionUrl: string): Promise<void> {
    await this.invoke({
      type: 'suggestion_status_changed',
      suggestionId,
      actionUrl
    });
  }

  public async notifyFriendRequestSent(friendshipId: string, actionUrl: string): Promise<void> {
    await this.invoke({
      type: 'friend_request_sent',
      friendshipId,
      actionUrl
    });
  }

  public async notifyFriendRequestAccepted(friendshipId: string, actionUrl: string): Promise<void> {
    await this.invoke({
      type: 'friend_request_accepted',
      friendshipId,
      actionUrl
    });
  }

  public async notifyChatMessageReceived(
    friendshipId: string,
    recipientProfileId: string,
    bodyPreview: string,
    actionUrl: string
  ): Promise<void> {
    await this.invoke({
      type: 'chat_message_received',
      friendshipId,
      recipientProfileId,
      bodyPreview: bodyPreview.trim().slice(0, 280),
      actionUrl
    });
  }

  private async invoke(body: NotificationEmailPayload): Promise<void> {
    const client = await this.supabase.getClient();
    if (!client) {
      return;
    }

    const { error } = await client.functions.invoke('notification-email', { body });

    if (error) {
      console.warn('Failed to send notification email', error);
    }
  }
}
