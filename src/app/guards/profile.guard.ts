import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { ProfileService } from '../profile.service';
import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class ProfileGuard implements CanActivate {
  constructor(
    private supabase: SupabaseService,
    private profileService: ProfileService,
    private router: Router
  ) {}

  public async canActivate(): Promise<boolean | UrlTree> {
    // Already cached and exists — let through immediately
    const cached = this.profileService.current();
    if (cached) return true;

    const userId = await this.supabase.getCurrentUserId();
    if (!userId) return this.router.parseUrl('/');

    const profile = await this.profileService.loadByAuth0Id(userId);
    if (!profile) return this.router.parseUrl('/profile-setup');
    return true;
  }
}
