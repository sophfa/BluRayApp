import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom, filter } from 'rxjs';
import { ProfileService } from '../profile.service';
import { SupabaseService } from '../supabase.service';

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

  constructor(
    private auth0: AuthService,
    private supabase: SupabaseService,
    private profileService: ProfileService,
    private router: Router
  ) {}

  public async ngOnInit() {
    const user = await firstValueFrom(this.auth0.user$.pipe(filter(u => u !== undefined)));
    if (!user?.sub) { this.router.navigate(['/']); return; }

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
      const auth0Id = await this.supabase.getCurrentUserId();
      if (!auth0Id) throw new Error('Not authenticated');

      let avatarUrl: string | null = null;
      if (this.avatarFile) {
        avatarUrl = await this.profileService.uploadAvatar(auth0Id, this.avatarFile);
      }
      await this.profileService.create(auth0Id, this.username.trim(), avatarUrl);
      this.router.navigate(['/bluray']);
    } catch (e: unknown) {
      this.error = e instanceof Error && e.message.includes('unique')
        ? 'That username is already taken.'
        : 'Something went wrong. Please try again.';
    } finally {
      this.saving = false;
    }
  }
}
