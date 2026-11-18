// Home Assistant's MediaPlayerEntityFeature bits. The music widget reads them for every player, so the direct Spotify
// and Sonos feeds (src/server/music.ts) describe what their players can do with the same bits.
export const F = { pause: 1, volumeSet: 4, mute: 8, previous: 16, next: 32, source: 2048, play: 16384 } as const;
