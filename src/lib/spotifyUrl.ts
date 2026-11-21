const HOME = 'https://open.spotify.com/';
const URI = /^spotify:(track|album|artist|playlist):([A-Za-z0-9]+)$/;

/** The open.spotify.com page for a Spotify URI; the Spotify home page for anything else. */
export function spotifyUrl(uri: string): string {
  const match = URI.exec(uri);
  return match ? `${HOME}${match[1]}/${match[2]}` : HOME;
}
