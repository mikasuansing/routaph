#!/usr/bin/env python3
"""Fetch ordered rail station lists for Metro Manila from OpenStreetMap.

Ordering matters: a transit line is a *sequence*, so we read the relation's
member list in order rather than an unordered node set. Data is OSM
(ODbL) — attribution required wherever it ships.
"""
import json, time, urllib.request, urllib.parse, math

OVERPASS = "https://overpass-api.de/api/interpreter"

# One direction per line; the reverse variant is the same stations backwards.
RELATIONS = {
    "MRT-3": 109159,
    "LRT-2": 8000264,   # Recto -> Antipolo
    "LRT-1": 110418,    # Fernando Poe Jr. -> Dr. Santos
}


def overpass(query: str, attempts: int = 5):
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                OVERPASS,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "ParaPo/1.0 (transit app; OSM import)"},
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == attempts - 1:
                raise
            print(f"   retry {i+1} after {e}")
            time.sleep(20)


def ordered_stations(rel_id: int):
    """Relation members in order, resolved to named station coordinates."""
    data = overpass(f"[out:json][timeout:90];rel({rel_id});out body;")
    rel = next(e for e in data["elements"] if e["type"] == "relation")
    node_ids, seen = [], set()
    for m in rel.get("members", []):
        # Platform/stop_area duplicates ride alongside the stop nodes; the
        # 'stop' role is the one that marks the actual stopping point.
        if m["type"] == "node" and m.get("role", "").startswith("stop"):
            if m["ref"] not in seen:
                seen.add(m["ref"])
                node_ids.append(m["ref"])

    if not node_ids:  # some relations tag stops without an explicit role
        node_ids = [m["ref"] for m in rel.get("members", []) if m["type"] == "node"]

    ids = ",".join(str(n) for n in node_ids)
    nd = overpass(f"[out:json][timeout:90];node(id:{ids});out body;")
    coords = {e["id"]: e for e in nd["elements"]}

    out = []
    for nid in node_ids:
        e = coords.get(nid)
        if not e:
            continue
        name = e.get("tags", {}).get("name")
        if not name:
            continue
        out.append({"name": name, "lat": e["lat"], "lng": e["lon"]})
    return out


def hav(a, b, c, d):
    R = 6371
    dl, dn = math.radians(c - a), math.radians(d - b)
    x = math.sin(dl / 2) ** 2 + math.cos(math.radians(a)) * math.cos(math.radians(c)) * math.sin(dn / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


if __name__ == "__main__":
    result = {}
    for name, rid in RELATIONS.items():
        print(f"fetching {name} (rel {rid})...")
        st = ordered_stations(rid)
        result[name] = st
        print(f"   {len(st)} stations")
        # A sanity check on ordering: consecutive stations on these lines are
        # ~0.5-2 km apart. A big jump means the member order isn't the route
        # order and the sequence would be wrong.
        for i in range(len(st) - 1):
            d = hav(st[i]["lat"], st[i]["lng"], st[i + 1]["lat"], st[i + 1]["lng"])
            if d > 4:
                print(f"   !! {st[i]['name']} -> {st[i+1]['name']} = {d:.1f} km")
        time.sleep(3)

    with open("rail.json", "w") as f:
        json.dump(result, f, indent=2)
    print("\nwrote rail.json")
    for name, st in result.items():
        print(f"\n{name} ({len(st)}):")
        for i, s in enumerate(st):
            print(f"  {i+1:2d}. {s['name']:<28} {s['lat']:.6f} {s['lng']:.6f}")
