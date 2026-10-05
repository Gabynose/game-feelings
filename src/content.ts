// Single source for every visible string (SPEC §1.1, DESIGN §9, §14.6 and §14.13).
export const content = {
  pageTitle: 'Game Feelings',
  narrator: {
    intro: 'Hey! What kind of game are you looking for?',
    typing: "Take your time. Hit Enter when you're ready.",
    emptyInput: 'Type a kind of game first, like “souls-like”.',
    thinking: 'Hmm… let me think about that.',
    thinkingLong: 'Still thinking. Good picks take a moment.',
    thinkingFound: 'Got it: {summary}. Looking…', // only with a summary of 1–26 chars (DESIGN §14.13)
    thinkingFoundPlain: 'Got it! Looking for games…',
    results: 'Ooh, {summary}! Try these.', // only with a summary of 1–26 chars (DESIGN §14.13)
    resultsPlain: 'Ooh, I found some! Try these.',
    noResults: 'No games fit all of that. Try fewer details?',
    offTopic: 'I only know games. Try “cozy farming”.',
    error: 'My brain is buffering. Give it a moment and try again.',
    errorRate: 'Too many searches in a row. Try again in {seconds}s.',
    errorBusy: 'The game library is busy. Try again in a minute.',
    errorNetwork: "Can't reach the internet. Check your connection.",
    errorSlow: 'That took too long. Try again in a moment.',
    detailBack: 'Want to look for something else?',
  },
  input: {
    label: 'What kind of game?',
    placeholder: 'A co-op adventure for Switch',
    submit: 'Find games',
    submitBusy: 'Thinking…',
  },
  shelf: {
    heading: 'Games matching {summary}', // visually hidden h2 of the row; the full summary (no line limit)
    headingPlain: 'Games we found', // when the summary is empty
    name: '{name}, {year}', // accessible name of a case: "Cozy Grove, 2021"
  },
  detail: {
    close: 'Close',
    released: 'Released',
    notAnnounced: 'Not announced',
    fig: 'Fig. {n}',
    trailer: 'Trailer',
    trailerTime: 'Trailer, {time}',
    cover: 'Cover',
    screenshot: 'Screenshot',
    noPictures: 'No pictures yet',
    trailerLabel: '{name} trailer',
    coverAlt: '{name} cover',
    shotAlt: '{name}, screenshot {n}',
    source: 'Source: ',
    rawg: 'RAWG',
    newTab: ' (opens in a new tab)',
    loading: 'Loading details…',
    noDescription: 'RAWG has no description for this game yet.',
    error: "Couldn't load this game's details.",
    errorRate: 'Too many requests in a row. Try again in {seconds}s.',
    notFound: "RAWG doesn't have this game.",
    notFoundTitle: 'Game not found',
    retry: 'Try again',
    platform: 'Platform',
    platforms: 'Platforms',
    genre: 'Genre',
    genres: 'Genres',
    rating: 'Player rating',
    ratingValue: '{value} / 5',
    ratingSpoken: '{value} out of 5',
    metacritic: 'Metacritic',
    metacriticValue: '{value} / 100',
    metacriticSpoken: '{value} out of 100',
  },
  theme: {
    toDark: 'Switch to dark theme',
    toLight: 'Switch to light theme',
  },
  sound: {
    mute: "Mute Chao's voice", // fixed name; aria-pressed carries the state
  },
  footer: {
    credit: 'Chao © SEGA — fan project, not affiliated · Game data by ',
    rawgLabel: 'RAWG',
    rawgUrl: 'https://rawg.io',
  },
  character: {
    alt: 'Chao, a small blue creature with a yellow ball floating above its head',
    restart: 'Start over', // label of the compact Chao, which is a button (DESIGN §18.1)
  },
  // DEV-only scaffolding (?lab).
  styleTile: {
    badge: 'Phase 1 · style tile',
    chromeSample: 'Chrome strip',
    typeHeading: 'Type scale',
    colorHeading: 'Color',
    shapeHeading: 'Radii and spacing',
    typeSample: 'Cozy co-op tonight',
    chaoLab: {
      heading: 'Chao lab',
      moods: 'Mood',
      talk: 'Talk',
      blink: 'Blink',
      compact: 'Compact size',
      enter: 'Enter',
      idle: 'Idle',
      listen: 'Listen',
      think: 'Think',
      happy: 'Happy',
      sad: 'Sad',
      error: 'Error',
    },
  },
} as const;
