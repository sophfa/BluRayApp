export type RsTier = 'top-50' | '51-100' | '101-250' | '251-500';

export type CdSubTab = 'albums' | 'compilations' | 'wishlist' | 'rs2012' | 'rs2020';

export interface CdAlbum {
  id: number;
  user_id: string;
  seq_num: number | null;
  release_date: string | null;
  artist: string;
  year: number | null;
  title: string;
  publisher: string | null;
  allmusic_rating: number | null;
  album_pick: boolean;
  is_5star: boolean;
  is_4half_star: boolean;
  rs_tier: RsTier | null;
  rs_top500: boolean | null;
  notes: string | null;
  tags: string[];
}

export interface CdCompilation {
  id: number;
  user_id: string;
  seq_num: number | null;
  release_date: string | null;
  artist: string;
  year: number | null;
  title: string;
  publisher: string | null;
  allmusic_rating: number | null;
  album_pick: boolean;
  is_5star: boolean;
  is_4half_star: boolean;
  notes: string | null;
  tags: string[];
}

export interface CdWishlistItem {
  id: number;
  user_id: string;
  release_date: string | null;
  artist: string;
  year: number | null;
  title: string;
  publisher: string | null;
  allmusic_rating: number | null;
  album_pick: boolean;
  is_5star: boolean;
  is_4half_star: boolean;
  is_4star: boolean;
  rs_tier: RsTier | null;
  rs_top500: boolean | null;
  notes: string | null;
  tags: string[];
}

export interface CdRsEntry {
  id: number;
  user_id: string;
  rs_rank: number;
  entry_text: string;
  owned: boolean;
}

export type CdSortField = 'year' | 'artist' | 'title' | 'allmusic_rating' | 'rs_rank';
export type CdSortDir = 'asc' | 'desc';
