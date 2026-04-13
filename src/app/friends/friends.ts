import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom, filter } from 'rxjs';
import { ProfileService, Profile } from '../profile.service';
import { FriendsService, FriendEntry, Friendship } from '../friends.service';
import { ChatMessage, MessagesService } from '../messages.service';

type Tab = 'friends' | 'requests' | 'find' | 'chat';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friends.html',
  styleUrl: './friends.scss'
})
export class FriendsComponent implements OnInit {
  public tab: Tab = 'friends';
  public currentProfile: Profile | null = null;
  public error = '';

  public friends: FriendEntry[] = [];
  public pendingReceived: Friendship[] = [];
  public pendingSent: Friendship[] = [];

  public searchQuery = '';
  public searchResults: Profile[] = [];
  public searching = false;
  public searchDone = false;

  public loading = true;
  public actionInProgress: Record<string, boolean> = {};

  public selectedFriend: FriendEntry | null = null;
  public chatMessages: ChatMessage[] = [];
  public chatMessageBody = '';
  public chatLoading = false;
  public sendingChat = false;
  public unreadByFriendId: Record<string, number> = {};

  private requestedTab: Tab | null = null;
  private requestedChatUsername = '';

  constructor(
    private auth0: AuthService,
    private profileService: ProfileService,
    private friendsService: FriendsService,
    private messagesService: MessagesService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    private route: ActivatedRoute,
    public router: Router
  ) {}

