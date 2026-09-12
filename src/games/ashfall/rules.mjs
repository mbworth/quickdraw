// Local copy of the public rules numbers validate needs (rules.md). The server stays the authority.
export const UNIT_COST = { worker: { ore: 50, cry: 0, supply: 1, from: 'core' }, trooper: { ore: 60, cry: 0, supply: 1, from: 'barracks' }, raider: { ore: 80, cry: 25, supply: 1, from: 'barracks' }, warden: { ore: 135, cry: 40, supply: 2, from: 'barracks' }, siege: { ore: 180, cry: 80, supply: 3, from: 'barracks', needs: 'armory' } };
export const BUILDING_COST = { core: 300, barracks: 120, depot: 75, turret: 110, wall: 25, armory: 150, sensor: 60 };
export const UPGRADE_COST = { weapons: { ore: [100, 150, 200], cry: [40, 60, 80] }, armor: { ore: [100, 150, 200], cry: [40, 60, 80] }, optics: { ore: [120], cry: [60] }, excavate: { ore: [150], cry: [50] }, refine: { ore: [100], cry: [0] } };
export const QUEUE_MAX = { barracks: 5, core: 5, armory: 3 };
export const SELECTORS = new Set(['all', 'army', 'idle', 'workers', 'troopers', 'raiders', 'wardens', 'siege']);
export const isBuilding = t => typeof t === 'string' && Object.hasOwn(BUILDING_COST, t);
