import { Navigate, Route, Routes } from 'react-router';
import { AlbumPage } from '../screens/AlbumPage';
import { ArtistPage } from '../screens/ArtistPage';
import { GlassLab } from '../screens/GlassLab';
import { Home } from '../screens/Home';
import { Library } from '../screens/Library';
import { LibrarySection } from '../screens/LibrarySection';
import { PlaylistPage } from '../screens/PlaylistPage';
import { Search } from '../screens/Search';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/library" element={<Library />} />
      <Route path="/library/:group" element={<LibrarySection />} />
      <Route path="/search" element={<Search />} />
      <Route path="/album/:id" element={<AlbumPage />} />
      <Route path="/playlist/:id" element={<PlaylistPage />} />
      <Route path="/artist/:id" element={<ArtistPage />} />
      {import.meta.env.DEV && <Route path="/__glass" element={<GlassLab />} />}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
