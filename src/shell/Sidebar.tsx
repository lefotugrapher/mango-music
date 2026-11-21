import { GearSix, Playlist } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router';
import { Glass } from '../glass/Glass';
import { useSource } from '../session/hooks';
import { HOME_LINK, LIBRARY_LINKS, LIKED_LINK, SEARCH_LINK, type NavEntry } from './nav';
import './shell.css';

function Row({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;
  return (
    <li>
      <NavLink to={entry.to} end={entry.end} className="side-row">
        <Icon className="side-row__icon" weight="regular" aria-hidden="true" />
        <span className="truncate">{entry.label}</span>
      </NavLink>
    </li>
  );
}

export function Sidebar() {
  const source = useSource();
  const playlists = useQuery({ queryKey: ['library', 'playlists'], queryFn: () => source.library('playlists') });
  const me = useQuery({ queryKey: ['me'], queryFn: () => source.me() });

  return (
    <Glass as="nav" aria-label="Sidebar" className="sidebar" radius={22}>
      <div className="sidebar__brand" aria-hidden="true">
        <span className="sidebar__mark" />
        <span>Pane</span>
      </div>

      <div className="sidebar__scroll">
        <ul>
          <Row entry={SEARCH_LINK} />
          <Row entry={HOME_LINK} />
          <Row entry={LIKED_LINK} />
        </ul>

        <h2 className="sidebar__heading">Library</h2>
        <ul>
          {LIBRARY_LINKS.map((entry) => (
            <Row key={entry.to} entry={entry} />
          ))}
        </ul>

        {playlists.data && playlists.data.items.length > 0 && (
          <>
            <h2 className="sidebar__heading">Your Playlists</h2>
            <ul>
              {playlists.data.items.map((item) => (
                <li key={item.id}>
                  <NavLink to={`/playlist/${item.id}`} className="side-row">
                    <Playlist className="side-row__icon" aria-hidden="true" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="sidebar__footer">
        <span className="sidebar__account truncate">{me.data?.name ?? ''}</span>
        <NavLink to="/settings" className="side-icon" aria-label="Settings">
          <GearSix aria-hidden="true" />
        </NavLink>
      </div>
    </Glass>
  );
}
