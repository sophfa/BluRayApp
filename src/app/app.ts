import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs';
import { AuthRoleService } from './auth-role.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router);
  protected readonly authRoles = inject(AuthRoleService);
  protected readonly returnTo = document.baseURI;
  protected readonly isLoading$ = this.auth.isLoading$;
  protected readonly isAuthenticated$ = this.auth.isAuthenticated$;
  protected readonly primaryRole$ = this.authRoles.primaryRole$;
  protected menuOpen = false;
  protected readonly userDisplay$ = this.auth.user$.pipe(
    map((user) => user?.email ?? user?.name ?? user?.nickname ?? 'Signed in')
  );
  protected readonly authErrorMessage$ = this.auth.error$.pipe(
    map((error) => {
      if (!error) {
        return '';
      }

      if (typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        return typeof message === 'string' ? message : 'Authentication error';
      }

      return String(error);
    })
  );

  protected logIn() {
    void this.auth.loginWithRedirect();
  }

  protected signUp() {
    void this.auth.loginWithRedirect({
      authorizationParams: {
        screen_hint: 'signup'
      }
    });
  }

  protected toggleSessionMenu() {
    this.menuOpen = !this.menuOpen;
  }

  protected closeSessionMenu() {
    this.menuOpen = false;
  }

  protected openNotifications() {
    this.closeSessionMenu();
    void this.router.navigate(['/notifications']);
  }

  protected openSettings() {
    this.closeSessionMenu();
    void this.router.navigate(['/settings']);
  }

  protected openSuggestions() {
    this.closeSessionMenu();
    void this.router.navigate(['/suggestions']);
  }

  protected logOut() {
    this.closeSessionMenu();
    void this.auth.logout({
      logoutParams: {
        returnTo: this.returnTo
      }
    });
  }
}
