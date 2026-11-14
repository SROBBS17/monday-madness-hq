#!/usr/bin/env python3
"""Build site/data.json for the league app from the public FPL API.

Standard library only. Finished-gameweek data is cached in .cache/ so each run
only fetches what can still change. Prints "changed=true|false" to $GITHUB_OUTPUT
by comparing with the copy already published, so unchanged runs skip deploying.
"""
import hashlib, json, os, sys, time, urllib.error, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://fantasy.premierleague.com/api"
CACHE = os.path.join(ROOT, ".cache")
OUT = os.path.join(ROOT, "site", "data.json")
CFG = json.load(open(os.path.join(ROOT, "config", "league.json")))
UA = {"User-Agent": "Mozilla/5.0 (league-hq fan site)"}
CHIPS = ["wildcard", "freehit", "bboost", "3xc"]


def get(path, cache_name=None):
    if cache_name:
        p = os.path.join(CACHE, cache_name)
        if os.path.exists(p):
            return json.load(open(p))
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(f"{API}/{path}", headers=UA), timeout=30) as r:
                data = json.loads(r.read())
            break
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    if cache_name:
        os.makedirs(CACHE, exist_ok=True)
        json.dump(data, open(os.path.join(CACHE, cache_name), "w"))
    return data


def first_name(full):
    return (full or "").strip().split(" ")[0] or "?"


def provisional_bonus(fixtures):
    """Bonus from BPS for started fixtures whose bonus isn't confirmed yet: {element: bonus}."""
    out = {}
    for f in fixtures:
        out.update(fixture_bonus(f))
    return out


def fixture_bonus(f):
    out = {}
    for f in [f]:
        if not f["started"]:
            continue
        stats = {s["identifier"]: s for s in f["stats"]}
        if stats.get("bonus") and (stats["bonus"]["a"] or stats["bonus"]["h"]):
            continue
        bps = stats.get("bps")
        if not bps:
            continue
        rows = sorted(bps["a"] + bps["h"], key=lambda r: -r["value"])
        awarded, rank = 0, 0
        values = sorted({r["value"] for r in rows}, reverse=True)
        for v in values:
            if awarded >= 3:
                break
            tied = [r for r in rows if r["value"] == v]
            pts = 3 - awarded
            if pts <= 0:
                break
            for r in tied:
                out[r["element"]] = out.get(r["element"], 0) + pts
            awarded += len(tied)
    return out


def score_picks(picks_doc, pts, minutes, team_done, el_type, el_team):
    """Live points for one manager's picks, applying captaincy, chips and automatic substitutions."""
    chip = picks_doc.get("active_chip")
    picks = sorted(picks_doc["picks"], key=lambda k: k["position"])
    if chip == "bboost":
        total = sum(pts.get(k["element"], 0) * max(k["multiplier"], 1) for k in picks)
        cap = next((k for k in picks if k["is_captain"]), None)
        return total, cap["element"] if cap else None, []
    xi = [dict(k) for k in picks[:11]]
    bench = [dict(k) for k in picks[11:]]
    subs = []

    def done_no_show(el):
        return minutes.get(el, 0) == 0 and team_done(el_team[el])

    def counts(lineup):
        c = {1: 0, 2: 0, 3: 0, 4: 0}
        for k in lineup:
            c[el_type[k["element"]]] += 1
        return c

    for i, k in enumerate(xi):
        if not done_no_show(k["element"]):
            continue
        for b in bench:
            if b.get("used") or minutes.get(b["element"], 0) == 0:
                continue
            is_gk = el_type[k["element"]] == 1
            if is_gk != (el_type[b["element"]] == 1):
                continue
            trial = xi[:i] + [b] + xi[i + 1:]
            c = counts(trial)
            if c[1] == 1 and c[2] >= 3 and c[3] >= 2 and c[4] >= 1:
                b["used"] = True
                subs.append((k["element"], b["element"]))
                xi[i] = dict(b, multiplier=1, is_captain=False, is_vice_captain=False, sub_for=k["element"])
                break
    cap = next((k for k in picks if k["is_captain"]), None)
    vice = next((k for k in picks if k["is_vice_captain"]), None)
    mult = 3 if chip == "3xc" else 2
    captain_el = cap["element"] if cap else None
    if cap and done_no_show(cap["element"]) and vice and not done_no_show(vice["element"]):
        captain_el = vice["element"]
    total = 0
    for k in xi:
        m = mult if k["element"] == captain_el else 1
        total += pts.get(k["element"], 0) * m
    return total, captain_el, subs


