import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { COLLECTION_DEFINITIONS, CollectionType, normalizeEnabledCollections } from '../collection-types';
import { ProfileService } from '../profile.service';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss'
})
export class SettingsComponent {
  public readonly collectionOptions = COLLECTION_DEFINITIONS;

  public loading = true;
  public saving = false;
  public error = '';
  public success = '';
  public selectedCollections: CollectionType[] = [];

  private auth0Id = '';
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly profileService = inject(ProfileService);

  public async ngOnInit() {
    try {
      const auth0Id = await this.supabase.getCurrentUserId();
      const profile = auth0Id ? await this.profileService.loadByAuth0Id(auth0Id) : null;

      if (!auth0Id || !profile) {
        void this.router.navigate(['/profile-setup']);
        return;
      }

      this.auth0Id = auth0Id;
      this.selectedCollections = normalizeEnabledCollections(profile.enabled_collections);
    } catch (error) {
      console.error('Failed to load settings', error);
      this.error = 'Failed to load settings.';
    } finally {
      this.loading = false;
    }
  }

  public isEnabled(type: CollectionType) {
    return this.selectedCollections.includes(type);
  }

  public toggleCollection(type: CollectionType, enabled: boolean) {
    if (enabled) {
      if (!this.selectedCollections.includes(type)) {
        this.selectedCollections = [...this.selectedCollections, type];
      }
      return;
    }

    if (this.selectedCollections.length === 1) {
      return;
    }

    this.selectedCollections = this.selectedCollections.filter((collectionType) => collectionType !== type);
  }

  public async save() {
    if (!this.auth0Id || this.selectedCollections.length === 0) {
      return;
    }

    this.saving = true;
    this.error = '';
    this.success = '';

    try {
      const profile = await this.profileService.updateEnabledCollections(this.auth0Id, this.selectedCollections);
      this.selectedCollections = [...profile.enabled_collections];
      this.success = 'Collection settings saved.';
    } catch (error) {
      console.error('Failed to save collection settings', error);
      this.error = error instanceof Error ? error.message : 'Failed to save collection settings.';
    } finally {
      this.saving = false;
    }
  }

  public goBack() {
    const current = this.profileService.current();
    const path = current?.enabled_collections?.[0] ?? 'bluray';
    void this.router.navigate(['/', path]);
  }
}
