import { INITIAL_MOVIES, Movie } from './movies.data';

export type CollectionType = 'bluray' | 'games' | 'books' | 'music';

export interface CollectionDefinition {
  type: CollectionType;
  path: CollectionType;
  label: string;
  title: string;
  icon: string;
  itemLabel: 'movie' | 'game' | 'book' | 'album';
  description: string;
  initialItems: Movie[];
}

export const DEFAULT_ENABLED_COLLECTIONS: CollectionType[] = ['bluray', 'games'];

export const COLLECTION_DEFINITIONS: CollectionDefinition[] = [
  {
    type: 'bluray',
    path: 'bluray',
    label: 'Blu-ray',
    title: 'Blu-ray Collection',
    icon: 'pi-video',
    itemLabel: 'movie',
    description: 'Films, box sets, special editions, and tagged shelves.',
    initialItems: INITIAL_MOVIES.map((movie) => ({ ...movie, notes: '' })),
  },
  {
    type: 'games',
    path: 'games',
    label: 'Games',
    title: 'Games Collection',
    icon: 'pi-desktop',
    itemLabel: 'game',
    description: 'Physical and digital games with system, format, and progress.',
    initialItems: [],
  },
  {
    type: 'books',
    path: 'books',
    label: 'Books',
    title: 'Books Collection',
    icon: 'pi-book',
    itemLabel: 'book',
    description: 'Books, graphic novels, manga, and reading notes.',
    initialItems: [],
  },
  {
    type: 'music',
    path: 'music',
    label: 'Music / CDs',
    title: 'Music / CD Collection',
    icon: 'pi-headphones',
    itemLabel: 'album',
    description: 'Albums, CDs, vinyl notes, editions, and tags.',
    initialItems: [],
  }
];

export const COLLECTIONS_BY_TYPE: Record<CollectionType, CollectionDefinition> = COLLECTION_DEFINITIONS.reduce(
  (acc, definition) => {
    acc[definition.type] = definition;
    return acc;
  },
  {} as Record<CollectionType, CollectionDefinition>
);

export function isCollectionType(value: string | null | undefined): value is CollectionType {
  return !!value && value in COLLECTIONS_BY_TYPE;
}

export function getCollectionDefinition(value: string | null | undefined): CollectionDefinition {
  if (isCollectionType(value)) {
    return COLLECTIONS_BY_TYPE[value];
  }

  return COLLECTIONS_BY_TYPE[DEFAULT_ENABLED_COLLECTIONS[0]];
}

export function normalizeEnabledCollections(value: unknown): CollectionType[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ENABLED_COLLECTIONS];
  }

  const seen = new Set<CollectionType>();
  const normalized: CollectionType[] = [];

  for (const item of value) {
    if (typeof item !== 'string' || !isCollectionType(item)) {
      continue;
    }

    if (seen.has(item)) {
      continue;
    }

    seen.add(item);
    normalized.push(item);
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_ENABLED_COLLECTIONS];
}