  public async ngOnInit() {
    this.requestedTab = this.normalizeTab(this.route.snapshot.queryParamMap.get('tab'));
    this.requestedChatUsername = (this.route.snapshot.queryParamMap.get('chat') ?? '').trim();

    try {
      const user = await firstValueFrom(this.auth0.user$.pipe(filter((u): u is NonNullable<typeof u> => u != null)));
      if (!user.sub) {
        this.syncView(() => {
          this.error = 'You need to sign in again before opening Friends.';
        });
        return;
      }

      this.currentProfile = await this.profileService.loadByAuth0Id(user.sub);
      if (!this.currentProfile) {
        this.syncView(() => {
          this.error = 'Your profile is not set up yet.';
        });
        void this.router.navigate(['/profile-setup']);
        return;
      }

      await this.loadAll();
      await this.applyRequestedView();
    } catch (error) {
      console.error('Failed to load friends page', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to load the friends page.');
      });
    } finally {
      this.syncView(() => {
        this.loading = false;
      });
    }
  }

  public get pendingCount() {
    return this.pendingReceived.length;
  }

  public get unreadChatCount() {
    return Object.values(this.unreadByFriendId).reduce((sum, count) => sum + count, 0);
  }

  public get selectedFriendshipId() {
    return this.selectedFriend?.friendship.id ?? '';
  }

  public async search() {
    const q = this.searchQuery.trim();
    if (!q) return;

    this.syncView(() => {
      this.searching = true;
      this.searchDone = false;
      this.error = '';
    });

    try {
      const results = await this.profileService.searchByUsername(q);
      this.syncView(() => {
        this.searchResults = results.filter((profile) => profile.id !== this.currentProfile?.id);
        this.searchDone = true;
      });
    } catch (error) {
      console.error('Failed to search profiles', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to search for users.');
      });
    } finally {
      this.syncView(() => {
        this.searching = false;
      });
    }
  }

  public relationshipLabel(profile: Profile): string {
    if (!this.currentProfile) return '';
    if (this.friends.some((friend) => friend.friend.id === profile.id)) return 'Friends';
    if (this.pendingReceived.some((friendship) => friendship.requester_id === profile.id)) return 'Pending (them)';
    if (this.pendingSent.some((friendship) => friendship.recipient_id === profile.id)) return 'Request sent';
    return '';
  }

  public canAddFriend(profile: Profile): boolean {
    return !this.relationshipLabel(profile);
  }

  public async sendRequest(profile: Profile) {
    if (!this.currentProfile) return;

    this.syncView(() => {
      this.actionInProgress[profile.id] = true;
      this.error = '';
    });

    try {
      await this.friendsService.sendRequest(this.currentProfile.id, profile.id);
      await this.loadAll();
      this.syncView(() => {
        this.tab = 'requests';
      });
    } catch (error) {
      console.error('Failed to send friend request', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to send the friend request.');
      });
    } finally {
      this.syncView(() => {
        this.actionInProgress[profile.id] = false;
      });
    }
  }

  public async accept(friendship: Friendship) {
    this.syncView(() => {
      this.actionInProgress[friendship.id] = true;
      this.error = '';
    });

    try {
      await this.friendsService.acceptRequest(friendship.id);
      await this.loadAll();
    } catch (error) {
      console.error('Failed to accept friend request', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to accept the friend request.');
      });
    } finally {
      this.syncView(() => {
        this.actionInProgress[friendship.id] = false;
      });
    }
  }

  public async decline(friendship: Friendship) {
    this.syncView(() => {
      this.actionInProgress[friendship.id] = true;
      this.error = '';
    });

    try {
      await this.friendsService.declineOrRemove(friendship.id);
      await this.loadAll();
    } catch (error) {
      console.error('Failed to decline friend request', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to update the friend request.');
      });
    } finally {
      this.syncView(() => {
        this.actionInProgress[friendship.id] = false;
      });
    }
  }

  public async removeFriend(entry: FriendEntry) {
    if (!confirm(`Remove ${entry.friend.username} from friends?`)) return;

    this.syncView(() => {
      this.actionInProgress[entry.friendship.id] = true;
      this.error = '';
    });

    try {
      await this.friendsService.declineOrRemove(entry.friendship.id);
      await this.loadAll();
      if (this.selectedFriend?.friendship.id === entry.friendship.id) {
        this.syncView(() => {
          this.selectedFriend = null;
          this.chatMessages = [];
        });
      }
    } catch (error) {
      console.error('Failed to remove friend', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to remove friend.');
      });
    } finally {
      this.syncView(() => {
        this.actionInProgress[entry.friendship.id] = false;
      });
    }
  }

  public viewCollection(username: string) {
    void this.router.navigate(['/friends', username, 'bluray']);
  }

  public async openChat(entry: FriendEntry) {
    await this.selectChat(entry, true);
  }

  public async sendChatMessage() {
    if (!this.currentProfile || !this.selectedFriend) {
      return;
    }

    const body = this.chatMessageBody.trim();
    if (!body) {
      return;
    }

    this.syncView(() => {
      this.sendingChat = true;
      this.error = '';
    });

    try {
      await this.messagesService.sendMessage(
        this.selectedFriend.friendship.id,
        this.currentProfile.id,
        this.selectedFriend.friend.id,
        body
      );

      this.syncView(() => {
        this.chatMessageBody = '';
      });

      await this.loadConversation(this.selectedFriend);
    } catch (error) {
      console.error('Failed to send chat message', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to send chat message.');
      });
    } finally {
      this.syncView(() => {
        this.sendingChat = false;
      });
    }
  }

  public setTab(tab: Tab) {
    this.syncView(() => {
      this.tab = tab;
    });
  }

  public avatarUrl(profile: Profile): string | null {
    return profile.avatar_url ?? null;
  }

  public initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
  }

  public isOwnMessage(message: ChatMessage): boolean {
    return message.sender_profile_id === this.currentProfile?.id;
  }

  public unreadForFriend(entry: FriendEntry) {
    return this.unreadByFriendId[entry.friend.id] ?? 0;
  }

  public trackById(_: number, item: { id: string }) {
    return item.id;
  }

  private async loadAll() {
    if (!this.currentProfile) return;

    const selectedFriendId = this.selectedFriend?.friend.id ?? null;
    const [friends, received, sent, unreadMessages] = await Promise.all([
      this.friendsService.getFriends(this.currentProfile.id),
      this.friendsService.getPendingReceived(this.currentProfile.id),
      this.friendsService.getPendingSent(this.currentProfile.id),
      this.messagesService.getUnreadIncoming(this.currentProfile.id)
    ]);

    const unreadByFriendId = unreadMessages.reduce<Record<string, number>>((acc, message) => {
      acc[message.sender_profile_id] = (acc[message.sender_profile_id] ?? 0) + 1;
      return acc;
    }, {});

    const nextSelectedFriend = selectedFriendId
      ? friends.find((friend) => friend.friend.id === selectedFriendId) ?? null
      : null;

    this.syncView(() => {
      this.friends = friends;
      this.pendingReceived = received;
      this.pendingSent = sent;
      this.unreadByFriendId = unreadByFriendId;
      this.selectedFriend = nextSelectedFriend;
    });

    if (nextSelectedFriend) {
      await this.loadConversation(nextSelectedFriend);
    }
  }

  private async loadConversation(entry: FriendEntry) {
    if (!this.currentProfile) {
      return;
    }

    this.syncView(() => {
      this.chatLoading = true;
      this.tab = 'chat';
      this.selectedFriend = entry;
      this.error = '';
    });

    try {
      const messages = await this.messagesService.listConversation(entry.friendship.id);
      await this.messagesService.markConversationRead(entry.friendship.id, this.currentProfile.id);
      const unreadMessages = await this.messagesService.getUnreadIncoming(this.currentProfile.id);
      const unreadByFriendId = unreadMessages.reduce<Record<string, number>>((acc, message) => {
        acc[message.sender_profile_id] = (acc[message.sender_profile_id] ?? 0) + 1;
        return acc;
      }, {});

      this.syncView(() => {
        this.chatMessages = messages;
        this.unreadByFriendId = unreadByFriendId;
      });
    } catch (error) {
      console.error('Failed to load conversation', error);
      this.syncView(() => {
        this.error = this.describeError(error, 'Failed to load chat conversation.');
      });
    } finally {
      this.syncView(() => {
        this.chatLoading = false;
      });
    }
  }

  private async applyRequestedView() {
    if (this.requestedChatUsername) {
      const match = this.friends.find((friend) => friend.friend.username.toLowerCase() === this.requestedChatUsername.toLowerCase());
      if (match) {
        await this.selectChat(match, false);
        return;
      }
    }

    if (this.requestedTab) {
      this.syncView(() => {
        this.tab = this.requestedTab ?? 'friends';
      });
    }
  }

  private async selectChat(entry: FriendEntry, updateUrl: boolean) {
    await this.loadConversation(entry);

    if (updateUrl) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { chat: entry.friend.username, tab: 'chat' },
        queryParamsHandling: 'merge'
      });
    }
  }

  private normalizeTab(value: string | null): Tab | null {
    if (value === 'friends' || value === 'requests' || value === 'find' || value === 'chat') {
      return value;
    }

    return null;
  }

  private describeError(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) {
      return fallback;
    }

    const message = error.message.toLowerCase();

    if (message.includes('friendships table')) {
      return 'Supabase friendships table is missing. Run the friends SQL in the README.';
    }

    if (message.includes('profiles table')) {
      return 'Supabase profiles table is missing. Run the profile SQL in the README.';
    }

    if (message.includes('friend_messages table')) {
      return 'Supabase friend_messages table is missing. Run the chat SQL in the README.';
    }

    if (message.includes('duplicate') || message.includes('already exists') || message.includes('unique')) {
      return 'That friend request already exists.';
    }

    return fallback;
  }

  private syncView(update: () => void) {
    this.zone.run(() => {
      update();
      this.cdr.detectChanges();
    });
  }
}
