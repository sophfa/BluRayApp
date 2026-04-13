import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileService } from '../profile.service';
import { normalizeEnabledCollections } from '../collection-types';

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class HomeComponent {
  private readonly router = inject(Router);
  private readonly profileService = inject(ProfileService);

  public async ngOnInit() {
    const profile = this.profileService.current() ?? await this.profileService.loadForCurrentUser();
    const nextPath = normalizeEnabledCollections(profile?.enabled_collections)[0];
    void this.router.navigate(['/', nextPath]);
  }
}
