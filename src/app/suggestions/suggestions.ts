import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProfileService, Profile } from '../profile.service';
import { SupabaseService } from '../supabase.service';
import { AuthRoleService } from '../auth-role.service';
import { SuggestionService, FeatureSuggestion, SuggestionStatus } from '../suggestion.service';
import { EmailNotificationsService } from '../email-notifications.service';
import { normalizeEnabledCollections } from '../collection-types';

const MIN_TITLE = 3;
const MIN_BODY = 10;

@Component({
  selector: 'app-suggestions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './suggestions.html',
  styleUrl: './suggestions.scss'
})
export class SuggestionsComponent implements OnInit {
  public loading = true;
  public saving = false;
  public error = '';
  public success = '';

  public isAdmin = false;
  public auth0Id = '';
  public currentProfile: Profile | null = null;

  public titleInput = '';
  public bodyInput = '';

  public ownSuggestions: FeatureSuggestion[] = [];
  public adminSuggestions: FeatureSuggestion[] = [];
  public readonly adminStatuses: SuggestionStatus[] = ['new', 'reviewing', 'planned', 'done', 'dismissed'];

  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly profileService = inject(ProfileService);
  private readonly authRoles = inject(AuthRoleService);
  private readonly suggestionService = inject(SuggestionService);
  private readonly emailNotifications = inject(EmailNotificationsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  public async ngOnInit() {
    try {
      const auth0Id = await this.supabase.getCurrentUserId();
      if (!auth0Id) {
        this.syncView(() => { this.error = 'You need to sign in again.'; });
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
    } catch (err) {
      console.error('Failed to load suggestions page', err);
      this.syncView(() => { this.error = 'Failed to load suggestions.'; });
    } finally {
      this.syncView(() => { this.loading = false; });
    }
  }

  public get canSubmit() {
    return this.titleInput.trim().length >= MIN_TITLE && this.bodyInput.trim().length >= MIN_BODY;
  }

  public get titleLen() { return this.titleInput.trim().length; }
  public get bodyLen() { return this.bodyInput.trim().length; }
  public get adminNewCount() {
    return this.adminSuggestions.filter(s => s.status === 'new').length;
  }

  public async submit() {
    const title = this.titleInput.trim();
    const body = this.bodyInput.trim();

    if (!this.auth0Id || title.length < MIN_TITLE || body.length < MIN_BODY) return;

    this.syncView(() => { this.saving = true; this.error = ''; this.success = ''; });

    try {
      const suggestion = await this.suggestionService.create(
        this.auth0Id, this.currentProfile?.id ?? null, title, body
      );
      void this.emailNotifications.notifySuggestionSubmitted(suggestion.id, this.pageUrl());
      this.syncView(() => { this.titleInput = ''; this.bodyInput = ''; this.success = 'Suggestion sent!'; });
      await this.refresh();
    } catch (err) {
      console.error('Failed to submit suggestion', err);
      this.syncView(() => { this.error = err instanceof Error ? err.message : 'Failed to submit.'; });
    } finally {
      this.syncView(() => { this.saving = false; });
    }
  }

  public async updateStatus(suggestion: FeatureSuggestion, status: SuggestionStatus) {
    if (!this.isAdmin || suggestion.status === status) return;

    try {
      await this.suggestionService.updateStatus(suggestion.id, status);
      void this.emailNotifications.notifySuggestionStatusChanged(suggestion.id, this.pageUrl());
      await this.refresh();
    } catch (err) {
      console.error('Failed to update status', err);
      this.syncView(() => { this.error = 'Failed to update suggestion status.'; });
    }
  }

  public goBack() {
    const path = normalizeEnabledCollections(this.currentProfile?.enabled_collections)[0];
    void this.router.navigate(['/', path]);
  }

  public trackById(_: number, item: { id: string }) { return item.id; }

  private async refresh() {
    if (!this.auth0Id) return;

    const ownResult = await this.suggestionService.listOwn(this.auth0Id).catch(() => [] as FeatureSuggestion[]);

    let adminResult: FeatureSuggestion[] = [];
    if (this.isAdmin) {
      try {
        adminResult = await this.suggestionService.listAdminInbox();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.syncView(() => { this.error = `Admin inbox error: ${msg}`; });
      }
    }

    this.syncView(() => {
      this.ownSuggestions = ownResult;
      this.adminSuggestions = adminResult;
    });
  }

  private pageUrl(): string {
    return new URL('suggestions', document.baseURI).toString();
  }

  private syncView(update: () => void) {
    this.zone.run(() => { update(); this.cdr.detectChanges(); });
  }
}
