import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Movie, INITIAL_MOVIES } from './movies.data';
import { CollectionStorageService } from './collection-storage.service';

type SortField = 'id' | 'title';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  public deleteTarget: Movie | null = null;

  public notesTarget: Movie | null = null;
  public notesDraft = '';

  public constructor(private storage: CollectionStorageService) {}
//
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

  public openEdit(movie: Movie, event: Event) {
    event.stopPropagation();
    this.modalMovie = { ...movie };
    this.isEditing = true;
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

  public confirmDelete(movie: Movie, event: Event) {
    event.stopPropagation();
    this.deleteTarget = movie;
  }

  public doDelete() {
    if (!this.deleteTarget) return;
    this.movies.update(list => list.filter(m => m.id !== this.deleteTarget!.id));
    this.save();
    this.deleteTarget = null;
  }

  public openNotes(movie: Movie, event: Event) {
    event.stopPropagation();
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

  public trackById(_: number, m: Movie) { return m.id; }
}
