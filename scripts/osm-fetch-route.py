#!/usr/bin/env python3
"""Fetch LTFRB Route 3 (Antipolo–Quiapo via Aurora Blvd), both directions.

Stops come out in relation-member order, which for a PT v2 relation is the
travel order along the route.
"""
import json, time, math, urllib.request, urllib.parse

OVERPASS = "https://overpass-api.de/api/interpreter"
DIRECTIONS = {"outbound": 8906890, "inbound": 9453757}  # Antipolo->Quiapo, Quiapo->Antipolo


def overpass(query, attempts=5):
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                OVERPASS,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "ParaPo/1.0 (transit app; OSM import)"},
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            if i == attempts - 1:
                raise
            print(f"  retry {i+1}: {e}")
            time.sleep(20)


def hav(a, b, c, d):
    R = 6371
    dl, dn = math.radians(c - a), math.radians(d - b)
    x = math.sin(dl/2)**2 + math.cos(math.radians(a))*math.cos(math.radians(c))*math.sin(dn/2)**2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1-x))


def stops_for(rel_id):
    data = overpass(f"[out:json][timeout:120];rel({rel_id});out body;")
    rel = next(e for e in data["elements"] if e["type"] == "relation")
    node_ids, seen = [], set()
    for m in rel["members"]:
        if m["type"] == "node" and m["ref"] not in seen:
            seen.add(m["ref"])
            node_ids.append(m["ref"])
    time.sleep(3)
    nd = overpass(f"[out:json][timeout:120];node(id:{','.join(map(str,node_ids))});out body;")
    coords = {e["id"]: e for e in nd["elements"]}
    out = []
    for nid in node_ids:
        e = coords.get(nid)
        if not e:
            continue
        name = e.get("tags", {}).get("name")
        if not name:
            continue  # an unnamed platform is not something we can label honestly
        out.append({"osm_id": nid, "name": name, "lat": e["lat"], "lng": e["lon"]})
    return rel["tags"], out


if __name__ == "__main__":
    result = {}
    for direction, rid in DIRECTIONS.items():
        print(f"fetching {direction} (rel {rid})...")
        tags, stops = stops_for(rid)
        # Collapse consecutive duplicates (both sides of a road often share a name)
        dedup = []
        for s in stops:
            if dedup and dedup[-1]["name"] == s["name"]:
                continue
            dedup.append(s)
        result[direction] = {"tags": tags, "stops": dedup}
        print(f"  {len(stops)} named stops -> {len(dedup)} after collapsing duplicates")
        for i in range(len(dedup) - 1):
            d = hav(dedup[i]["lat"], dedup[i]["lng"], dedup[i+1]["lat"], dedup[i+1]["lng"])
            if d > 6:
                print(f"  !! big jump {dedup[i]['name']} -> {dedup[i+1]['name']} = {d:.1f} km")
        time.sleep(3)

    json.dump(result, open("route3.json", "w"), indent=2, ensure_ascii=False)
    for direction, r in result.items():
        print(f"\n{direction} ({r['tags'].get('from')} -> {r['tags'].get('to')}), {len(r['stops'])} stops:")
        for i, s in enumerate(r["stops"], 1):
            print(f"  {i:2d}. {s['name']:<42} {s['lat']:.6f} {s['lng']:.6f}")
