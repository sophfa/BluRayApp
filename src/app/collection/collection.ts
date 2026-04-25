import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { MenuModule } from 'primeng/menu';
import { AuthService } from '@auth0/auth0-angular';
import { map } from 'rxjs';
import { Movie } from '../movies.data';
import { CollectionStorageService } from '../collection-storage.service';
import { ProfileService } from '../profile.service';
import { AuthRoleService } from '../auth-role.service';
import { CollectionDefinition, getCollectionDefinition, normalizeEnabledCollections } from '../collection-types';
import { TagColorService, TagColor } from '../tag-color.service';
import { CdCollectionService } from '../cd-collection.service';
import { CdAlbum, CdCompilation, CdWishlistItem, CdRsEntry, CdSubTab, RsTier, CdSortField, CdSortDir } from '../cd-types';

type SortField = 'id' | 'title';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ConfirmPopupModule, MenuModule],
  templateUrl: './collection.html',
  styleUrl: './collection.scss'
})
export class CollectionComponent implements OnInit {
  public collections: Array<{ path: string; label: string; icon: string }> = [];

  public movies = signal<Movie[]>([]);
  public isLoaded = false;

  public activeCollectionPath = 'bluray';
  public collectionKey = '';
  public collectionTitle = '';
  public collectionIcon = '';
  public itemLabel = 'item';
  public isWishlist = false;

  public searchQuery = '';
  public sortField: SortField = 'id';
  public sortDir: SortDir = 'asc';

  public showModal = false;
  public isEditing = false;
  public modalMovie: Partial<Movie> = {};
  public modalTags = '';
  public bookModalCategories = '';
  public bookModalSourceLists = '';
  public bookModalImportFlags = '';
  public editingMovieId: number | null = null;
  public movieMenuItems: MenuItem[] = [];
  public rsMenuItems: MenuItem[] = [];

  // friend view
  public isReadOnly = false;
  public friendUsername = '';
  public friendDisplayName = '';
  public loadError = '';

  // hide (temporary mass-edit helper)
  public hiddenIds = new Set<number>();

  // drag-to-reorder (games only)
  public draggingIndex: number | null = null;
  public dragOverIndex: number | null = null;

  // tag color picker
  public colorPickerTag: string | null = null;
  public tagColors: Record<string, TagColor> = {};

  public accountMenuOpen = false;

  // ── Music / CD catalogue ──────────────────────────────────
  public cdSubTab = signal<CdSubTab>('albums');
  public cdAlbums = signal<CdAlbum[]>([]);
  public cdCompilations = signal<CdCompilation[]>([]);
  public cdWishlist = signal<CdWishlistItem[]>([]);
  public cdRs2012 = signal<CdRsEntry[]>([]);
  public cdRs2020 = signal<CdRsEntry[]>([]);
  public cdLoaded = false;

  // CD filter/sort state
  public cdSearch = '';
  public cdSortField: CdSortField = 'year';
  public cdSortDir: CdSortDir = 'asc';
  public cdRatingFilter: number | null = null;   // null=all, 5, 4.5, 4
  public cdTierFilter: RsTier | null = null;     // null=all
  public cdAlbumPickOnly = false;
  public cdOwnedOnly = false;                    // for RS lists

  // CD edit modal
  public showCdModal = false;
  public cdModalItem: Partial<CdAlbum & CdCompilation & CdWishlistItem> = {};
  public cdModalTags = '';
  public cdModalRating: number | null = null;

