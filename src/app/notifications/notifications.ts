import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Profile, ProfileService } from '../profile.service';
import { SupabaseService } from '../supabase.service';
import { AuthRoleService } from '../auth-role.service';
import { SuggestionService, FeatureSuggestion, SuggestionStatus } from '../suggestion.service';
import { FriendsService, Friendship } from '../friends.service';
import { MessagesService, ChatMessage } from '../messages.service';
import { EmailNotificationsService } from '../email-notifications.service';
import { normalizeEnabledCollections } from '../collection-types';

interface UnreadConversation {
  username: string;
  count: number;
  latestMessage: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss'
})
export class NotificationsComponent implements OnInit {
  public loading = true;
  public savingSuggestion = false;
  public error = '';

  public isAdmin = false;
  public auth0Id = '';
  public currentProfile: Profile | null = null;

  public suggestionTitle = '';
  public suggestionBody = '';

  public ownSuggestions: FeatureSuggestion[] = [];
  public adminSuggestions: FeatureSuggestion[] = [];
  public pendingRequests: Friendship[] = [];
  public unreadMessages: ChatMessage[] = [];

  public readonly adminStatuses: SuggestionStatus[] = ['new', 'reviewing', 'planned', 'done', 'dismissed'];

  constructor(
    public router: Router,
    private supabase: SupabaseService,
    private profileService: ProfileService,
    private authRoles: AuthRoleService,
    private suggestionService: SuggestionService,
    private friendsService: FriendsService,
    private messagesService: MessagesService,
    private emailNotifications: EmailNotificationsService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  public async ngOnInit() {
    try {
      const auth0Id = await this.supabase.getCurrentUserId();
      if (!auth0Id) {
        this.syncView(() => {
          this.error = 'You need to sign in again before opening notifications.';
        });
        return;
      }

      const [profile, isAdmin] = await Promise.all([
        this.profileService.loadByAuth0Id(auth0Id),
        this.authRoles.isAdmin()
      ]);

      if (!profile) {
        void this.router.navigate(['/profile-setup']);
        return;
      }

      this.syncView(() => {
        this.auth0Id = auth0Id;
        this.currentProfile = profile;
        this.isAdmin = isAdmin;
      });

      await this.refresh();
    } catch (error) {
      console.error('Failed to load notifications page', error);
      this.syncView(() => {
        this.error = 'Failed to load notifications.';
      });
    } finally {
      this.syncView(() => {
        this.loading = false;
      });
    }
  }

  public async submitSuggestion() {
    const title = this.suggestionTitle.trim();
    const body = this.suggestionBody.trim();

    if (!title || !body || !this.auth0Id) {
      return;
    }

    this.syncView(() => {
      this.savingSuggestion = true;
      this.error = '';
    });

    try {
      const suggestion = await this.suggestionService.create(this.auth0Id, this.currentProfile?.id ?? null, title, body);
      this.syncView(() => {
        this.suggestionTitle = '';
        this.suggestionBody = '';
      });
      void this.emailNotifications.notifySuggestionSubmitted(suggestion.id, this.notificationsUrl());
      await this.refresh();
    } catch (error) {
      console.error('Failed to submit suggestion', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to submit suggestion.');
      });
    } finally {
      this.syncView(() => {
        this.savingSuggestion = false;
      });
    }
  }

  public async updateSuggestionStatus(suggestion: FeatureSuggestion, status: SuggestionStatus) {
    if (!this.isAdmin || suggestion.status === status) {
      return;
    }

    try {
      await this.suggestionService.updateStatus(suggestion.id, status);
      void this.emailNotifications.notifySuggestionStatusChanged(suggestion.id, this.notificationsUrl());
      await this.refresh();
    } catch (error) {
      console.error('Failed to update suggestion status', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to update suggestion status.');
      });
    }
  }

  public openRequests() {
    void this.router.navigate(['/friends'], { queryParams: { tab: 'requests' } });
  }

  public openChat(username: string) {
    void this.router.navigate(['/friends'], { queryParams: { chat: username } });
  }

  public goBack() {
    const path = normalizeEnabledCollections(this.currentProfile?.enabled_collections)[0];
    void this.router.navigate(['/', path]);
  }

  public get unreadMessageConversations(): UnreadConversation[] {
    const bySender = new Map<string, UnreadConversation>();

    for (const message of this.unreadMessages) {
      const username = message.sender?.username ?? 'Unknown user';
      const existing = bySender.get(username);

      if (existing) {
        existing.count += 1;
        continue;
      }

      bySender.set(username, {
        username,
        count: 1,
        latestMessage: message.body
      });
    }

    return [...bySender.values()];
  }

  public get adminNewSuggestionCount() {
    return this.adminSuggestions.filter((suggestion) => suggestion.status === 'new').length;
  }

  public trackById(_: number, item: { id: string }) {
    return item.id;
  }

  private async refresh() {
    if (!this.auth0Id || !this.currentProfile) {
      return;
    }

    const [ownSuggestions, pendingRequests, unreadMessages, adminSuggestions] = await Promise.all([
      this.suggestionService.listOwn(this.auth0Id),
      this.friendsService.getPendingReceived(this.currentProfile.id),
      this.messagesService.getUnreadIncoming(this.currentProfile.id),
      this.isAdmin ? this.suggestionService.listAdminInbox() : Promise.resolve([])
    ]);

    this.syncView(() => {
      this.ownSuggestions = ownSuggestions;
      this.pendingRequests = pendingRequests;
      this.unreadMessages = unreadMessages;
      this.adminSuggestions = adminSuggestions;
    });
  }

  private describeError(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) {
      return fallback;
    }

    const message = error.message.toLowerCase();

    if (message.includes('feature_suggestions table')) {
      return 'Supabase feature_suggestions table is missing. Run the README SQL.';
    }

    if (message.includes('friend_messages table')) {
      return 'Supabase friend_messages table is missing. Run the README SQL.';
    }

    return fallback;
  }

  private syncView(update: () => void) {
    this.zone.run(() => {
      update();
      this.cdr.detectChanges();
    });
  }

  private notificationsUrl(): string {
    return new URL('notifications', document.baseURI).toString();
  }
}