def main():
    lid = CFG["league_id"]
    exclude = {int(x) for x in CFG.get("exclude_entries", [])}
    clubs = {int(k): v for k, v in CFG.get("clubs", {}).items()}
    B = get("bootstrap-static/")
    F = get("fixtures/")
    L = get(f"leagues-classic/{lid}/standings/")
    events = B["events"]
    cur = next((e for e in events if e["is_current"]), None)
    nxt = next((e for e in events if e["is_next"]), None)
    gw = cur["id"] if cur else 0
    cur_started = bool(cur) and any(f["started"] for f in F if f["event"] == gw)
    live_mode = bool(cur) and not cur["finished"] and cur_started
    finished_gws = [e["id"] for e in events if e["finished"]]
    teams = {t["id"]: t for t in B["teams"]}
    T = {t["id"]: t["short_name"] for t in B["teams"]}
    P = {p["id"]: p for p in B["elements"]}
    el_type = {p["id"]: p["element_type"] for p in B["elements"]}
    el_team = {p["id"]: p["team"] for p in B["elements"]}

    entries = [r for r in L["standings"]["results"] if r["entry"] not in exclude]
    ids = [r["entry"] for r in entries]
    hist = {i: get(f"entry/{i}/history/") for i in ids}
    trans = {i: get(f"entry/{i}/transfers/") for i in ids}
    # Leagues can start after GW1: their points only count from the starting gameweek.
    start = L["league"].get("start_event") or 1
    hist_full = {i: list(hist[i]["current"]) for i in ids}
    for i in ids:
        rows_ = hist[i]["current"]
        base = next((g["total_points"] for g in rows_ if g["event"] == start - 1), 0)
        hist[i]["current"] = [dict(g, total_points=g["total_points"] - base) for g in rows_ if g["event"] >= start]
        trans[i] = [t for t in trans[i] if t["event"] >= start]
    finished_gws = [g for g in finished_gws if g >= start]

    def picks_for(i, g):
        name = f"picks_{i}_{g}.json" if g in finished_gws else None
        try:
            return get(f"entry/{i}/event/{g}/picks/", name)
        except urllib.error.HTTPError:
            return None

    def live_for(g):
        return get(f"event/{g}/live/", f"live_{g}.json" if g in finished_gws else None)

    gws = [g for g in range(start, gw + 1)]
    live = {g: {e["id"]: e["stats"] for e in live_for(g)["elements"]} for g in gws}
    picks = {(i, g): picks_for(i, g) for i in ids for g in gws}

    # live scoring for the current gameweek
    cur_fx = [f for f in F if f["event"] == gw]
    bonus_prov = provisional_bonus(cur_fx) if live_mode else {}
    def team_done(team_id):
        fx = [f for f in cur_fx if team_id in (f["team_h"], f["team_a"])]
        return all(f["finished"] or f["finished_provisional"] for f in fx)
    cur_pts = {el: s["total_points"] + bonus_prov.get(el, 0) for el, s in live.get(gw, {}).items()}
    cur_min = {el: s["minutes"] for el, s in live.get(gw, {}).items()}

    managers, history, awards_raw, transfers_out = [], [], [], []
    league_rank_at = {}
    totals_at = {i: {g["event"]: g["total_points"] for g in hist[i]["current"]} for i in ids}

    live_points = {}
    for i in ids:
        pd = picks.get((i, gw))
        if live_mode and pd:
            raw, cap_el, subs = score_picks(pd, cur_pts, cur_min, team_done, el_type, el_team)
            cost = pd["entry_history"]["event_transfers_cost"]
            live_points[i] = dict(points=raw - cost, captain=cap_el, subs=subs)

    for g in gws:
        def tot(i):
            if live_mode and g == gw and i in live_points:
                prev = totals_at[i].get(g - 1, 0)
                return prev + live_points[i]["points"]
            return totals_at[i].get(g, 0)
        for r, i in enumerate(sorted(ids, key=lambda i: -tot(i)), 1):
            league_rank_at[(i, g)] = r

    for i in ids:
        h = hist[i]
        row = next(r for r in entries if r["entry"] == i)
        chips_used = {c["name"] + ("_2" if c["event"] >= 20 else "_1"): c["event"] for c in h["chips"]}
        by_gw = {c["event"]: c["name"] for c in h["chips"]}
        ft = 1
        for g in hist_full[i]:
            if g["event"] == 1:
                continue
            if by_gw.get(g["event"]) not in ("wildcard", "freehit"):
                ft = max(ft - g["event_transfers"], 0)
            ft = min(ft + 1, 5)
        last = h["current"][-1] if h["current"] else {"bank": 0, "value": 1000, "overall_rank": None}
        pd = picks.get((i, gw))
        gw_pts = live_points[i]["points"] if i in live_points else (h["current"][-1]["points"] if h["current"] else 0)
        total = (totals_at[i].get(gw - 1, 0) + gw_pts) if i in live_points else row["total"]
        managers.append(dict(
            id=i, name=CFG.get("nicknames", {}).get(str(i)) or first_name(row["player_name"]), team=row["entry_name"], club=clubs.get(i),
            avatar=CFG.get("avatars", {}).get(str(i)),
            rank=league_rank_at.get((i, gw), row["rank"]), last_rank=league_rank_at.get((i, gw - 1)),
            total=total, gw_points=gw_pts, overall_rank=last.get("overall_rank"),
            bank=last["bank"] / 10, value=last["value"] / 10, free_transfers=ft,
            hits=sum(g["event_transfers_cost"] for g in h["current"]),
            bench_total=sum(g["points_on_bench"] for g in h["current"]),
            chips=chips_used, active_chip=pd.get("active_chip") if pd else None,
            captain=(live_points[i]["captain"] if i in live_points else next((k["element"] for k in pd["picks"] if k["is_captain"]), None)) if pd else None,
            picks=[dict(el=k["element"], slot=k["position"], mult=k["multiplier"], c=k["is_captain"], v=k["is_vice_captain"]) for k in pd["picks"]] if pd else [],
            subs=live_points[i]["subs"] if i in live_points else [],
        ))
        for g in h["current"]:
            pdg = picks.get((i, g["event"]))
            cap = next((k for k in pdg["picks"] if k["is_captain"]), None) if pdg else None
            cap_pts = live[g["event"]].get(cap["element"], {}).get("total_points", 0) * cap["multiplier"] if cap else 0
            points = g["points"]
            if live_mode and g["event"] == gw and i in live_points:
                points = live_points[i]["points"]
            history.append(dict(id=i, gw=g["event"], points=points, total=totals_at[i].get(g["event"], 0) if g["event"] != gw or not live_mode else total,
                                rank=league_rank_at.get((i, g["event"])), bench=g["points_on_bench"], hit=g["event_transfers_cost"],
                                chip=by_gw.get(g["event"]), captain=cap["element"] if cap else None, captain_pts=cap_pts))
        for t in trans[i]:
            g = t["event"]
            lp = live.get(g, {})
            transfers_out.append(dict(id=i, gw=g, el_in=t["element_in"], el_out=t["element_out"],
                                      pts_in=lp.get(t["element_in"], {}).get("total_points", 0),
                                      pts_out=lp.get(t["element_out"], {}).get("total_points", 0),
                                      chip=by_gw.get(g)))

    # weekly awards for finished gameweeks
    awards = []
    for g in finished_gws:
        rows = [r for r in history if r["gw"] == g]
        if len(rows) < 2:
            continue
        def add(key, label, sel, val, text):
            best = sel(r[val] for r in rows)
            for r in rows:
                if r[val] == best:
                    awards.append(dict(gw=g, award=key, label=label, id=r["id"], value=best, text=text.format(v=best)))
        add("motw", "Manager of the Week", max, "points", "{v} points")
        add("spoon", "Wooden Spoon", min, "points", "{v} points")
        add("cap_hero", "Captain Fantastic", max, "captain_pts", "{v} from the armband")
        add("cap_fail", "Armband Fail", min, "captain_pts", "{v} from the armband")
        add("bench", "Bench Disaster", max, "bench", "{v} points left on the bench")
        tw = [t for t in transfers_out if t["gw"] == g and t["chip"] not in ("wildcard", "freehit")]
        if tw:
            best = max(tw, key=lambda t: t["pts_in"] - t["pts_out"])
            worst = min(tw, key=lambda t: t["pts_in"] - t["pts_out"])
            awards.append(dict(gw=g, award="transfer_best", label="Transfer of the Week", id=best["id"], value=best["pts_in"] - best["pts_out"],
                               text=f"{P[best['el_out']]['web_name']} out, {P[best['el_in']]['web_name']} in: {best['pts_in']} vs {best['pts_out']}"))
            if worst is not best and worst["pts_in"] - worst["pts_out"] < 0:
                awards.append(dict(gw=g, award="transfer_worst", label="Transfer Howler", id=worst["id"], value=worst["pts_in"] - worst["pts_out"],
                                   text=f"{P[worst['el_out']]['web_name']} out, {P[worst['el_in']]['web_name']} in: {worst['pts_in']} vs {worst['pts_out']}"))
        for r in rows:
            if r["hit"] > 0:
                gain = sum(t["pts_in"] - t["pts_out"] for t in tw if t["id"] == r["id"])
                if gain < r["hit"]:
                    awards.append(dict(gw=g, award="hit_backfired", label="The -4 That Backfired", id=r["id"], value=gain - r["hit"],
                                       text=f"Paid -{r['hit']}, transfers gained {gain}"))

    months = []
    for ph in B["phases"][1:]:
        if ph["start_event"] > max(gw, 1) or ph["stop_event"] < start:
            continue
        tot = {i: sum(r["points"] for r in history if r["id"] == i and ph["start_event"] <= r["gw"] <= ph["stop_event"]) for i in ids}
        months.append(dict(name=ph["name"], start=ph["start_event"], stop=ph["stop_event"],
                           complete=ph["stop_event"] in finished_gws,
                           standings=[dict(id=i, points=p) for i, p in sorted(tot.items(), key=lambda x: -x[1])]))

    owned = {k["el"] for m in managers for k in m["picks"]} | {t["el_in"] for t in transfers_out} | {t["el_out"] for t in transfers_out} \
        | {r["captain"] for r in history if r["captain"]}
    players = {str(e): dict(n=P[e]["web_name"], t=T[P[e]["team"]], p=el_type[e], c=P[e]["now_cost"] / 10, s=P[e]["status"],
                            news=P[e]["news"], gw=cur_pts.get(e, live.get(gw, {}).get(e, {}).get("total_points", 0)) if gw else 0,
                            min=cur_min.get(e, 0), form=P[e]["form"], tot=P[e]["total_points"])
               for e in owned if e in P}

    table = {t: dict(p=0, w=0, d=0, l=0, gf=0, ga=0, pts=0, form="") for t in teams}
    last_result = {}
    for f in sorted(F, key=lambda f: f["kickoff_time"] or ""):
        if not (f["finished"] or f["finished_provisional"]):
            continue
        for t, o, gf, ga, ha in ((f["team_h"], f["team_a"], f["team_h_score"], f["team_a_score"], "H"),
                                 (f["team_a"], f["team_h"], f["team_a_score"], f["team_h_score"], "A")):
            r = table[t]; r["p"] += 1; r["gf"] += gf; r["ga"] += ga
            res = "W" if gf > ga else "D" if gf == ga else "L"
            r[res.lower()] += 1; r["pts"] += {"W": 3, "D": 1, "L": 0}[res]; r["form"] = (r["form"] + res)[-5:]
            last_result[T[t]] = dict(opp=T[o], ha=ha, gf=gf, ga=ga, res=res, gw=f["event"], kickoff=f["kickoff_time"])
    pltable = [dict(team=T[t], name=teams[t]["name"], **r, gd=r["gf"] - r["ga"]) for t, r in table.items()]
    pltable.sort(key=lambda r: (-r["pts"], -r["gd"], -r["gf"]))
    for n, r in enumerate(pltable, 1):
        r["pos"] = n

    start = nxt["id"] if nxt else gw
    fixtures = [dict(gw=f["event"], h=T[f["team_h"]], a=T[f["team_a"]], hd=f["team_h_difficulty"], ad=f["team_a_difficulty"],
                     ko=f["kickoff_time"], hs=f["team_h_score"], as_=f["team_a_score"], started=f["started"],
                     done=f["finished"] or f["finished_provisional"], mins=f["minutes"])
                for f in F if f["event"] and (f["event"] == gw or start <= f["event"] < start + 6)]

    STAT_KEYS = {"goals_scored": "goal", "assists": "assist", "own_goals": "own_goal", "penalties_saved": "pen_save",
                 "penalties_missed": "pen_miss", "red_cards": "red", "yellow_cards": "yellow"}
    match = []
    event_els = set()
    for f in sorted(cur_fx, key=lambda f: f["kickoff_time"] or ""):
        evs = []
        for st in f["stats"]:
            kind = STAT_KEYS.get(st["identifier"])
            if not kind:
                continue
            for side in ("h", "a"):
                for r in st[side]:
                    evs.append(dict(t=kind, el=r["element"], n=r["value"], side=side))
                    event_els.add(r["element"])
        stats = {x["identifier"]: x for x in f["stats"]}
        confirmed = stats.get("bonus") and (stats["bonus"]["a"] or stats["bonus"]["h"])
        bonus = []
        if confirmed:
            for side in ("h", "a"):
                bonus += [dict(el=r["element"], b=r["value"], prov=False) for r in stats["bonus"][side]]
        elif f["started"]:
            bonus = [dict(el=e, b=b, prov=True) for e, b in fixture_bonus(f).items()]
        event_els |= {b["el"] for b in bonus}
        match.append(dict(id=f["id"], h=T[f["team_h"]], a=T[f["team_a"]], hs=f["team_h_score"], as_=f["team_a_score"],
                          ko=f["kickoff_time"], started=f["started"], done=f["finished"] or f["finished_provisional"],
                          mins=f["minutes"], events=evs, bonus=sorted(bonus, key=lambda b: -b["b"])))
    for e in event_els:
        if str(e) not in players and e in P:
            players[str(e)] = dict(n=P[e]["web_name"], t=T[P[e]["team"]], p=el_type[e], c=P[e]["now_cost"] / 10, s=P[e]["status"],
                                   news=P[e]["news"], gw=cur_pts.get(e, 0), min=cur_min.get(e, 0), form=P[e]["form"], tot=P[e]["total_points"])

    data = dict(
        match=match,
        meta=dict(title=CFG.get("site_title") or L["league"]["name"], league=L["league"]["name"], contact=CFG.get("contact", ""),
                  gw=gw, gw_finished=bool(cur and cur["finished"]), live=live_mode, next_gw=nxt["id"] if nxt else None,
                  next_deadline=nxt["deadline_time"] if nxt else None, finished_gws=finished_gws,
                  app_version=os.environ.get("APP_VERSION", "")[:8],
                  banter_clubs=CFG["banter_clubs"] if "banter_clubs" in CFG else ["ARS", "LIV", "CHE", "TOT", "MUN"]),
        managers=managers, history=history, awards=awards, transfers=transfers_out, months=months,
        players=players, pltable=pltable, last_result=last_result, fixtures=fixtures,
    )
    body = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(body.encode()).hexdigest()[:16]
    data["meta"]["hash"] = digest
    data["meta"]["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))

    changed = True
    published = os.environ.get("PUBLISHED_URL")
    if published:
        try:
            with urllib.request.urlopen(urllib.request.Request(published + "data.json", headers=UA), timeout=20) as r:
                changed = json.loads(r.read()).get("meta", {}).get("hash") != digest
        except Exception:
            changed = True
    if os.environ.get("FORCE_DEPLOY") == "true":
        changed = True
    print(f"GW{gw} live={live_mode} managers={len(managers)} hash={digest} changed={changed}")
    if os.environ.get("CHECK_ONLY"):
        sys.exit(0 if changed else 3)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as fh:
            fh.write(f"changed={'true' if changed else 'false'}\n")


if __name__ == "__main__":
    main()
