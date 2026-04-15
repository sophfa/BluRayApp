import { Injectable } from '@angular/core';

export interface TagColor {
  bg: string;
  text: string;
  border: string;
  label: string;
}

export const TAG_COLOR_PRESETS: TagColor[] = [
  { label: 'Indigo',  bg: '#1e1b4b', text: '#818cf8', border: '#4f46e5' },
  { label: 'Purple',  bg: '#251f34', text: '#d8b4fe', border: '#6d28d9' },
  { label: 'Green',   bg: '#0f2418', text: '#4ade80', border: '#166534' },
  { label: 'Emerald', bg: '#1f2d27', text: '#a7f3d0', border: '#25634b' },
  { label: 'Teal',    bg: '#1c2f36', text: '#a5f3fc', border: '#0e7490' },
  { label: 'Blue',    bg: '#0f1a2e', text: '#60a5fa', border: '#1d4ed8' },
  { label: 'Amber',   bg: '#2d1f00', text: '#fbbf24', border: '#78350f' },
  { label: 'Yellow',  bg: '#32281c', text: '#fde68a', border: '#a16207' },
  { label: 'Orange',  bg: '#31231d', text: '#fdba74', border: '#9a3412' },
  { label: 'Red',     bg: '#2d1a1a', text: '#f87171', border: '#dc2626' },
  { label: 'Pink',    bg: '#2d1a28', text: '#f0abfc', border: '#a21caf' },
  { label: 'Default', bg: '#202330', text: '#c4d1ff', border: '#3b4568' },
];

@Injectable({ providedIn: 'root' })
export class TagColorService {
  public readonly presets = TAG_COLOR_PRESETS;

  public getAll(collectionKey: string): Record<string, TagColor> {
    try {
      const raw = localStorage.getItem(this.key(collectionKey));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, TagColor>) : {};
    } catch {
      return {};
    }
  }

  public get(collectionKey: string, tag: string): TagColor | null {
    return this.getAll(collectionKey)[tag.toLowerCase()] ?? null;
  }

  public set(collectionKey: string, tag: string, color: TagColor | null): void {
    const all = this.getAll(collectionKey);
    if (color === null) {
      delete all[tag.toLowerCase()];
    } else {
      all[tag.toLowerCase()] = color;
    }
    localStorage.setItem(this.key(collectionKey), JSON.stringify(all));
  }

  private key(collectionKey: string): string {
    return `tag-colors:${collectionKey}`;
  }
}
