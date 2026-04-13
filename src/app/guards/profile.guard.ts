import { Injectable } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { ProfileService } from '../profile.service';

@Injectable({ providedIn: 'root' })
export class ProfileGuard implements CanActivate {
  constructor(
    private auth0: AuthService,
    private profileService: ProfileService,
    private router: Router
  ) {}

  public async canActivate(): Promise<boolean | UrlTree> {
    // Already cached and exists — let through immediately
    const cached = this.profileService.current();
    if (cached) return true;

    const user = await firstValueFrom(this.auth0.user$.pipe(filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)));
    if (!user.sub) return this.router.parseUrl('/');

    const profile = await this.profileService.loadByAuth0Id(user.sub);
    if (!profile) return this.router.parseUrl('/profile-setup');

    await this.profileService.syncContactEmail(user.sub, typeof user.email === 'string' ? user.email : null);
    return true;
  }
}
