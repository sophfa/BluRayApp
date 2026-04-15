import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideAuth0, AuthGuard } from '@auth0/auth0-angular';
import Aura from '@primeuix/themes/aura';
import { ConfirmationService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { CollectionComponent } from './collection/collection';
import { ProfileSetupComponent } from './profile-setup/profile-setup';
import { FriendsComponent } from './friends/friends';
import { NotificationsComponent } from './notifications/notifications';
import { SuggestionsComponent } from './suggestions/suggestions';
import { ProfileGuard } from './guards/profile.guard';
import { HomeComponent } from './home/home';
import { SettingsComponent } from './settings/settings';
import { COLLECTION_DEFINITIONS } from './collection-types';

const collectionGuards = [AuthGuard, ProfileGuard];
const ownCollectionRoutes = COLLECTION_DEFINITIONS.map((definition) => ({
  path: definition.path,
  component: CollectionComponent,
  canActivate: collectionGuards,
  data: { collectionType: definition.type }
}));

const wishlistRoutes = COLLECTION_DEFINITIONS.map((definition) => ({
  path: `${definition.path}-wishlist`,
  component: CollectionComponent,
  canActivate: collectionGuards,
  data: { collectionType: definition.type, isWishlist: true }
}));

const friendCollectionRoutes = COLLECTION_DEFINITIONS.map((definition) => ({
  path: `friends/:username/${definition.path}`,
  component: CollectionComponent,
  canActivate: collectionGuards,
  data: { collectionType: definition.type, readOnly: true }
}));

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimations(),
    provideAuth0({
      domain: 'dev-e0rni53ebj3apjt5.us.auth0.com',
      clientId: 'QXkBBrvYztj2b7nwhLOqgX1x5EqgjuRj',
      authorizationParams: { redirect_uri: document.baseURI }
    }),
    ConfirmationService,
    providePrimeNG({
      ripple: true,
      theme: { preset: Aura, options: { darkModeSelector: '.app-dark', cssLayer: false } }
    }),
    provideRouter([
      { path: '', pathMatch: 'full', component: HomeComponent, canActivate: collectionGuards },

      { path: 'profile-setup', component: ProfileSetupComponent, canActivate: [AuthGuard] },
      { path: 'notifications', component: NotificationsComponent, canActivate: collectionGuards },
      { path: 'settings', component: SettingsComponent, canActivate: collectionGuards },

      { path: 'friends', component: FriendsComponent, canActivate: collectionGuards },
      { path: 'suggestions', component: SuggestionsComponent, canActivate: collectionGuards },

      ...ownCollectionRoutes,
      ...wishlistRoutes,
      ...friendCollectionRoutes,

      { path: '**', redirectTo: '' }
    ], withComponentInputBinding())
  ]
};
