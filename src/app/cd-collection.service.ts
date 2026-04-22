import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { CdAlbum, CdCompilation, CdWishlistItem, CdRsEntry } from './cd-types';

@Injectable({ providedIn: 'root' })
export class CdCollectionService {
  private readonly supabase = inject(SupabaseService);

  public async loadAlbums(): Promise<CdAlbum[]> {
    return this.load<CdAlbum>('cd_albums', 'seq_num');
  }

  public async loadCompilations(): Promise<CdCompilation[]> {
    return this.load<CdCompilation>('cd_compilations', 'seq_num');
  }

  public async loadWishlist(): Promise<CdWishlistItem[]> {
    return this.load<CdWishlistItem>('cd_wishlist', 'artist');
  }

  public async loadRs2012(): Promise<CdRsEntry[]> {
    return this.load<CdRsEntry>('cd_rs_2012', 'rs_rank');
  }

  public async loadRs2020(): Promise<CdRsEntry[]> {
    return this.load<CdRsEntry>('cd_rs_2020', 'rs_rank');
  }

  private async load<T>(table: string, orderCol: string): Promise<T[]> {
    const client = await this.supabase.getClient();
    if (!client) return [];
    const userId = await this.supabase.getCurrentUserId();
    if (!userId) return [];
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderCol, { ascending: true });
    if (error) {
      console.warn(`CdCollectionService: failed to load ${table}`, error);
      return [];
    }
    return (data ?? []) as T[];
  }
}
