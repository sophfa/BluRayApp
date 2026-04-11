import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideAuth0 } from '@auth0/auth0-angular';
import Aura from '@primeuix/themes/aura';
import { ConfirmationService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { INITIAL_MOVIES } from './movies.data';
import { HomeComponent } from './home/home';
import { CollectionComponent } from './collection/collection';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAnimationsAsync(),
    provideAuth0({
      domain: 'dev-e0rni53ebj3apjt5.us.auth0.com',
      clientId: 'QXkBBrvYztj2b7nwhLOqgX1x5EqgjuRj',
      authorizationParams: {
        redirect_uri: document.baseURI
      }
    }),
    ConfirmationService,
    providePrimeNG({
      ripple: true,
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: false
        }
      }
    }),
    provideRouter([
      {
        path: '',
        component: HomeComponent
      },
      {
        path: 'bluray',
        component: CollectionComponent,
        data: {
          collectionKey: 'bluray-collection',
          collectionTitle: 'Blu-ray Collection',
          collectionIcon: 'pi-video',
          itemLabel: 'movie',
          initialItems: INITIAL_MOVIES
        }
      },
      {
        path: 'games',
        component: CollectionComponent,
        data: {
          collectionKey: 'games-collection',
          collectionTitle: 'Games Collection',
          collectionIcon: 'pi-desktop',
          itemLabel: 'game',
          initialItems: []
        }
      },
      { path: '**', redirectTo: '' }
    ], withComponentInputBinding())
  ]
};
