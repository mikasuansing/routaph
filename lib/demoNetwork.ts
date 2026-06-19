export type Stop = { id: number; name: string; lat: number; lng: number; seq: number };
export type Corridor = { id: number; name: string; color: string; stops: Stop[] };

export const corridors: Corridor[] = [
  {
    id: 1,
    name: "EDSA Carousel",
    color: "#e63946",
    stops: [
      { id: 1, name: "Monumento",        lat: 14.6543, lng: 120.9840, seq: 1 },
      { id: 2, name: "Balintawak",       lat: 14.6510, lng: 120.9842, seq: 2 },
      { id: 3, name: "Trinoma",          lat: 14.6520, lng: 121.0320, seq: 3 },
      { id: 4, name: "Quezon Ave",       lat: 14.6448, lng: 121.0380, seq: 4 },
      { id: 5, name: "Cubao",            lat: 14.6197, lng: 121.0510, seq: 5 },
      { id: 6, name: "Ortigas",          lat: 14.5875, lng: 121.0584, seq: 6 },
      { id: 7, name: "Guadalupe",        lat: 14.5670, lng: 121.0469, seq: 7 },
      { id: 8, name: "Magallanes",       lat: 14.5402, lng: 121.0039, seq: 8 },
      { id: 9, name: "Taft Ave",         lat: 14.5545, lng: 120.9942, seq: 9 },
    ],
  },
  {
    id: 2,
    name: "Katipunan Jeepney",
    color: "#2a9d8f",
    stops: [
      { id: 101, name: "Katipunan LRT2", lat: 14.6284, lng: 121.0730, seq: 1 },
      { id: 102, name: "Ateneo Gate",    lat: 14.6395, lng: 121.0775, seq: 2 },
      { id: 103, name: "UP Diliman",     lat: 14.6540, lng: 121.0685, seq: 3 },
      { id: 104, name: "Balara",         lat: 14.6700, lng: 121.0720, seq: 4 },
      { id: 105, name: "Tandang Sora",   lat: 14.6820, lng: 121.0440, seq: 5 },
    ],
  },
];

function haversine(a: Stop, b: Stop): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
}

function isRushHour(): boolean {
  const h = new Date().getHours();
  return (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
}

export function planTrip(fromName: string, toName: string) {
  for (const c of corridors) {
    const from = c.stops.find(s => s.name.toLowerCase().includes(fromName.toLowerCase()));
    const to   = c.stops.find(s => s.name.toLowerCase().includes(toName.toLowerCase()));
    if (!from || !to) continue;
    const seqFrom = Math.min(from.seq, to.seq);
    const seqTo   = Math.max(from.seq, to.seq);
    const legStops = c.stops.filter(s => s.seq >= seqFrom && s.seq <= seqTo).sort((a,b) => a.seq - b.seq);
    let distKm = 0;
    for (let i = 0; i < legStops.length - 1; i++) distKm += haversine(legStops[i], legStops[i+1]);
    const rush = isRushHour();
    const speedKmh = rush ? 14 : 24;
    const etaMin = Math.round((distKm / speedKmh) * 60);
    const fareBase = 15 + distKm * 3.5;
    return {
      corridor: c.name,
      corridorColor: c.color,
      from: from.name, to: to.name,
      distanceKm: Math.round(distKm * 10) / 10,
      etaMinutes: etaMin,
      fare: Math.round(fareBase * 100) / 100,
      rushHour: rush,
      stops: legStops,
    };
  }
  return null;
}
