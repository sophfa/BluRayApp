import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { MenuModule } from 'primeng/menu';
import { Movie, INITIAL_MOVIES } from '../movies.data';
import { CollectionStorageService } from '../collection-storage.service';

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
  public notesTarget: Movie | null = null;
  public notesDraft = '';
  public detailsTarget: Movie | null = null;
  public detailsPlatform = '';
  public detailsFormat = '';
  public movieMenuItems: MenuItem[] = [];

  public constructor(
    private router: Router,
    private route: ActivatedRoute,
    private storage: CollectionStorageService,
    private confirmationService: ConfirmationService
  ) {}

  public ngOnInit() {
    const data = this.route.snapshot.data;
    this.activeCollectionPath = this.route.snapshot.routeConfig?.path ?? 'bluray';
    this.collectionKey = data['collectionKey'];
    this.collectionTitle = data['collectionTitle'];
    this.collectionIcon = data['collectionIcon'];
    this.itemLabel = data['itemLabel'] ?? 'item';
    void this.initialize();
  }

  private async initialize() {
    const initial = INITIAL_DATA[this.collectionKey] ?? [];
    const loaded = await this.storage.loadMovies(this.collectionKey, initial);
    this.movies.set(loaded);
    this.isLoaded = true;
  }

  private save() {
    void this.storage.saveMovies(this.collectionKey, this.movies());
  }

  public get filtered(): Movie[] {
    let list = this.movies();
    const q = this.searchQuery.trim().toLowerCase();
    if (q) list = list.filter(m => m.title.toLowerCase().includes(q) || String(m.id).includes(q));
    return [...list].sort((a, b) => {
      const cmp = this.sortField === 'id' ? a.id - b.id : a.title.localeCompare(b.title);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  public get totalCount() { return this.movies().length; }
  public get storageMode() { return this.storage.mode(); }
  public get storageMessage() { return this.storage.message(); }

  public switchCollection(path: string) {
    if (!path || path === this.activeCollectionPath) {
      return;
    }

    void this.router.navigate(['/', path]);
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
    this.modalMovie = { id: maxId + 1, title: '', notes: '' };
    this.isEditing = false;
    this.showModal = true;
  }

  public saveModal() {
    if (!this.modalMovie.title?.trim()) return;
    if (this.isEditing) {
      this.movies.update(list => list.map(m =>
        m.id === this.modalMovie.id ? { ...m, title: this.modalMovie.title! } : m
      ));
    } else {
      this.movies.update(list => [...list, {
        id: this.modalMovie.id!,
        title: this.modalMovie.title!.trim(),
        notes: ''
      }]);
    }
    this.save();
    this.showModal = false;
  }

  public deleteMovie(movie: Movie) {
    this.movies.update(list => list.filter(m => m.id !== movie.id));
    this.save();
  }

  public openEdit(movie: Movie) {
    this.modalMovie = { ...movie };
    this.isEditing = true;
    this.showModal = true;
  }

  public openNotes(movie: Movie) {
    this.notesTarget = movie;
    this.notesDraft = movie.notes;
  }

  public saveNotes() {
    if (!this.notesTarget) return;
    const id = this.notesTarget.id;
    this.movies.update(list => list.map(m => m.id === id ? { ...m, notes: this.notesDraft } : m));
    this.save();
    this.notesTarget = null;
  }

  public togglePlatinum(movie: Movie) {
    this.movies.update(list => list.map(m =>
      m.id === movie.id ? { ...m, platinumed: !m.platinumed } : m
    ));
    this.save();
  }

  public openDetails(movie: Movie) {
    this.detailsTarget = movie;
    this.detailsPlatform = movie.platform ?? '';
    this.detailsFormat = movie.format ?? '';
  }

  public saveDetails() {
    if (!this.detailsTarget) return;
    const id = this.detailsTarget.id;
    this.movies.update(list => list.map(m => m.id === id ? {
      ...m,
      platform: this.detailsPlatform.trim(),
      format: this.detailsFormat as 'disc' | 'digital' | ''
    } : m));
    this.save();
    this.detailsTarget = null;
  }

  public openMovieMenu(movie: Movie, menu: { toggle(e: Event): void }, event: Event) {
    event.stopPropagation();
    const items: MenuItem[] = [
      { label: 'Edit title', icon: 'pi pi-pencil', command: () => this.openEdit(movie) },
      { label: 'Edit note', icon: 'pi pi-file-edit', command: () => this.openNotes(movie) },
    ];
    if (this.itemLabel === 'game') {
      items.push(
        { label: movie.platinumed ? 'Remove Platinum' : 'Mark Platinumed', icon: 'pi pi-trophy', command: () => this.togglePlatinum(movie) },
        { label: 'Platform & Format', icon: 'pi pi-tag', command: () => this.openDetails(movie) },
      );
    }
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
}
