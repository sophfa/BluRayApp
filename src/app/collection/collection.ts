import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { MenuModule } from 'primeng/menu';
import { Movie, INITIAL_MOVIES } from '../movies.data';
import { CollectionStorageService } from '../collection-storage.service';
import { ProfileService } from '../profile.service';

type SortField = 'id' | 'title';
type SortDir = 'asc' | 'desc';

const INITIAL_DATA: Record<string, Movie[]> = {
  'bluray-collection': INITIAL_MOVIES.map(m => ({ ...m, notes: '' })),
  'games-collection': [],
};

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ConfirmPopupModule, MenuModule],
  templateUrl: './collection.html',
  styleUrl: './collection.scss'
})
export class CollectionComponent implements OnInit {
  public readonly collections = [
    { path: 'bluray', label: 'Blu-ray', icon: 'pi-video' },
    { path: 'games', label: 'Games', icon: 'pi-desktop' }
  ];

  public movies = signal<Movie[]>([]);
  public isLoaded = false;

  public activeCollectionPath = 'bluray';
  public collectionKey = '';
  public collectionTitle = '';
  public collectionIcon = '';
  public itemLabel = 'item';

  public searchQuery = '';
  public sortField: SortField = 'id';
  public sortDir: SortDir = 'asc';

  public showModal = false;
  public isEditing = false;
  public modalMovie: Partial<Movie> = {};
  public modalTags = '';
  public editingMovieId: number | null = null;
  public movieMenuItems: MenuItem[] = [];

  // friend view
  public isReadOnly = false;
  public friendUsername = '';
  public friendDisplayName = '';
  public loadError = '';

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(CollectionStorageService);
  private readonly profileService = inject(ProfileService);
  private readonly confirmationService = inject(ConfirmationService);

  public ngOnInit() {
    const data = this.route.snapshot.data;
    const params = this.route.snapshot.params;
    this.isReadOnly = !!data['readOnly'];
    this.friendUsername = params['username'] ?? '';
    this.activeCollectionPath = this.route.snapshot.routeConfig?.path?.split('/').pop() ?? 'bluray';
    this.collectionKey = data['collectionKey'];
    this.collectionTitle = data['collectionTitle'];
    this.collectionIcon = data['collectionIcon'];
    this.itemLabel = data['itemLabel'] ?? 'item';
    void this.initialize();
  }

  private async initialize() {
    if (this.isReadOnly && this.friendUsername) {
      try {
        const profile = await this.profileService.getByUsername(this.friendUsername);
        if (profile) {
          this.friendDisplayName = profile.username;
          const loaded = await this.storage.loadMoviesForUser(profile.auth0_id, this.collectionKey);
          this.movies.set(loaded);
        }
      } catch (error) {
        console.warn('Failed to load friend collection', error);
        this.loadError = 'Friend collections are blocked until the accepted-friends read policy is added in Supabase.';
      }
      this.isLoaded = true;
      return;
    }
    const initial = INITIAL_DATA[this.collectionKey] ?? [];
    const loaded = await this.storage.loadMovies(this.collectionKey, initial);
    const normalized = this.isGameCollection ? this.normalizeGameIds(loaded) : loaded;
    if (this.isGameCollection && this.gameIdsChanged(loaded, normalized)) {
      void this.storage.saveMovies(this.collectionKey, normalized);
    }
    this.movies.set(normalized);
    this.isLoaded = true;
  }

  private save() {
    void this.storage.saveMovies(this.collectionKey, this.movies());
  }

  public get filtered(): Movie[] {
    let list = this.movies();
    const q = this.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        String(m.id).includes(q) ||
        (!this.isGameCollection && (m.tags ?? []).some(tag => tag.toLowerCase().includes(q)))
      );
    }
    return [...list].sort((a, b) => {
      const cmp = this.sortField === 'id' ? a.id - b.id : a.title.localeCompare(b.title);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  public get totalCount() { return this.movies().length; }
  public get isGameCollection() { return this.itemLabel === 'game'; }
  public get primarySortField(): SortField { return 'id'; }
  public get primarySortLabel() { return this.isGameCollection ? 'Order' : '#'; }
  public get searchPlaceholder() {
    return this.isGameCollection ? 'Search by title or number...' : 'Search by title, number, or tag...';
  }

  public goToFriends() {
    void this.router.navigate(['/friends']);
  }

  public switchCollection(path: string) {
    if (!path || path === this.activeCollectionPath) return;
    if (this.isReadOnly && this.friendUsername) {
      void this.router.navigate(['/friends', this.friendUsername, path]);
    } else {
      void this.router.navigate(['/', path]);
    }
  }

  public setSort(field: SortField) {
    if (this.sortField === field) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDir = 'asc';
    }
  }

  public openAdd() {
    const maxId = Math.max(...this.movies().map(m => m.id), 0);
    this.modalMovie = {
      id: maxId + 1,
      title: '',
      notes: '',
      tags: [],
      platinumed: false,
      platform: '',
      format: '',
    };
    this.modalTags = '';
    this.editingMovieId = null;
    this.isEditing = false;
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
        const nextMovie: Movie = {
          id: this.modalMovie.id!,
          ...draft,
        };
        return [...list, nextMovie];
      });
    }
    this.save();
    this.modalTags = '';
    this.editingMovieId = null;
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
    this.editingMovieId = movie.id;
    this.isEditing = true;
    this.showModal = true;
  }

  public openMovieMenu(movie: Movie, menu: { toggle(e: Event): void }, event: Event) {
    event.stopPropagation();
    const items: MenuItem[] = this.isGameCollection
      ? [
          { label: 'Edit game', icon: 'pi pi-pencil', command: () => this.openEdit(movie) },
        ]
      : [
          { label: 'Edit movie', icon: 'pi pi-pencil', command: () => this.openEdit(movie) },
        ];
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

  private buildMovieDraft(title: string): Omit<Movie, 'id'> {
    if (this.isGameCollection) {
      return {
        title,
        notes: this.normalizeText(this.modalMovie.notes),
        platform: this.normalizeText(this.modalMovie.platform),
        format: this.normalizeFormat(this.modalMovie.format),
        platinumed: !!this.modalMovie.platinumed,
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

  private parseTags(value: unknown) {
    if (typeof value !== 'string') {
      return [];
    }

    const seen = new Set<string>();
    const tags: string[] = [];

    for (const rawTag of value.split(',')) {
      const tag = rawTag.trim();
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) {
        continue;
      }
      seen.add(key);
      tags.push(tag);
    }

    return tags;
  }

  private saveGameMovie(list: Movie[], draft: Omit<Movie, 'id'>) {
    const targetPosition = this.normalizeGamePosition(this.modalMovie.id, list.length + (this.isEditing ? 0 : 1));

    if (this.isEditing && this.editingMovieId !== null) {
      const currentMovie = list.find(movie => movie.id === this.editingMovieId);
      if (!currentMovie) {
        return list;
      }

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
    if (!Number.isFinite(numeric)) {
      return maxPosition;
    }

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
