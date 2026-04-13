import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom, filter } from 'rxjs';
import { ProfileService } from '../profile.service';
import { SupabaseService } from '../supabase.service';
import { normalizeEnabledCollections } from '../collection-types';

const SAVE_TIMEOUT_MS = 15000;

@Component({
  selector: 'app-profile-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-setup.html',
  styleUrl: './profile-setup.scss'
})
export class ProfileSetupComponent implements OnInit {
  public username = '';
  public avatarFile: File | null = null;
  public avatarPreview: string | null = null;
  public saving = false;
  public error = '';
  public auth0DisplayName = '';
  private auth0Id: string | null = null;
  private auth0Email: string | null = null;

  constructor(
    private auth0: AuthService,
    private supabase: SupabaseService,
    private profileService: ProfileService,
    private router: Router
  ) {}

  public async ngOnInit() {
    const user = await firstValueFrom(this.auth0.user$.pipe(filter(u => u !== undefined)));
    if (!user?.sub) { this.router.navigate(['/']); return; }

    this.auth0Id = user.sub;
    this.auth0Email = typeof user.email === 'string' ? user.email : null;

    // Pre-fill username from Auth0 nickname/name if available
    this.auth0DisplayName = user.name ?? user.nickname ?? '';
    if (!this.username && user.nickname) {
      this.username = user.nickname.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    }
  }

  public onFileChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.avatarFile = file;
    const reader = new FileReader();
    reader.onload = e => { this.avatarPreview = e.target?.result as string; };
    reader.readAsDataURL(file);
  }

  public async save() {
    if (!this.username.trim()) return;
    this.saving = true;
    this.error = '';

    try {
      const auth0Id = this.auth0Id ?? await this.supabase.getCurrentUserId();
      if (!auth0Id) throw new Error('Not authenticated');

      let avatarUrl: string | null = null;
      if (this.avatarFile) {
        avatarUrl = await this.withTimeout(
          this.profileService.uploadAvatar(auth0Id, this.avatarFile),
          'Avatar upload'
        );
      }

      const profile = await this.withTimeout(
        this.profileService.create(auth0Id, this.username.trim(), avatarUrl, this.auth0Email),
        'Profile save'
      );

      this.router.navigate(['/', normalizeEnabledCollections(profile.enabled_collections)[0]]);
    } catch (e: unknown) {
      console.error('Profile setup save failed', e);
      this.error = this.describeSaveError(e);
    } finally {
      this.saving = false;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out. Please check your Supabase setup and try again.`));
          }, SAVE_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  private describeSaveError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Something went wrong. Please try again.';
    }

    const message = error.message.toLowerCase();

    if (message.includes('unique')) {
      return 'That username is already taken.';
    }

    if (message.includes('not authenticated')) {
      return 'You need to sign in again before saving your profile.';
    }

    if (message.includes("public.profiles") || message.includes('profiles table')) {
      return 'Supabase profiles table is missing. Run the profile setup SQL in the README.';
    }

    if (message.includes('bucket') || message.includes('avatars')) {
      return 'Supabase avatar storage is not set up yet. Create the avatars bucket and its policies first.';
    }

    if (message.includes('storage path')) {
      return 'Avatar upload failed because the storage path was rejected. Refresh after deploying the latest build and try again.';
    }

    if (message.includes('timed out')) {
      return error.message;
    }

    return 'Something went wrong. Please try again.';
  }
}
