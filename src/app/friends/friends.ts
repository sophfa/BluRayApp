import { Component, OnInit } from '@angular/core';
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
    public router: Router
  ) {}

  public async ngOnInit() {
    const user = await firstValueFrom(this.auth0.user$.pipe(filter(u => u !== undefined)));
    if (!user?.sub) return;
    this.currentProfile = await this.profileService.loadByAuth0Id(user.sub);
    if (!this.currentProfile) return;
    await this.loadAll();
    this.loading = false;
  }

  private async loadAll() {
    if (!this.currentProfile) return;
    const [friends, received, sent] = await Promise.all([
      this.friendsService.getFriends(this.currentProfile.id),
      this.friendsService.getPendingReceived(this.currentProfile.id),
      this.friendsService.getPendingSent(this.currentProfile.id),
    ]);
    this.friends = friends;
    this.pendingReceived = received;
    this.pendingSent = sent;
  }

  public get pendingCount() { return this.pendingReceived.length; }

  public async search() {
    const q = this.searchQuery.trim();
    if (!q) return;
    this.searching = true;
    this.searchDone = false;
    this.searchResults = await this.profileService.searchByUsername(q);
    // exclude self
    this.searchResults = this.searchResults.filter(p => p.id !== this.currentProfile?.id);
    this.searching = false;
    this.searchDone = true;
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
    this.actionInProgress[profile.id] = true;
    try {
      await this.friendsService.sendRequest(this.currentProfile.id, profile.id);
      await this.loadAll();
    } finally {
      this.actionInProgress[profile.id] = false;
    }
  }

  public async accept(friendship: Friendship) {
    this.actionInProgress[friendship.id] = true;
    try {
      await this.friendsService.acceptRequest(friendship.id);
      await this.loadAll();
    } finally {
      this.actionInProgress[friendship.id] = false;
    }
  }

  public async decline(friendship: Friendship) {
    this.actionInProgress[friendship.id] = true;
    try {
      await this.friendsService.declineOrRemove(friendship.id);
      await this.loadAll();
    } finally {
      this.actionInProgress[friendship.id] = false;
    }
  }

  public async removeFriend(entry: FriendEntry) {
    if (!confirm(`Remove ${entry.friend.username} from friends?`)) return;
    this.actionInProgress[entry.friendship.id] = true;
    try {
      await this.friendsService.declineOrRemove(entry.friendship.id);
      await this.loadAll();
    } finally {
      this.actionInProgress[entry.friendship.id] = false;
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
}
