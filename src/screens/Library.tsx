import { CaretRight } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useSource } from '../session/hooks';
import { LIBRARY_LINKS } from '../shell/nav';
import { EmptyState } from '../ui/EmptyState';
import { CardGrid, Loading, Page } from './shared';

const SECTIONS = LIBRARY_LINKS.filter((link) => link.to !== '/library');

export function Library() {
  const source = useSource();
  const recent = useQuery({ queryKey: ['recentlyAdded'], queryFn: () => source.recentlyAdded() });

  return (
    <Page title="Library">
      <nav aria-label="Library sections" className="lib-links">
        <ul>
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <li key={section.to}>
                <Link to={section.to} className="lib-link">
                  <Icon className="lib-link__icon" aria-hidden="true" />
                  <span>{section.label}</span>
                  <CaretRight className="lib-link__chevron" weight="bold" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <h2 className="page__section">Recently Added</h2>
      {recent.isPending && <Loading label="Loading your library" />}
      {recent.isError && <EmptyState title="Your library didn't load" body="Check your connection and try again." />}
      {recent.data && recent.data.length === 0 && (
        <EmptyState title="Nothing added yet" body="Albums and playlists you save on Spotify show up here." />
      )}
      {recent.data && recent.data.length > 0 && <CardGrid items={recent.data} />}
    </Page>
  );
}
