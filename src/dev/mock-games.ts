// DEV only: 20 real RAWG results (public image URLs, no keys) for ?mock=results. Entry 5 has a broken image on purpose
// (it exercises the no-image fallback). Imported only by mockFinder, so production builds drop it.
import type { Game } from '../lib/api';

export const MOCK_GAMES: Game[] = [
  { id: 244698, slug: 'sky-light-awaits', name: 'Sky: Children of the Light', released: '2019-07-18', image: 'https://media.rawg.io/media/games/cb1/cb14d42b58bdb6cf5948d0eed778c2f0.jpg' },
  { id: 959920, slug: 'snufkin-melody-of-moominvalley', name: 'Snufkin: Melody of Moominvalley', released: '2024-03-07', image: 'https://media.rawg.io/media/games/b39/b3981eb418efc2472847660e34a6517f.jpg' },
  { id: 799381, slug: 'beacon-pines', name: 'Beacon Pines', released: '2022-09-22', image: 'https://media.rawg.io/media/games/384/3840fdbb91612c81db98176a4c1e7a8d.jpg' },
  { id: 967340, slug: 'station-to-station-2', name: 'Station to Station', released: '2023-10-03', image: 'https://media.rawg.io/media/games/fab/fabb514d218bc2d3d8b3a554790bc722.jpg' },
  { id: 672464, slug: 'doors-paradox', name: 'Doors: Paradox', released: '2021-09-27', image: 'https://media.rawg.io/media/games/000/gf-missing-cover.jpg' },
  { id: 963626, slug: 'sticky-business', name: 'Sticky Business', released: '2023-07-16', image: 'https://media.rawg.io/media/screenshots/5b4/5b442617d235d909cd8071cb812e98f9.jpg' },
  { id: 58745, slug: 'lieve-oma', name: 'Lieve Oma', released: '2016-03-23', image: 'https://media.rawg.io/media/games/8b8/8b8f75b0b2e5b813d5495a7e750d2c37.jpg' },
  { id: 877997, slug: 'a-castle-full-of-cats', name: 'A Castle Full of Cats', released: '2022-11-08', image: 'https://media.rawg.io/media/games/5c1/5c11eced9590e1c36c3aefc27a34b132.jpg' },
  { id: 894438, slug: 'lil-gator-game', name: 'Lil Gator Game', released: '2022-12-14', image: 'https://media.rawg.io/media/games/376/37628262db021ad21f81ec8d4b0ded03.jpg' },
  { id: 972362, slug: 'loddlenaut', name: 'Loddlenaut', released: '2023-11-16', image: 'https://media.rawg.io/media/screenshots/98c/98c36f2e52831d3020b2243761d5cf92.jpg' },
  { id: 973086, slug: '100-christmas-cats', name: '100 Christmas Cats', released: '2023-12-01', image: 'https://media.rawg.io/media/screenshots/044/04432650b73e79bfb7fbb44994dc0074.jpg' },
  { id: 962381, slug: 'little-kitty-big-city', name: 'Little Kitty, Big City', released: '2024-05-09', image: 'https://media.rawg.io/media/games/c11/c119d11961d785498ccb8e1ed9b006ca.jpg' },
  { id: 471717, slug: 'a-little-to-the-left', name: 'A Little to the Left', released: '2022-11-08', image: 'https://media.rawg.io/media/games/5fb/5fb6cab48577b617b5129dca622e061d.jpg' },
  { id: 973793, slug: '100-asian-cats', name: '100 Asian Cats', released: '2023-12-17', image: 'https://media.rawg.io/media/screenshots/5cc/5cce7cdf7a7436f3baa8c8d01d2bb7b7.jpg' },
  { id: 963612, slug: 'cats-hidden-in-paris', name: 'Cats Hidden in Paris', released: '2023-07-16', image: 'https://media.rawg.io/media/screenshots/6bc/6bcdbc6fea063c4a9521a1fa8dc04f78.jpg' },
  { id: 1008572, slug: 'lego-voyagers', name: 'LEGO Voyagers', released: '2025-09-15', image: 'https://media.rawg.io/media/games/094/094854b45dedba074587020c94ff9e61.jpg' },
  { id: 972167, slug: 'an-arcade-full-of-cats', name: 'An Arcade Full of Cats', released: '2023-11-16', image: 'https://media.rawg.io/media/screenshots/cec/cecb470cf89dfe78e8a1ded91298671a.jpg' },
  { id: 576532, slug: 'cozy-grove', name: 'Cozy Grove', released: '2021-04-08', image: 'https://media.rawg.io/media/screenshots/ea5/ea586b50b2cfe7ffa946488a91275dd1.jpg' },
  { id: 989225, slug: 'tiny-glade', name: 'Tiny Glade', released: '2024-09-23', image: 'https://media.rawg.io/media/games/2b8/2b83bcf74366f52296427c559803f6a6.jpeg' },
  { id: 1010950, slug: 'winter-burrow', name: 'Winter Burrow', released: '2025-11-12', image: 'https://media.rawg.io/media/games/8f7/8f7df68072959a0454789a7ec5cf8332.jpg' },
];
