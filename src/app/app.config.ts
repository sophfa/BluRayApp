import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideAuth0, AuthGuard } from '@auth0/auth0-angular';
import Aura from '@primeuix/themes/aura';
import { ConfirmationService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { INITIAL_MOVIES } from './movies.data';
import { CollectionComponent } from './collection/collection';
import { ProfileSetupComponent } from './profile-setup/profile-setup';
import { FriendsComponent } from './friends/friends';
import { NotificationsComponent } from './notifications/notifications';
import { ProfileGuard } from './guards/profile.guard';

const collectionGuards = [AuthGuard, ProfileGuard];

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
      { path: '', pathMatch: 'full', redirectTo: 'bluray' },

      { path: 'profile-setup', component: ProfileSetupComponent, canActivate: [AuthGuard] },
      { path: 'notifications', component: NotificationsComponent, canActivate: collectionGuards },

      { path: 'friends', component: FriendsComponent, canActivate: collectionGuards },

      {
        path: 'bluray',
        component: CollectionComponent,
        canActivate: collectionGuards,
        data: { collectionKey: 'bluray-collection', collectionTitle: 'Blu-ray Collection', collectionIcon: 'pi-video', itemLabel: 'movie', initialItems: INITIAL_MOVIES }
      },
      {
        path: 'games',
        component: CollectionComponent,
        canActivate: collectionGuards,
        data: { collectionKey: 'games-collection', collectionTitle: 'Games Collection', collectionIcon: 'pi-desktop', itemLabel: 'game', initialItems: [] }
      },

      // Friend collection views (read-only)
      {
        path: 'friends/:username/bluray',
        component: CollectionComponent,
        canActivate: collectionGuards,
        data: { collectionKey: 'bluray-collection', collectionTitle: 'Blu-ray Collection', collectionIcon: 'pi-video', itemLabel: 'movie', readOnly: true }
      },
      {
        path: 'friends/:username/games',
        component: CollectionComponent,
        canActivate: collectionGuards,
        data: { collectionKey: 'games-collection', collectionTitle: 'Games Collection', collectionIcon: 'pi-desktop', itemLabel: 'game', readOnly: true }
      },

      { path: '**', redirectTo: 'bluray' }
    ], withComponentInputBinding())
  ]
};
