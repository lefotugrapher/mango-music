import {
  ClockCounterClockwise,
  House,
  MagnifyingGlass,
  MicrophoneStage,
  MusicNote,
  Playlist,
  SquaresFour,
  Stack,
  type Icon,
} from '@phosphor-icons/react';

export type NavEntry = { to: string; label: string; icon: Icon; end?: boolean };

export const SEARCH_LINK: NavEntry = { to: '/search', label: 'Search', icon: MagnifyingGlass };
export const HOME_LINK: NavEntry = { to: '/', label: 'Home', icon: House, end: true };
export const LIBRARY_TAB: NavEntry = { to: '/library', label: 'Library', icon: Stack };

export const LIBRARY_LINKS: NavEntry[] = [
  { to: '/library', label: 'Recently Added', icon: ClockCounterClockwise, end: true },
  { to: '/library/playlists', label: 'Playlists', icon: Playlist },
  { to: '/library/artists', label: 'Artists', icon: MicrophoneStage },
  { to: '/library/albums', label: 'Albums', icon: SquaresFour },
  { to: '/library/songs', label: 'Songs', icon: MusicNote },
];
