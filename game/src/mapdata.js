// Rustfall Yard, Sablepoint's map, as data: every solid is an axis-aligned box the world builder
// renders and the collision code tests, so the picture and the physics can never disagree.
//
// Layout (x east, z south, metres; the yard is 70 by 52 inside its perimeter walls):
//   Vanguard spawn west, Warden spawn east. Two plant sites: the Foundry (A) north-east and
//   the Depot (B) south-east. Three lanes run west to east — North Run, the Crossing (mid) and
//   South Run — joined by two mid links and one east link behind the sites, so a team can
//   commit, fake, or rotate. Divider walls between the lanes have door gaps; crates and low
//   walls give cover that can be shot over (1.15 m) or not (2.6 m and up).

function box(x, z, w, d, h, mat, y0 = 0) { return { x, z, w, d, h, mat, y0 }; }

export const MAP = {
  name: 'Rustfall Yard',
  groundW: 76,
  groundD: 60,

  solids: [
    // Perimeter.
    box(0, -27, 76, 1.6, 6, 'sandstone'),
    box(0, 27, 76, 1.6, 6, 'sandstone'),
    box(-35.5, 0, 1.6, 56, 6, 'sandstone'),
    box(35.5, 0, 1.6, 56, 6, 'sandstone'),

    // Lane dividers (3.4 m walls with door gaps).
    box(-25, -7, 18, 0.8, 3.4, 'concrete'),
    box(-4, -7, 16, 0.8, 3.4, 'concrete'),
    box(14, -7, 12, 0.8, 3.4, 'concrete'),
    box(29, -7, 10, 0.8, 3.4, 'concrete'),
    box(-20, 7, 28, 0.8, 3.4, 'concrete'),
    box(6, 7, 16, 0.8, 3.4, 'concrete'),
    box(19, 7, 2, 0.8, 3.4, 'concrete'),
    box(29, 7, 10, 0.8, 3.4, 'concrete'),

    // The Crossing: a container stack with a walk-through gap at ground level.
    box(0, -2.2, 7, 2.6, 2.6, 'rust'),
    box(0, 2.2, 7, 2.6, 2.6, 'tealMetal'),
    box(-0.8, 0, 5, 2.4, 2.6, 'slate', 2.6),

    // Foundry (site A): furnace block, silo, low wall and crates.
    box(18, -19.5, 6, 5, 5.5, 'darkMetal'),
    box(27, -20, 4, 4, 8, 'rust'), // silo (rendered round, collides square)
    box(24, -10.5, 6, 0.8, 1.15, 'concrete'),
    box(15.5, -12, 1.3, 1.3, 1.3, 'crate'),
    box(15.5, -12, 1.3, 1.3, 1.3, 'crate', 1.3),
    box(25.5, -16.5, 1.3, 1.3, 1.3, 'crate'),
    box(26.9, -16.5, 1.3, 1.3, 1.3, 'crate'),

    // Depot (site B): two containers, a truck block, low wall and crates.
    box(18, 18.5, 6.5, 2.6, 2.6, 'tealMetal'),
    box(18, 12.5, 6.5, 2.6, 2.6, 'rust'),
    box(25, 10, 4.6, 2.2, 2.3, 'slate'),
    box(14.5, 17.5, 0.8, 6, 1.15, 'concrete'),
    box(24, 19.5, 1.3, 1.3, 1.3, 'crate'),
    box(24, 19.5, 1.3, 1.3, 1.3, 'crate', 1.3),

    // Lane cover.
    box(-24, -13, 1.3, 1.3, 1.3, 'crate'),
    box(0, -18, 6, 0.8, 1.15, 'concrete'),
    box(-14, -15.5, 1.3, 1.3, 1.3, 'crate'),
    box(-13, 15, 1.3, 1.3, 1.3, 'crate'),
    box(0, 18, 6, 0.8, 1.15, 'concrete'),
    box(8, 12, 1.3, 1.3, 1.3, 'crate'),
    box(-12, 3.5, 1.3, 1.3, 1.3, 'crate'),
    box(12, -3.5, 1.3, 1.3, 1.3, 'crate'),
    box(-16, 0, 0.8, 5, 1.15, 'concrete'),
    box(16, 0, 0.8, 5, 1.15, 'concrete'),

    // Spawn yards.
    box(-30, 0, 2.6, 7, 2.6, 'slate'),
    box(-26, -6.5, 1.3, 1.3, 1.3, 'crate'),
    box(-26, 6.5, 1.3, 1.3, 1.3, 'crate'),
    box(30, -5.5, 1.3, 1.3, 1.3, 'crate'),
    box(30, 5.5, 1.3, 1.3, 1.3, 'crate'),
    box(27.5, 0, 0.8, 6, 1.15, 'concrete'),
  ],

  // Round props: rendered as cylinders, collided as small squares (already in solids? no —
  // barrels are soft cover: they block movement but not bullets, so they live apart).
  barrels: [
    { x: 16, z: -21 }, { x: 17.1, z: -20.6 }, { x: -6, z: -3.8 }, { x: 15, z: 21 },
    { x: -20, z: 11 }, { x: 9, z: -11.5 }, { x: -9, z: 11.5 }, { x: 28.5, z: -13 },
  ],

  sites: {
    A: { id: 'A', name: 'Foundry', cx: 21, cz: -15, x0: 14, x1: 28, z0: -22, z1: -8 },
    B: { id: 'B', name: 'Depot', cx: 21, cz: 15, x0: 14, x1: 28, z0: 8, z1: 22 },
  },

  spawns: {
    vanguard: [
      { x: -29, z: -2.6, yaw: Math.PI / 2 }, { x: -29, z: 0, yaw: Math.PI / 2 },
      { x: -29, z: 2.6, yaw: Math.PI / 2 }, { x: -27.2, z: -1.3, yaw: Math.PI / 2 },
      { x: -27.2, z: 1.3, yaw: Math.PI / 2 },
    ],
    wardens: [
      { x: 31, z: -2.6, yaw: -Math.PI / 2 }, { x: 31, z: 0, yaw: -Math.PI / 2 },
      { x: 31, z: 2.6, yaw: -Math.PI / 2 }, { x: 29.2, z: -1.3, yaw: -Math.PI / 2 },
      { x: 29.2, z: 1.3, yaw: -Math.PI / 2 },
    ],
  },

  // The waypoint graph the bots walk. Nodes are named for the place they serve.
  nodes: {
    vSpawn: [-28, 0], wNorth: [-22, -8], wSouth: [-22, 8],
    nLaneW: [-20, -14], nLaneM: [-6, -14], nLaneE: [2, -14],
    linkAN: [6, -10.5], linkAM: [6, -3.5],
    midW: [-12, 0], midGap: [0, 0], midN: [0, -5.5], midS: [0, 5.5], midE: [11, 0],
    linkBM: [16, 3.5], linkBN: [16, 10.5],
    sLaneW: [-20, 14], sLaneM: [-6, 14], sLaneE: [2, 14],
    siteAW: [12, -14], siteA: [21, -14], aBack: [21, -20.5],
    siteBW: [12, 14], siteB: [21, 14], bBack: [21, 20.5],
    eastN: [22, -10.5], eastM: [22, -3.5], eastS: [22, 3.5], eastB: [22, 10.5],
    dSpawn: [29, 0],
  },
  edges: [
    ['vSpawn', 'wNorth'], ['vSpawn', 'wSouth'], ['vSpawn', 'midW'],
    ['wNorth', 'nLaneW'], ['wSouth', 'sLaneW'], ['wNorth', 'midW'], ['wSouth', 'midW'],
    ['nLaneW', 'nLaneM'], ['nLaneM', 'nLaneE'], ['nLaneM', 'linkAN'], ['nLaneE', 'linkAN'],
    ['nLaneE', 'siteAW'], ['siteAW', 'siteA'], ['siteA', 'aBack'],
    ['linkAN', 'linkAM'], ['linkAM', 'midN'], ['linkAM', 'midE'],
    ['midW', 'midGap'], ['midW', 'midN'], ['midW', 'midS'], ['midGap', 'midE'],
    ['midGap', 'midN'], ['midGap', 'midS'], ['midE', 'linkBM'], ['midE', 'eastM'],
    ['linkBM', 'linkBN'], ['linkBN', 'sLaneE'],
    ['sLaneW', 'sLaneM'], ['sLaneM', 'sLaneE'], ['sLaneE', 'siteBW'], ['siteBW', 'siteB'],
    ['siteB', 'bBack'],
    ['siteA', 'eastN'], ['eastN', 'eastM'], ['eastM', 'dSpawn'], ['dSpawn', 'eastS'],
    ['eastS', 'eastB'], ['eastB', 'siteB'], ['eastM', 'eastS'],
  ],

  // Where defenders set up, and where attackers watch a planted charge from.
  holds: {
    A: [[16.5, -17.5], [25.2, -12.2], [21, -20.8]],
    B: [[15.8, 15.2], [25.2, 13], [21, 20.8]],
    mid: [[4.5, -4.8], [-4.5, 4.8], [11, 2.5]],
    guardA: [[16, -11], [25, -18.5], [18, -13.5]],
    guardB: [[16, 11], [25, 18.5], [18, 16.5]],
  },
};
