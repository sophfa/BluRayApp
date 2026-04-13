import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom, filter } from 'rxjs';
import { ProfileService, Profile } from '../profile.service';
import { FriendsService, FriendEntry, Friendship } from '../friends.service';

type Tab = 'friends' | 'requests' | 'find';

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

  constructor(
    private auth0: AuthService,
    private profileService: ProfileService,
    private friendsService: FriendsService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    public router: Router
  ) {}

  public async ngOnInit() {
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

  private async loadAll() {
    if (!this.currentProfile) return;
    const [friends, received, sent] = await Promise.all([
      this.friendsService.getFriends(this.currentProfile.id),
      this.friendsService.getPendingReceived(this.currentProfile.id),
      this.friendsService.getPendingSent(this.currentProfile.id),
    ]);
    this.syncView(() => {
      this.friends = friends;
      this.pendingReceived = received;
      this.pendingSent = sent;
    });
  }

  public get pendingCount() { return this.pendingReceived.length; }

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
        this.searchResults = results.filter(p => p.id !== this.currentProfile?.id);
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
    if (this.friends.some(f => f.friend.id === profile.id)) return 'Friends';
    if (this.pendingReceived.some(f => f.requester_id === profile.id)) return 'Pending (them)';
    if (this.pendingSent.some(f => f.recipient_id === profile.id)) return 'Request sent';
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
    this.router.navigate(['/friends', username, 'bluray']);
  }

  public avatarUrl(profile: Profile): string | null {
    return profile.avatar_url ?? null;
  }

  public initials(username: string): string {
    return username.slice(0, 2).toUpperCase();
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