  private readonly auth = inject(AuthService);
  private readonly authRoles = inject(AuthRoleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(CollectionStorageService);
  private readonly profileService = inject(ProfileService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly tagColorService = inject(TagColorService);
  private readonly cdService = inject(CdCollectionService);

  public readonly userDisplay$ = this.auth.user$.pipe(
    map(u => u?.email ?? u?.name ?? u?.nickname ?? 'Signed in')
  );
  public readonly primaryRole$ = this.authRoles.primaryRole$;

  public get tagColorPresets(): TagColor[] {
    return this.tagColorService.presets;
  }

  public ngOnInit() {
    const data = this.route.snapshot.data;
    const params = this.route.snapshot.params;
    this.isReadOnly = !!data['readOnly'];
    this.isWishlist = !!data['isWishlist'];
    this.friendUsername = params['username'] ?? '';
    this.activeCollectionPath = data['collectionType'] ?? params['collectionType'] ?? this.route.snapshot.routeConfig?.path?.split('/').pop() ?? 'bluray';
    this.applyDefinition(getCollectionDefinition(this.activeCollectionPath), this.isWishlist);
    this.setVisibleCollections([this.activeCollectionPath]);
    void this.initialize();
  }

  private async initialize() {
    if (this.isReadOnly && this.friendUsername) {
      try {
        const profile = await this.profileService.getByUsername(this.friendUsername);
        if (profile) {
          this.friendDisplayName = profile.username;
          this.setVisibleCollections(profile.enabled_collections);
          if (!this.isCollectionVisible(this.activeCollectionPath)) {
            void this.router.navigate(['/friends', this.friendUsername, this.collections[0]?.path ?? 'bluray']);
            return;
          }
          const loaded = await this.storage.loadMoviesForUser(profile.auth0_id, this.collectionKey);
          this.movies.set(loaded);
        } else {
          this.loadError = 'Friend profile was not found.';
        }
      } catch (error) {
        console.warn('Failed to load friend collection', error);
        this.loadError = 'Friend collections are blocked until the accepted-friends read policy is added in Supabase.';
      }
      this.isLoaded = true;
      return;
    }
    const profile = this.profileService.current() ?? await this.profileService.loadForCurrentUser();
    this.setVisibleCollections(profile?.enabled_collections);
    if (!this.isCollectionVisible(this.activeCollectionPath)) {
      void this.router.navigate(['/', this.collections[0]?.path ?? 'bluray']);
      return;
    }
    const initial = this.isWishlist ? [] : getCollectionDefinition(this.activeCollectionPath).initialItems;
    const loaded = await this.storage.loadMovies(this.collectionKey, initial);
    const normalized = this.isGameCollection ? this.normalizeGameIds(loaded) : loaded;
    if (this.isGameCollection && this.gameIdsChanged(loaded, normalized)) {
      void this.storage.saveMovies(this.collectionKey, normalized);
    }
    this.movies.set(normalized);
    this.isLoaded = true;
    await this.loadTagColors();
    if (this.activeCollectionPath === 'music') {
      void this.initCdData();
    }
  }

  private async initCdData() {
    const [albums, compilations, wishlist, rs2012, rs2020] = await Promise.all([
      this.cdService.loadAlbums(),
      this.cdService.loadCompilations(),
      this.cdService.loadWishlist(),
      this.cdService.loadRs2012(),
      this.cdService.loadRs2020(),
    ]);
    this.cdAlbums.set(albums);
    this.cdCompilations.set(compilations);
    this.cdWishlist.set(wishlist);
    this.cdRs2012.set(rs2012);
    this.cdRs2020.set(rs2020);
    this.cdLoaded = true;
  }

  private save() {
    void this.storage.saveMovies(this.collectionKey, this.movies());
  }

  public get filtered(): Movie[] {
    let list = this.movies().filter(m => !this.hiddenIds.has(m.id));
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        String(m.id).includes(q) ||
        (m.tags ?? []).some(tag => tag.toLowerCase().includes(q)) ||
        (this.isBookCollection && [
          m.authorSurname,
          m.authorGivenNames,
          m.publicationYear,
          m.publicationPlace,
          m.publisher,
          m.binding,
          m.deweyClass,
          m.storageLocation,
          m.price,
          m.listNote,
          ...(m.bookCategories ?? []),
          ...(m.sourceLists ?? []),
          ...(m.importFlags ?? []),
        ].some(value => value?.toLowerCase().includes(q)))
      );
    }
    return [...list].sort((a, b) => {
      const cmp = this.sortField === 'id' ? a.id - b.id : a.title.localeCompare(b.title);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  public get totalCount() { return this.movies().length; }
  public get hiddenCount() { return this.hiddenIds.size; }

  public hideMovie(id: number) {
    this.hiddenIds = new Set(this.hiddenIds).add(id);
  }

  public unhideAll() {
    this.hiddenIds = new Set();
  }
  public get isGameCollection() { return this.itemLabel === 'game'; }
  public get isBookCollection() { return this.activeCollectionPath === 'books'; }
  public get primarySortField(): SortField { return 'id'; }
  public get primarySortLabel() { return this.isGameCollection ? 'Order' : '#'; }
  public get searchPlaceholder() {
    if (this.isBookCollection) {
      return 'Search title, author, class, category, or notes...';
    }
    return 'Search by title, number, or tag...';
  }

  // ── Wishlist ──────────────────────────────────────────────
  public toggleWishlist() {
    if (this.isWishlist) {
      void this.router.navigate(['/', this.activeCollectionPath]);
    } else {
      void this.router.navigate(['/', this.activeCollectionPath + '-wishlist']);
    }
  }

  // ── Navigation ────────────────────────────────────────────
  public goToFriends() {
    void this.router.navigate(['/friends']);
  }

  public toggleAccountMenu() { this.accountMenuOpen = !this.accountMenuOpen; }
  public closeAccountMenu()  { this.accountMenuOpen = false; }

  public openSettings()      { this.closeAccountMenu(); void this.router.navigate(['/settings']); }
  public openNotifications() { this.closeAccountMenu(); void this.router.navigate(['/notifications']); }
  public openSuggestions()   { this.closeAccountMenu(); void this.router.navigate(['/suggestions']); }

  public logOut() {
    this.closeAccountMenu();
    void this.auth.logout({ logoutParams: { returnTo: document.baseURI } });
  }

  public switchCollection(path: string) {
    if (!path) return;
    // Allow re-clicking the active base tab to exit wishlist mode
    if (path === this.activeCollectionPath && !this.isWishlist) return;
    if (this.isReadOnly && this.friendUsername) {
      void this.router.navigate(['/friends', this.friendUsername, path]);
    } else {
      void this.router.navigate(['/', path]);
    }
  }

  // ── Sort ──────────────────────────────────────────────────
  public setSort(field: SortField) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
  }

  // ── Modal ─────────────────────────────────────────────────
  public openAdd() {
    const maxId = Math.max(...this.movies().map(m => m.id), 0);
    this.modalMovie = {
      id: this.isGameCollection ? 1 : maxId + 1,
      title: '',
      notes: '',
      tags: [],
      platinumed: false,
      platform: '',
      format: '',
      authorSurname: '',
      authorGivenNames: '',
      publicationYear: '',
      publicationPlace: '',
      publisher: '',
      binding: '',
      deweyClass: '',
      storageLocation: '',
      price: '',
      listNote: '',
      bookCategories: [],
      sourceLists: [],
      importFlags: [],
    };
    this.modalTags = '';
    this.bookModalCategories = '';
    this.bookModalSourceLists = '';
    this.bookModalImportFlags = '';
    this.editingMovieId = null;
    this.isEditing = false;
    this.colorPickerTag = null;
    this.showModal = true;
  }

  public saveModal() {
    const title = this.modalMovie.title?.trim();
    if (!title) return;
    const draft = this.buildMovieDraft(title);
    if (this.isGameCollection) {
      this.movies.update(list => this.saveGameMovie(list, draft));
      this.sortField = 'id';
      this.sortDir = 'asc';
    } else if (this.isEditing) {
      this.movies.update(list => list.map(m =>
        m.id === this.modalMovie.id ? { ...m, ...draft } : m
      ));
    } else {
      this.movies.update(list => {
        const nextMovie: Movie = { id: this.modalMovie.id!, ...draft };
        return [...list, nextMovie];
      });
    }
    this.save();
    this.modalTags = '';
    this.bookModalCategories = '';
    this.bookModalSourceLists = '';
    this.bookModalImportFlags = '';
    this.editingMovieId = null;
    this.colorPickerTag = null;
    this.showModal = false;
  }

  public deleteMovie(movie: Movie) {
    this.movies.update(list => {
      const next = list.filter(m => m.id !== movie.id);
      return this.isGameCollection ? this.normalizeGameIds(next) : next;
    });
    this.save();
  }

  public openEdit(movie: Movie) {
    this.modalMovie = { ...movie };
    this.modalTags = (movie.tags ?? []).join(', ');
    this.bookModalCategories = (movie.bookCategories ?? []).join(', ');
    this.bookModalSourceLists = (movie.sourceLists ?? []).join(', ');
    this.bookModalImportFlags = (movie.importFlags ?? []).join(', ');
    this.editingMovieId = movie.id;
    this.isEditing = true;
    this.colorPickerTag = null;
    this.showModal = true;
  }

  public openMovieMenu(movie: Movie, menu: { toggle(e: Event): void }, event: Event) {
    event.stopPropagation();
    const items: MenuItem[] = this.isGameCollection
      ? [
          { label: 'Edit game', icon: 'pi pi-pencil', command: () => this.openEdit(movie) },
          { label: 'Move to top', icon: 'pi pi-arrow-up', command: () => this.moveToTop(movie) },
          { label: 'Move to bottom', icon: 'pi pi-arrow-down', command: () => this.moveToBottom(movie) },
        ]
      : [{ label: `Edit ${this.itemLabel}`, icon: 'pi pi-pencil', command: () => this.openEdit(movie) }];
    items.push(
      { separator: true },
      {
        label: `Delete ${this.itemLabel}`,
        icon: 'pi pi-trash',
        styleClass: 'danger-menu-item',
        command: (e: { originalEvent?: Event }) => this.confirmDelete(movie, e.originalEvent ?? event)
      }
    );
    this.movieMenuItems = items;
    menu.toggle(event);
  }

  public confirmDelete(movie: Movie, event: Event) {
    event.stopPropagation();
    const target = (event.currentTarget ?? event.target) as HTMLElement | null;
    const message = `Delete "${movie.title}"? This cannot be undone.`;
    if (!target) {
      if (window.confirm(message)) this.deleteMovie(movie);
      return;
    }
    this.confirmationService.confirm({
      target,
      message,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger p-button-sm',
      rejectButtonStyleClass: 'p-button-text p-button-sm',
      accept: () => this.deleteMovie(movie)
    });
  }

  public trackById(_: number, m: Movie) { return m.id; }

  public bookAuthor(movie: Movie): string {
    return [movie.authorSurname, movie.authorGivenNames].filter(Boolean).join(', ');
  }

  // ── Tag autocomplete ───────────────────────────────────────
  public get allExistingTags(): string[] {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const movie of this.movies()) {
      for (const tag of movie.tags ?? []) {
        const lower = tag.toLowerCase();
        if (!seen.has(lower)) { seen.add(lower); tags.push(tag); }
      }
    }
    return tags.sort((a, b) => a.localeCompare(b));
  }

  public get parsedModalTags(): string[] {
    return this.parseTags(this.modalTags);
  }

  public get tagAutocompleteSuggestions(): string[] {
    const parts = this.modalTags.split(',');
    const partial = parts[parts.length - 1].trim().toLowerCase();
    if (!partial) return [];
    const current = new Set(this.parsedModalTags.map(t => t.toLowerCase()));
    return this.allExistingTags
      .filter(t => t.toLowerCase().startsWith(partial) && !current.has(t.toLowerCase()) && t.toLowerCase() !== partial)
      .slice(0, 8);
  }

  public selectTagSuggestion(tag: string) {
    const parts = this.modalTags.split(',');
    parts[parts.length - 1] = tag;
    this.modalTags = parts.join(',').replace(/^\s*,\s*/, '') + ', ';
  }

  // ── Tag colors ─────────────────────────────────────────────
  private async loadTagColors(): Promise<void> {
    const remote = await this.storage.loadTagColors(this.baseCollectionKey);
    if (Object.keys(remote).length > 0) {
      this.tagColors = remote as Record<string, TagColor>;
      this.tagColorService.setAll(this.baseCollectionKey, this.tagColors);
    } else {
      this.tagColors = this.tagColorService.getAll(this.baseCollectionKey);
    }
  }

  public getTagColor(tag: string): TagColor | null {
    return this.tagColors[tag.toLowerCase()] ?? null;
  }

  public openColorPicker(tag: string, event: Event) {
    event.stopPropagation();
    this.colorPickerTag = this.colorPickerTag === tag ? null : tag;
  }

  public setTagColor(tag: string, color: TagColor) {
    this.tagColorService.set(this.baseCollectionKey, tag, color);
    this.tagColors = this.tagColorService.getAll(this.baseCollectionKey);
    this.colorPickerTag = null;
    void this.storage.saveTagColors(this.baseCollectionKey, this.tagColors as Record<string, unknown>);
  }

  public clearTagColor(tag: string) {
    this.tagColorService.set(this.baseCollectionKey, tag, null);
    this.tagColors = this.tagColorService.getAll(this.baseCollectionKey);
    this.colorPickerTag = null;
    void this.storage.saveTagColors(this.baseCollectionKey, this.tagColors as Record<string, unknown>);
  }

  public closeColorPicker() {
    this.colorPickerTag = null;
  }

  // ── Drag to reorder (games) ────────────────────────────────
  public moveToTop(movie: Movie) {
    const list = this.movies().filter(m => m.id !== movie.id);
    list.unshift({ ...movie });
    this.movies.set(this.normalizeGameIds(list));
    this.save();
  }

  public moveToBottom(movie: Movie) {
    const list = this.movies().filter(m => m.id !== movie.id);
    list.push({ ...movie });
    this.movies.set(this.normalizeGameIds(list));
    this.save();
  }

  public onDragStart(event: DragEvent, filteredIndex: number) {
    this.draggingIndex = filteredIndex;
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  public onDragOver(event: DragEvent, filteredIndex: number) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverIndex = filteredIndex;
  }

  public onDrop(event: DragEvent, toIndex: number) {
    event.preventDefault();
    if (this.draggingIndex === null || this.draggingIndex === toIndex) {
      this.draggingIndex = null;
      this.dragOverIndex = null;
      return;
    }
    const filtered = this.filtered;
    const fromMovie = filtered[this.draggingIndex];
    const toMovie = filtered[toIndex];
    if (!fromMovie || !toMovie) { this.draggingIndex = null; this.dragOverIndex = null; return; }
    const list = [...this.movies()];
    const fromIdx = list.findIndex(m => m.id === fromMovie.id);
    const toIdx = list.findIndex(m => m.id === toMovie.id);
    if (fromIdx === -1 || toIdx === -1) { this.draggingIndex = null; this.dragOverIndex = null; return; }
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    this.movies.set(this.normalizeGameIds(list));
    this.save();
    this.draggingIndex = null;
    this.dragOverIndex = null;
  }

  public onDragEnd() {
    this.draggingIndex = null;
    this.dragOverIndex = null;
  }

  // ── CD catalogue helpers ──────────────────────────────────
  public get isMusicCollection() { return this.activeCollectionPath === 'music'; }

  public setCdSubTab(tab: CdSubTab) {
    this.cdSubTab.set(tab);
    this.cdSearch = '';
    this.cdRatingFilter = null;
    this.cdTierFilter = null;
    this.cdAlbumPickOnly = false;
    this.cdOwnedOnly = false;
    this.cdSortField = tab === 'rs2012' || tab === 'rs2020' ? 'rs_rank' : 'year';
    this.cdSortDir = 'asc';
  }

  public setCdSort(field: CdSortField) {
    if (this.cdSortField === field) {
      this.cdSortDir = this.cdSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.cdSortField = field;
      this.cdSortDir = field === 'allmusic_rating' ? 'desc' : 'asc';
    }
  }

  public get cdRatingLabel(): string {
    if (this.cdRatingFilter === 5)   return '5★';
    if (this.cdRatingFilter === 4.5) return '4.5★';
    if (this.cdRatingFilter === 4)   return '4★';
    return 'All ratings';
  }

  public get cdTierLabel(): string {
    if (!this.cdTierFilter) return 'All tiers';
    const map: Record<RsTier, string> = { 'top-50': 'Top 50', '51-100': '51–100', '101-250': '101–250', '251-500': '251–500' };
    return map[this.cdTierFilter];
  }

  public ratingStars(rating: number | null): string {
    if (rating === 5)   return '★★★★★';
    if (rating === 4.5) return '★★★★½';
    if (rating === 4)   return '★★★★';
    return '';
  }

  public tierLabel(tier: RsTier | null): string {
    if (!tier) return '';
    const map: Record<RsTier, string> = { 'top-50': 'RS Top 50', '51-100': 'RS 51–100', '101-250': 'RS 101–250', '251-500': 'RS 251–500' };
    return map[tier];
  }

  public get filteredCdAlbums(): CdAlbum[] {
    return this.filterAndSortCdAlbums(this.cdAlbums());
  }

  public get filteredCdCompilations(): CdCompilation[] {
    const q = this.cdSearch.trim().toLowerCase();
    let list = this.cdCompilations();
    if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
    if (this.cdRatingFilter !== null) list = list.filter(a => a.allmusic_rating === this.cdRatingFilter);
    if (this.cdAlbumPickOnly) list = list.filter(a => a.album_pick);
    return this.sortCdList(list, this.cdSortField, this.cdSortDir) as CdCompilation[];
  }

  public get filteredCdWishlist(): CdWishlistItem[] {
    const q = this.cdSearch.trim().toLowerCase();
    let list = this.cdWishlist();
    if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
    if (this.cdRatingFilter !== null) list = list.filter(a => a.allmusic_rating === this.cdRatingFilter);
    if (this.cdTierFilter) list = list.filter(a => a.rs_tier === this.cdTierFilter);
    if (this.cdAlbumPickOnly) list = list.filter(a => a.album_pick);
    return this.sortCdList(list, this.cdSortField, this.cdSortDir) as CdWishlistItem[];
  }

  public get filteredCdRs2012(): CdRsEntry[] {
    return this.filterCdRs(this.cdRs2012());
  }

  public get filteredCdRs2020(): CdRsEntry[] {
    return this.filterCdRs(this.cdRs2020());
  }

  private filterAndSortCdAlbums(list: CdAlbum[]): CdAlbum[] {
    const q = this.cdSearch.trim().toLowerCase();
    if (q) list = list.filter(a => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
    if (this.cdRatingFilter !== null) list = list.filter(a => a.allmusic_rating === this.cdRatingFilter);
    if (this.cdTierFilter) list = list.filter(a => a.rs_tier === this.cdTierFilter);
    if (this.cdAlbumPickOnly) list = list.filter(a => a.album_pick);
    return this.sortCdList(list, this.cdSortField, this.cdSortDir) as CdAlbum[];
  }

  private filterCdRs(list: CdRsEntry[]): CdRsEntry[] {
    const q = this.cdSearch.trim().toLowerCase();
    if (q) list = list.filter(e => e.entry_text.toLowerCase().includes(q));
    if (this.cdOwnedOnly) list = list.filter(e => e.owned);
    return [...list].sort((a, b) => {
      const cmp = a.rs_rank - b.rs_rank;
      return this.cdSortDir === 'asc' ? cmp : -cmp;
    });
  }

  // ── CD edit modal ─────────────────────────────────────────
  public openCdEdit(item: CdAlbum | CdCompilation | CdWishlistItem) {
    this.cdModalItem = { ...(item as any) };
    this.cdModalTags = ((item as any).tags ?? []).join(', ');
    const r = (item as any).allmusic_rating as number | null;
    this.cdModalRating = r ?? null;
    this.showCdModal = true;
  }

  public closeCdModal() {
    this.showCdModal = false;
    this.cdModalItem = {};
    this.cdModalTags = '';
    this.cdModalRating = null;
  }

  public async saveCdEdit(): Promise<void> {
    const id = this.cdModalItem.id;
    if (!id) return;
    const tags = this.parseTags(this.cdModalTags);
    const rating = this.cdModalRating;
    const base = {
      year: this.cdModalItem.year ?? null,
      artist: (this.cdModalItem.artist ?? '').trim(),
      title: (this.cdModalItem.title ?? '').trim(),
      publisher: (this.cdModalItem.publisher ?? '').trim() || null,
      allmusic_rating: rating,
      is_5star: rating === 5,
      is_4half_star: rating === 4.5,
      album_pick: !!(this.cdModalItem as any).album_pick,
      notes: ((this.cdModalItem as any).notes ?? '').trim() || null,
      tags,
    };
    const tab = this.cdSubTab();
    let ok = false;
    if (tab === 'albums') {
      const updates: Partial<CdAlbum> = {
        ...base,
        rs_tier: (this.cdModalItem as CdAlbum).rs_tier ?? null,
        rs_top500: (this.cdModalItem as CdAlbum).rs_top500 ?? null,
      };
      ok = await this.cdService.updateAlbum(id, updates);
      if (ok) this.cdAlbums.update(list => list.map(a => a.id === id ? { ...a, ...updates } : a));
    } else if (tab === 'compilations') {
      const updates: Partial<CdCompilation> = base;
      ok = await this.cdService.updateCompilation(id, updates);
      if (ok) this.cdCompilations.update(list => list.map(a => a.id === id ? { ...a, ...updates } : a));
    } else if (tab === 'wishlist') {
      const updates: Partial<CdWishlistItem> = {
        ...base,
        is_4star: rating === 4,
        rs_tier: (this.cdModalItem as CdWishlistItem).rs_tier ?? null,
        rs_top500: (this.cdModalItem as CdWishlistItem).rs_top500 ?? null,
      };
      ok = await this.cdService.updateWishlistItem(id, updates);
      if (ok) this.cdWishlist.update(list => list.map(a => a.id === id ? { ...a, ...updates } : a));
    }
    if (ok) this.closeCdModal();
  }

  public openRsMenu(entry: CdRsEntry, menu: { toggle(e: Event): void }, event: Event): void {
    event.stopPropagation();
    const tab = this.cdSubTab();
    if (tab !== 'rs2012' && tab !== 'rs2020') return;
    this.rsMenuItems = [
      {
        label: entry.owned ? 'Mark as not owned' : 'Mark as owned',
        icon: entry.owned ? 'pi pi-times-circle' : 'pi pi-check-circle',
        command: () => void this.toggleRsOwned(entry, tab)
      }
    ];
    menu.toggle(event);
  }

  public async toggleRsOwned(entry: CdRsEntry, tab?: 'rs2012' | 'rs2020'): Promise<void> {
    const activeTab = tab ?? this.cdSubTab();
    if (activeTab !== 'rs2012' && activeTab !== 'rs2020') return;
    const table = activeTab === 'rs2012' ? 'cd_rs_2012' : 'cd_rs_2020';
    const newOwned = !entry.owned;
    const ok = await this.cdService.toggleRsOwned(table, entry.id, newOwned);
    if (!ok) return;
    if (activeTab === 'rs2012') {
      this.cdRs2012.update(list => list.map(e => e.id === entry.id ? { ...e, owned: newOwned } : e));
    } else {
      this.cdRs2020.update(list => list.map(e => e.id === entry.id ? { ...e, owned: newOwned } : e));
    }
  }

  private sortCdList(list: unknown[], field: CdSortField, dir: CdSortDir): unknown[] {
    return [...list].sort((a: any, b: any) => {
      let cmp = 0;
      if (field === 'year')            cmp = (a.year ?? 9999) - (b.year ?? 9999);
      else if (field === 'artist')     cmp = (a.artist ?? '').localeCompare(b.artist ?? '');
      else if (field === 'title')      cmp = a.title.localeCompare(b.title);
      else if (field === 'allmusic_rating') cmp = (a.allmusic_rating ?? 0) - (b.allmusic_rating ?? 0);
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  // ── Private helpers ────────────────────────────────────────
  private get baseCollectionKey(): string {
    // Share tag colors between a collection and its wishlist
    return this.isWishlist
      ? this.collectionKey.replace(/-wishlist$/, '-collection')
      : this.collectionKey;
  }

  private applyDefinition(definition: CollectionDefinition, isWishlist = false) {
    this.activeCollectionPath = definition.path;
    this.collectionKey = isWishlist ? `${definition.type}-wishlist` : `${definition.type}-collection`;
    this.collectionTitle = isWishlist ? `${definition.title} — Wishlist` : definition.title;
    this.collectionIcon = isWishlist ? 'pi-heart' : definition.icon;
    this.itemLabel = definition.itemLabel;
  }

  private setVisibleCollections(enabledCollections: unknown) {
    const enabled = normalizeEnabledCollections(enabledCollections);
    this.collections = enabled.map((type) => {
      const definition = getCollectionDefinition(type);
      return { path: definition.path, label: definition.label, icon: definition.icon };
    });
  }

  private isCollectionVisible(path: string) {
    return this.collections.some((collection) => collection.path === path);
  }

  private buildMovieDraft(title: string): Omit<Movie, 'id'> {
    if (this.isBookCollection) {
      return {
        title,
        notes: this.normalizeText(this.modalMovie.notes),
        tags: this.parseTags(this.modalTags),
        authorSurname: this.normalizeText(this.modalMovie.authorSurname),
        authorGivenNames: this.normalizeText(this.modalMovie.authorGivenNames),
        publicationYear: this.normalizeText(this.modalMovie.publicationYear),
        publicationPlace: this.normalizeText(this.modalMovie.publicationPlace),
        publisher: this.normalizeText(this.modalMovie.publisher),
        binding: this.normalizeText(this.modalMovie.binding),
        deweyClass: this.normalizeText(this.modalMovie.deweyClass),
        storageLocation: this.normalizeText(this.modalMovie.storageLocation),
        price: this.normalizeText(this.modalMovie.price),
        listNote: this.normalizeText(this.modalMovie.listNote),
        bookCategories: this.parseSimpleList(this.bookModalCategories),
        sourceLists: this.parseSimpleList(this.bookModalSourceLists),
        importFlags: this.parseSimpleList(this.bookModalImportFlags),
      };
    }

    if (this.isGameCollection) {
      return {
        title,
        notes: this.normalizeText(this.modalMovie.notes),
        platform: this.normalizeText(this.modalMovie.platform),
        format: this.normalizeFormat(this.modalMovie.format),
        platinumed: !!this.modalMovie.platinumed,
        tags: this.parseTags(this.modalTags),
      };
    }

    return {
      title,
      notes: this.normalizeText(this.modalMovie.notes),
      tags: this.parseTags(this.modalTags),
    };
  }

  private normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalizeFormat(value: unknown): Movie['format'] {
    return value === 'disc' || value === 'digital' ? value : '';
  }

  private parseSimpleList(value: unknown) {
    return this.parseTags(value);
  }

  private parseTags(value: unknown) {
    if (typeof value !== 'string') return [];
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const rawTag of value.split(',')) {
      const tag = rawTag.trim();
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
    return tags;
  }

  private saveGameMovie(list: Movie[], draft: Omit<Movie, 'id'>) {
    const targetPosition = this.normalizeGamePosition(this.modalMovie.id, list.length + (this.isEditing ? 0 : 1));

    if (this.isEditing && this.editingMovieId !== null) {
      const currentMovie = list.find(movie => movie.id === this.editingMovieId);
      if (!currentMovie) return list;
      const next = list.filter(movie => movie.id !== this.editingMovieId);
      next.splice(targetPosition - 1, 0, { ...currentMovie, ...draft, id: targetPosition });
      return this.normalizeGameIds(next);
    }

    const next = [...list];
    next.splice(targetPosition - 1, 0, { id: targetPosition, ...draft });
    return this.normalizeGameIds(next);
  }

  private normalizeGamePosition(value: unknown, maxPosition: number) {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return maxPosition;
    return Math.min(Math.max(Math.round(numeric), 1), maxPosition);
  }

  private normalizeGameIds(list: Movie[]) {
    return list.map((movie, index) => ({
      id: index + 1,
      title: movie.title,
      notes: this.normalizeText(movie.notes),
      tags: Array.isArray(movie.tags) ? movie.tags.filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()) : [],
      platform: this.normalizeText(movie.platform),
      format: this.normalizeFormat(movie.format),
      platinumed: !!movie.platinumed,
    }));
  }

  private gameIdsChanged(original: Movie[], normalized: Movie[]) {
    return original.length !== normalized.length || original.some((movie, index) =>
      movie.id !== normalized[index]?.id
    );
  }
}
