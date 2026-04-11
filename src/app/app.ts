import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopupModule } from 'primeng/confirmpopup';
import { MenuModule } from 'primeng/menu';
import { Movie, INITIAL_MOVIES } from './movies.data';
import { CollectionStorageService } from './collection-storage.service';

type SortField = 'id' | 'title';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, ConfirmPopupModule, MenuModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  public movies = signal<Movie[]>([]);
  public isLoaded = false;

  public searchQuery = '';
  public sortField: SortField = 'id';
  public sortDir: SortDir = 'asc';

  public showModal = false;
  public isEditing = false;
  public modalMovie: Partial<Movie> = {};
  public notesTarget: Movie | null = null;
  public notesDraft = '';
  public movieMenuItems: MenuItem[] = [];

  public constructor(
    private storage: CollectionStorageService,
    private confirmationService: ConfirmationService
  ) {}

  public ngOnInit() {
    void this.initialize();
  }

  private save() {
    void this.storage.saveMovies(this.movies());
  }

  private async initialize() {
    const initial: Movie[] = INITIAL_MOVIES.map((movie) => ({ ...movie, notes: '' }));
    const loaded = await this.storage.loadMovies(initial);
    this.movies.set(loaded);
    this.isLoaded = true;
  }

  public get filtered(): Movie[] {
    let list = this.movies();

    const q = this.searchQuery.trim().toLowerCase();
    if (q) list = list.filter(m => m.title.toLowerCase().includes(q) || String(m.id).includes(q));

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (this.sortField === 'id') cmp = a.id - b.id;
      else cmp = a.title.localeCompare(b.title);
      return this.sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }

  public get totalCount() { return this.movies().length; }
  public get storageMode() { return this.storage.mode(); }
  public get storageMessage() { return this.storage.message(); }

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
      this.movies.update(list => list.map(m => m.id === this.modalMovie.id ? { ...m, title: this.modalMovie.title! } : m));
    } else {
      const newMovie: Movie = {
        id: this.modalMovie.id!,
        title: this.modalMovie.title!.trim(),
        notes: ''
      };
      this.movies.update(list => [...list, newMovie]);
    }
    this.save();
    this.showModal = false;
  }

  public deleteMovie(movie: Movie) {
    this.movies.update(list => list.filter(m => m.id !== movie.id));
    this.save();
  }

  public openEdit(movie: Movie, event?: Event) {
    event?.stopPropagation();
    this.modalMovie = { ...movie };
    this.isEditing = true;
    this.showModal = true;
  }

  public openNotes(movie: Movie, event?: Event) {
    event?.stopPropagation();
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

  public openMovieMenu(
    movie: Movie,
    menu: { toggle(event: Event): void },
    event: Event
  ) {
    event.stopPropagation();

    this.movieMenuItems = [
      {
        label: 'Edit title',
        icon: 'pi pi-pencil',
        command: () => this.openEdit(movie)
      },
      {
        label: 'Edit note',
        icon: 'pi pi-file-edit',
        command: () => this.openNotes(movie)
      },
      {
        separator: true
      },
      {
        label: 'Delete movie',
        icon: 'pi pi-trash',
        styleClass: 'danger-menu-item',
        command: (menuEvent: { originalEvent?: Event }) =>
          this.confirmDelete(movie, menuEvent.originalEvent ?? event)
      }
    ];

    menu.toggle(event);
  }

  public confirmDelete(movie: Movie, event: Event) {
    event.stopPropagation();

    const target = (event.currentTarget ?? event.target) as HTMLElement | null;
    const message = `Delete "${movie.title}"? This cannot be undone.`;

    if (!target) {
      if (window.confirm(message)) {
        this.deleteMovie(movie);
      }
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
