export const SPECIES = [
  { id: 'clown', name: '클라운피시', latin: 'Amphiprion ocellaris', color: '#f9a044', price: 80, description: '호기심 많은 주황빛 친구', shape: 0 },
  { id: 'tang', name: '블루탱', latin: 'Paracanthurus hepatus', color: '#56a8e8', price: 120, description: '물속을 누비는 작은 파랑', shape: 1 },
  { id: 'yellow', name: '옐로탱', latin: 'Zebrasoma flavescens', color: '#f5d351', price: 100, description: '어항에 내려앉은 햇살', shape: 2 },
  { id: 'angel', name: '엔젤피시', latin: 'Pterophyllum scalare', color: '#d8e4d9', price: 150, description: '우아하게 흐르는 은빛 지느러미', shape: 3 },
];
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export function makeFish(type, n = 0) { return { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, type, name: `${SPECIES[type].name} ${n + 1}`, x: .2 + Math.random() * .6, y: .25 + Math.random() * .4, z: Math.random(), direction: n % 2 ? -1 : 1, hunger: 72, growth: 0, age: 0, phase: Math.random() * 6.28 }; }
export function freshState() { return { version: 1, coins: 320, quality: 94, oxygen: 96, elapsed: 0, earnedAt: 0, light: true, plants: 5, fed: 0, cleaned: 0, claimed: [], fish: [makeFish(0, 0), makeFish(0, 1), makeFish(1, 0), makeFish(2, 0), makeFish(3, 0)] }; }
export function restore(raw) {
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.fish) || data.fish.length > 16 || !data.fish.length) return freshState();
    const state = freshState();
    for (const key of ['coins','quality','oxygen','elapsed','earnedAt','plants','fed','cleaned']) if (Number.isFinite(data[key])) state[key] = Math.max(0, data[key]);
    state.coins = Math.floor(state.coins); state.quality = clamp(state.quality, 0, 100); state.oxygen = clamp(state.oxygen, 0, 100); state.plants = clamp(state.plants, 5, 12);
    state.light = data.light !== false; state.claimed = Array.isArray(data.claimed) ? data.claimed.filter(x => ['feed','clean','grow'].includes(x)) : [];
    state.fish = data.fish.filter(f => Number.isInteger(f.type) && SPECIES[f.type]).map((f, i) => { const fish = makeFish(f.type, i); for (const key of ['x','y','z','hunger','growth','age']) if (Number.isFinite(f[key])) fish[key] = clamp(f[key], 0, key === 'hunger' || key === 'growth' ? 100 : key === 'age' ? 1e9 : 1); return fish; });
    return state.fish.length ? state : freshState();
  } catch { return freshState(); }
}
export function adopt(state, type) {
  const species = SPECIES[type];
  if (!species || state.fish.length >= 16 || state.coins < species.price) return false;
  state.coins -= species.price; state.fish.push(makeFish(type, state.fish.filter(f => f.type === type).length)); return true;
}
export function tick(state, dt) {
  state.elapsed += dt;
  state.quality = clamp(state.quality - dt * .011 * state.fish.length, 0, 100);
  state.oxygen = clamp(state.oxygen + dt * (.023 * state.plants - .018 * state.fish.length), 0, 100);
  for (const f of state.fish) { f.age += dt; f.hunger = clamp(f.hunger - dt * .048, 0, 100); if (f.hunger > 35 && state.quality > 40) f.growth = clamp(f.growth + dt * .055, 0, 100); }
  if (state.elapsed - state.earnedAt >= 30) { state.coins += state.fish.filter(f => f.hunger > 30 && state.quality > 35).length * 3; state.earnedAt = state.elapsed; }
}
export function clean(state) { if (state.coins < 20 || state.quality > 99) return false; state.coins -= 20; state.quality = clamp(state.quality + 35, 0, 100); state.oxygen = clamp(state.oxygen + 15, 0, 100); state.cleaned++; return true; }
export function feedFish(state, fish) { fish.hunger = clamp(fish.hunger + 18, 0, 100); fish.growth = clamp(fish.growth + 1.3, 0, 100); state.fed++; }
