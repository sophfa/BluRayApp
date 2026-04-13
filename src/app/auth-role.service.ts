import { Injectable, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, firstValueFrom, map, of, timeout } from 'rxjs';

export type AppRole = 'admin' | 'user';

const ROLES_CLAIM = 'https://mycollection.uk/roles';

@Injectable({ providedIn: 'root' })
export class AuthRoleService {
  private readonly auth = inject(AuthService);

  public readonly roles$ = this.auth.idTokenClaims$.pipe(
    map((claims) => this.extractRoles(claims))
  );

  public readonly isAdmin$ = this.roles$.pipe(
    map((roles) => roles.includes('admin'))
  );

  public readonly primaryRole$ = this.isAdmin$.pipe(
    map((isAdmin) => isAdmin ? 'admin' : 'user')
  );

  public async getRoles(): Promise<string[]> {
    return firstValueFrom(
      this.roles$.pipe(
        timeout({ first: 5000 }),
        catchError(() => of([]))
      )
    );
  }

  public async isAdmin(): Promise<boolean> {
    const roles = await this.getRoles();
    return roles.includes('admin');
  }

  public async getPrimaryRole(): Promise<AppRole> {
    return (await this.isAdmin()) ? 'admin' : 'user';
  }

  private extractRoles(claims: unknown): string[] {
    if (!claims || typeof claims !== 'object') {
      return [];
    }

    const record = claims as Record<string, unknown>;
    const namespaced = this.normalizeRoleValue(record[ROLES_CLAIM]);
    if (namespaced.length > 0) {
      return namespaced;
    }

    const explicitRoles = this.normalizeRoleValue(record['roles']);
    if (explicitRoles.length > 0) {
      return explicitRoles;
    }

    const singleRole = this.normalizeRoleValue(record['role']);
    return singleRole;
  }

  private normalizeRoleValue(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    }

    if (typeof value === 'string' && value.trim()) {
      return [value.trim().toLowerCase()];
    }

    return [];
  }
}
