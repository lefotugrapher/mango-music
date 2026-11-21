import { NavLink } from 'react-router';
import { Glass } from '../glass/Glass';
import { HOME_LINK, LIBRARY_TAB, SEARCH_LINK, type NavEntry } from './nav';
import './shell.css';

function Tab({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;
  return (
    <NavLink to={entry.to} end={entry.end} className="tab">
      {({ isActive }) => (
        <>
          <Icon className="tab__icon" weight={isActive ? 'fill' : 'regular'} aria-hidden="true" />
          <span className="tab__label">{entry.label}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * The phone tab bar: one capsule for the main tabs and a separate round
 * Search button. `compact` shrinks it by transform only, so its glass filter
 * is never rebuilt mid-scroll.
 */
export function TabBar({ compact }: { compact: boolean }) {
  const SearchIcon = SEARCH_LINK.icon;
  return (
    <nav aria-label="Tab bar" className="tabbar" data-compact={compact ? 'true' : 'false'}>
      <Glass className="tabbar__tabs" radius={28}>
        <Tab entry={HOME_LINK} />
        <Tab entry={LIBRARY_TAB} />
      </Glass>
      <Glass className="tabbar__search" radius={28}>
        <NavLink to={SEARCH_LINK.to} className="tab tab--solo" aria-label="Search">
          <SearchIcon className="tab__icon" weight="bold" aria-hidden="true" />
        </NavLink>
      </Glass>
    </nav>
  );
}
