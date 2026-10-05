#!/usr/bin/env python3
"""
Build migrations/0002_seed_website.sql from the public website's wine data.

Sources read (both from this repo):
  - assets/wines.json          (wine finder data)
  - wines/p/<slug>/index.html  (wine detail pages)

Rules (spec 19, 20):
  - Raw values are kept verbatim in wine_vintages.legacy and field_provenance.raw_value.
  - Only safe formatting normalization is applied (whitespace, apostrophes, units,
    known abbreviations). Facts are never "corrected".
  - Anything doubtful becomes a review flag instead of a silent fix.
  - IDs are deterministic (uuid5), so re-running produces the same SQL.

Run from the repo root:  python3 cms/scripts/build_seed_from_website.py
"""
import html
import json
import re
import unicodedata
import uuid
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "cms" / "migrations" / "0002_seed_website.sql"
NS = uuid.UUID("6f1c2a52-3b7e-4c1e-9d55-6d4d2b1a0001")
SOURCE_ID = str(uuid.uuid5(NS, "source:mm_website:2026-10"))


def uid(*parts):
    return str(uuid.uuid5(NS, ":".join(str(p) for p in parts)))


def q(v):
    """SQL literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (list, tuple)):
        return "ARRAY[" + ",".join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    if isinstance(v, dict):
        return q(json.dumps(v, ensure_ascii=False)) + "::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def clean(s):
    if s is None:
        return None
    s = html.unescape(s)
    s = s.replace(" ", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


# ---------------------------------------------------------------------------
# Reference normalization tables (safe, reviewable)
# ---------------------------------------------------------------------------
CRITICS = OrderedDict([
    # canonical name: (short label, publication, aliases)
    ("James Suckling", ("JS", "JamesSuckling.com", ["JS", "Suckling"])),
    ("Vinous", ("VN", "Vinous", ["Vinous Media"])),
    ("Wine Advocate", ("WA", "The Wine Advocate (Robert Parker)", ["WA", "Robert Parker", "RP", "Parker", "Robert Parker's Wine Advocate", "Robert Parker’s Wine Advocate"])),
    ("Jeb Dunnuck", ("JD", "JebDunnuck.com", ["JD"])),
    ("Wine Enthusiast", ("WE", "Wine Enthusiast", ["WE"])),
    ("Burghound", ("BH", "Burghound (Allen Meadows)", ["Allen Meadows"])),
    ("Decanter", ("DEC", "Decanter", [])),
    ("Jancis Robinson", ("JR", "JancisRobinson.com", ["JR"])),
    ("Wine Spectator", ("WS", "Wine Spectator", ["WS"])),
    ("Jasper Morris", ("JM", "Inside Burgundy", ["JM"])),
    ("Jane Anson", ("JA", "Inside Bordeaux", [])),
    ("The Drinks Business", ("DB", "The Drinks Business", [])),
    ("Falstaff", ("FAL", "Falstaff", [])),
    ("WineHunter", ("WH", "WineHunter Award", ["Wine Hunter"])),
    ("Gambero Rosso", ("GR", "Gambero Rosso", [])),
    ("Bibenda", ("BIB", "Bibenda", [])),
])
UNCONFIRMED_CRITICS = {"TB"}

CRITIC_ALIAS = {}
for name, (short, _pub, aliases) in CRITICS.items():
    for a in [name, short, *aliases]:
        CRITIC_ALIAS[a.lower()] = name

# Supervision: only merge spelling variants that are clearly the same string
# with an abbreviated title. Anything else that merely looks similar is flagged.
SUPERVISION_CANON = {
    "rabbi its'hak katz kehal yereim paris chareidi": "Rabbi Its’hak Katz, Kehal Yereim Paris (Chareidi)",
    "r' its'hak katz kehal yereim paris chareidi": "Rabbi Its’hak Katz, Kehal Yereim Paris (Chareidi)",
}
SUPERVISION_SHORT = {"OU": "Orthodox Union", "OK": "OK Kosher", "IKU": "IKU", "IKUI": "IKUI"}

CATEGORY = {"Red": "red", "White": "white", "Rosé": "rose", "Sparkling": "sparkling"}

# Website grouping labels that are not real regions -> resolve by appellation.
COMBINED_REGIONS = {
    "Languedoc and Provence": {
        "Côtes de Provence": "Provence", "La Clape, Languedoc": "Languedoc", "Pays d'Oc": "Languedoc",
    },
    "Loire and Champagne": {"Sancerre": "Loire Valley", "Champagne": "Champagne"},
}
REGION_RENAME = {"Côtes de Provence": "Provence", "Israel": None}  # Israel listed as its own region

DESIGNATION_PATTERNS = [
    r"\d(?:er|e|ème) Grand Cru Classé", r"Grand Cru Classé", r"Premier Grand Cru Classé [AB]",
    r"Premier Cru", r"1er Cru", r"Grand Cru", r"DOCG", r"DOC", r"IGT", r"IGP", r"AOC", r"AOP",
]
CLASSIFICATION_ONLY = {"AOC", "DOC", "DOCG", "IGT", "Grand Cru", "Kabinett"}

GRAPE_COLOR = {
    "Pinot Noir": "red", "Cabernet Sauvignon": "red", "Merlot": "red", "Cabernet Franc": "red",
    "Petit Verdot": "red", "Malbec": "red", "Sangiovese": "red", "Nebbiolo": "red", "Barbera": "red",
    "Aglianico": "red", "Montepulciano": "red", "Syrah": "red", "Grenache": "red", "Cinsault": "red",
    "Mourvèdre": "red", "Nero d'Avola": "red", "Frappato": "red", "Sangioveto": "red", "Malvasia Nera": "red",
    "Chardonnay": "white", "Sauvignon Blanc": "white", "Sémillon": "white", "Muscadelle": "white",
    "Riesling": "white", "Silvaner": "white", "Arneis": "white", "Fiano": "white", "Greco": "white",
    "Pinot Grigio": "white", "Viognier": "white", "Moscato": "white", "Roscetto": "white", "Furmint": "white",
    "Hárslevelű": "white", "Rolle (Vermentino)": "white", "Muscat (Sárgamuskotály)": "white",
}

# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def norm_apostrophe(s):
    return s.replace("’", "'").replace("‘", "'") if s else s


def split_appellation(raw, region, country=None):
    """Return (place_name or None, designation or None, note)."""
    if not raw:
        return None, None, "missing"
    if raw in CLASSIFICATION_ONLY:
        return None, raw, "classification_only"
    found = []
    place = raw
    m = re.match(r"^(DOCG|DOC|IGT|IGP|AOC|AOP)\s+(.+)$", place)
    if m:
        found.append(m.group(1))
        place = m.group(2)
    changed = True
    while changed:
        changed = False
        for pat in DESIGNATION_PATTERNS + [r"Riserva", r"Superiore", r"Classico Superiore"]:
            m = re.search(r"\s*\b(" + pat + r")$", place)
            if m and m.start() > 0:
                found.insert(0, m.group(1))
                place = place[: m.start()].strip(" ,")
                changed = True
                break
    designation = " ".join(found) or None
    if place and place.lower() in ((region or "").lower(), (country or "").lower()):
        place = None
    return place or None, designation, None


def parse_grapes(raw):
    """'64% Cabernet Sauvignon, 32% Merlot (2022)' -> ([(name, pct)], notes)."""
    notes = []
    if not raw:
        return [], ["missing"]
    s = raw
    m = re.search(r"\((\d{4})\)\s*$", s)
    if m:
        notes.append(f"vintage_in_blend:{m.group(1)}")
        s = s[: m.start()].strip()
    if s.lower() in ("red blend", "piedmont blend"):
        return [], ["generic_blend"]
    # Protect parenthesised names, then split on separators or before a new percentage.
    parts = re.split(r"\s*[,;]\s*|\s+(?=\d+(?:\.\d+)?%)", s)
    out = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        m = re.match(r"^(\d+(?:\.\d+)?)%\s*(.+)$", p)
        if m:
            out.append((m.group(2).strip(), float(m.group(1))))
        else:
            out.append((p, None))
    pcts = [p for _, p in out if p is not None]
    if pcts and abs(sum(pcts) - 100) > 0.01:
        notes.append(f"percent_sum:{sum(pcts):g}")
    if pcts and len(pcts) != len(out):
        notes.append("partial_percentages")
    return out, notes


def parse_score(text):
    """'96-97', '98+', '92 to 94', '16.5/20', '100' -> (numeric, low, high)."""
    t = text.strip()
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)$", t)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        return None, lo, hi
    m = re.match(r"^(\d+(?:\.\d+)?)\+?(?:/\d+)?$", t)
    if m:
        return float(m.group(1)), None, None
    return None, None, None


def page_fields(slug):
    p = ROOT / "wines" / "p" / slug / "index.html"
    if not p.exists():
        return {}
    t = p.read_text(encoding="utf-8")
    f = {}
    for dt, dd in re.findall(r"<dt>(.*?)</dt><dd>(.*?)</dd>", t, re.S):
        f["dl:" + clean(re.sub("<[^>]+>", "", dt))] = clean(re.sub("<[^>]+>", "", dd))
    for h, body in re.findall(r"<h2>(.*?)</h2>\s*<p>(.*?)</p>", t, re.S):
        f["h:" + clean(h)] = clean(re.sub("<[^>]+>", "", body))
    m = re.search(r'<p class="serve"><b>Serve</b>(.*?)</p>', t, re.S)
    if m:
        f["serve"] = clean(re.sub("<[^>]+>", "", m.group(1)))
    crits = []
    for block in re.findall(r'<div class="crit">(.*?)</div>', t, re.S):
        b = re.search(r"<b>(.*?)</b>", block)
        sp = re.search(r"<span>(.*?)</span>", block)
        sm = re.search(r"<small>(.*?)</small>", block)
        qq = re.search(r"<q>(.*?)</q>", block, re.S)
        crits.append({
            "score": clean(b.group(1)) if b else None,
            "critic": clean(sp.group(1)) if sp else None,
            "context": clean(sm.group(1)) if sm else None,
            "quote": clean(qq.group(1)) if qq else None,
        })
    f["crits"] = crits
    return f


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def main():
    wines = json.loads((ROOT / "assets" / "wines.json").read_text(encoding="utf-8"))
    sql = []
    flags = []
    prov = []

    def flag(entity_type, entity_id, flag_type, message, field=None, severity="warning", details=None):
        flags.append((uid("flag", entity_type, entity_id, flag_type, field or "", message),
                      entity_type, entity_id, field, flag_type, severity, message, details or {}))

    locations = OrderedDict()  # key -> (id, parent_id, type, name, aliases)

    def loc(type_, name, parent_key=None):
        key = (parent_key, type_, name.lower())
        if key not in locations:
            parent_id = locations[parent_key][0] if parent_key else None
            locations[key] = (uid("loc", parent_key or "", type_, name.lower()), parent_id, type_, name)
        return key

    grapes = OrderedDict()
    critics_used = set()
    sup_auths = OrderedDict()
    producers = OrderedDict()

    sql.append("-- Generated by cms/scripts/build_seed_from_website.py. Do not edit by hand.\n")
    sql.append("INSERT INTO sources (id, source_type, title, url, published_on) VALUES "
               f"({q(SOURCE_ID)}, 'mm_website', 'mandmimporters.com wine finder and wine pages (October 2026 snapshot)', "
               "'https://www.mandmimporters.com/wines', '2026-10-05');\n")

    wine_rows, vintage_rows, wg_rows, ws_rows, sup_rows = [], [], [], [], []
    names_seen = {}

    for w in wines:
        slug = w["slug"]
        page = page_fields(slug)
        name = clean(w["name"])
        producer_name = clean(w["producer"]) or "Unknown producer"
        country = clean(w["country"])
        region_raw = clean(w["region"])
        app_raw = clean(w["appellation"]) or page.get("dl:Appellation")

        # --- producer
        pkey = producer_name.lower()
        if pkey not in producers:
            producers[pkey] = {"id": uid("producer", pkey), "name": producer_name, "country": country, "regions": set()}
        prod = producers[pkey]

        # --- location chain
        ckey = loc("country", "United States" if country == "USA" else country)
        region = region_raw
        region_note = None
        if region_raw in COMBINED_REGIONS:
            region = COMBINED_REGIONS[region_raw].get(app_raw or "")
            region_note = "combined_region" if region else "combined_region_unresolved"
        elif region_raw in REGION_RENAME:
            region = REGION_RENAME[region_raw]
        rkey = loc("region", region, ckey) if region else None
        place, designation, app_note = split_appellation(app_raw, region, country)
        akey = loc("appellation", place, rkey or ckey) if place else None
        location_key = akey or rkey or ckey
        prod["regions"].add(rkey or ckey)

        # --- wine identity
        wine_id = uid("wine", slug)
        canonical = name
        if name.lower().startswith(producer_name.lower() + " "):
            canonical = name[len(producer_name) + 1:].strip()
        category = CATEGORY.get(w["color"])
        wine_rows.append((wine_id, prod["id"], canonical, name, slug, category, locations[location_key][0], designation, slug))
        if name.lower() in names_seen:
            flag("wine", wine_id, "duplicate", f"Possible duplicate of '{names_seen[name.lower()]}'", "display_name")
        names_seen[name.lower()] = name

        # --- vintages listed on the page
        vint_raw = page.get("dl:Vintages")
        vintages = [v.strip() for v in vint_raw.split(",")] if vint_raw else []
        vintages = [v for v in vintages if re.fullmatch(r"\d{4}|NV", v)]
        crit_vintages = []
        for c in page.get("crits", []):
            m = re.match(r"(\d{4})", c.get("context") or "")
            if m:
                crit_vintages.append(m.group(1))
        for v in crit_vintages:
            if v not in vintages:
                vintages.append(v)
        vintages_sorted = sorted(set(vintages), reverse=True)
        if not vintages_sorted:
            vintages_sorted = [None]

        grapes_list, grape_notes = parse_grapes(clean(w["grapes"]) or page.get("dl:Grapes"))
        mev = (w["mevushal"] or page.get("dl:Mevushal") or "").strip().lower()
        mevushal = {"yes": "yes", "no": "no"}.get(mev, "unknown")
        sup_raw = clean(w["supervision"]) or page.get("dl:Supervision")
        sup_parts = [s.strip() for s in (sup_raw or "").split(";") if s.strip()]

        legacy = {
            "source": "mm_website",
            "website_slug": slug,
            "name": w["name"], "producer": w["producer"], "country": w["country"], "region": w["region"],
            "appellation": w["appellation"], "grapes": w["grapes"], "color": w["color"],
            "mevushal": w["mevushal"], "supervision": w["supervision"], "pairing": w["pairing"],
            "score": w["score"], "img": w["img"], "new": w["new"],
            "vintages": vint_raw, "tasting_note": page.get("h:Tasting Notes"),
            "expert_note": page.get("h:Expert Notes"), "serve": page.get("serve"),
            "region_text": page.get("h:The Region"), "grape_text": page.get("h:The Grape"),
            "critical_acclaim": page.get("crits") or [],
        }

        multi = len(vintages_sorted) > 1
        for idx, vint in enumerate(vintages_sorted):
            vid = uid("vintage", slug, vint or "unknown")
            vintage_rows.append({
                "id": vid, "wine_id": wine_id, "vintage_text": vint, "location_id": locations[location_key][0],
                "mevushal": mevushal, "supervision_display": sup_raw, "special_designation": designation,
                "tasting_note": page.get("h:Tasting Notes"), "food_pairing": clean(w["pairing"]) or page.get("h:Food Pairing"),
                "is_new": bool(w["new"]), "legacy": legacy,
            })

            # grapes
            for order, (gname, pct) in enumerate(grapes_list):
                gk = gname.lower()
                if gk not in grapes:
                    grapes[gk] = (uid("grape", gk), gname)
                wg_rows.append((vid, grapes[gk][0], pct, order))

            # supervision links
            for order, sp in enumerate(sup_parts):
                canon = SUPERVISION_CANON.get(norm_apostrophe(sp).lower(), sp)
                ak = canon.lower()
                if ak not in sup_auths:
                    sup_auths[ak] = {"id": uid("sup", ak), "name": canon, "aliases": set()}
                if sp != canon:
                    sup_auths[ak]["aliases"].add(sp)
                sup_rows.append((vid, sup_auths[ak]["id"], order))

            # scores from the detail page, tied to their stated vintage
            for order, c in enumerate(page.get("crits", [])):
                cv = re.match(r"(\d{4})", c.get("context") or "")
                if (cv.group(1) if cv else None) != vint:
                    continue
                critic = CRITIC_ALIAS.get((c["critic"] or "").lower(), c["critic"])
                critics_used.add(critic)
                num, lo, hi = parse_score(c["score"] or "")
                sid = uid("score", vid, critic, c["score"])
                ws_rows.append((sid, vid, critic, c["score"], num, lo, hi, True, order,
                                f"{c['score']} {c['critic']} ({c.get('context') or ''})".strip()))
                if "barrel" in (c.get("context") or "").lower():
                    flag("wine_vintage", vid, "suspicious_change",
                         f"{critic} score {c['score']} is a barrel-sample range; confirm a finished-wine score before print.", "scores", "info")

            # 'Scores' line on the page, e.g. "Decanter 88" (no vintage given)
            if page.get("dl:Scores") and idx == 0:
                for part in re.split(r"[;,]", page["dl:Scores"]):
                    m = re.match(r"^\s*(.+?)\s+([\d.]+\+?)\s*$", part)
                    if not m:
                        continue
                    critic = CRITIC_ALIAS.get(m.group(1).lower(), m.group(1))
                    critics_used.add(critic)
                    num, lo, hi = parse_score(m.group(2))
                    ws_rows.append((uid("score", vid, critic, m.group(2), "pagescores"), vid, critic, m.group(2), num, lo, hi,
                                    True, 98, part.strip()))
                    flag("wine_vintage", vid, "missing",
                         f"Score '{part.strip()}' on the website has no vintage. Attached to {vint or 'this record'}; confirm which vintage it belongs to.",
                         "scores")

            # the finder's single score string has no vintage: attach to newest, flag
            if w["score"] and idx == 0:
                m = re.match(r"^([\d.]+(?:\s*[-+]\s*[\d.]*)?\+?)\s+(.+)$", w["score"].strip())
                if m:
                    stext, cname = m.group(1).replace(" ", ""), m.group(2)
                    critic = CRITIC_ALIAS.get(cname.lower(), cname)
                    critics_used.add(critic)
                    already = any(r[1] == vid and r[2] == critic and r[3] == stext for r in ws_rows)
                    if not already:
                        num, lo, hi = parse_score(stext)
                        ws_rows.append((uid("score", vid, critic, stext, "finder"), vid, critic, stext, num, lo, hi,
                                        True, 99, w["score"]))
                        flag("wine_vintage", vid, "missing",
                             f"Score '{w['score']}' on the website has no vintage. Attached to {vint or 'this record'}; confirm which vintage it belongs to.",
                             "scores")

            # flags
            if vint is None:
                flag("wine_vintage", vid, "missing", "Vintage not listed on the website. Add the vintage.", "vintage_text", "error")
            if multi:
                flag("wine_vintage", vid, "legacy",
                     f"Website lists vintages {vint_raw or ', '.join(vintages_sorted)} for one page; tasting note, blend and supervision were copied to each vintage. Confirm per vintage.",
                     None, "info")
            if mevushal == "unknown":
                flag("wine_vintage", vid, "missing", "Mevushal status not recorded.", "mevushal")
            if not sup_parts:
                flag("wine_vintage", vid, "missing", "Kosher supervision not recorded.", "supervision_display")
            if not page.get("h:Tasting Notes"):
                flag("wine_vintage", vid, "missing", "No tasting note.", "tasting_note", "info")
            for gn in grape_notes:
                if gn == "missing":
                    flag("wine_vintage", vid, "missing", "Grape / blend not recorded.", "grapes")
                elif gn == "generic_blend":
                    flag("wine_vintage", vid, "missing", f"Blend recorded only as '{w['grapes']}'. Add the actual grapes.", "grapes")
                elif gn.startswith("vintage_in_blend:"):
                    y = gn.split(":")[1]
                    sev = "warning" if vint and vint != y else "info"
                    flag("wine_vintage", vid, "conflict" if sev == "warning" else "legacy",
                         f"Blend text says it is for {y}" + (f", but this record is {vint}." if sev == "warning" else "."), "grapes", sev)
                elif gn.startswith("percent_sum:"):
                    flag("wine_vintage", vid, "conflict", f"Blend percentages add up to {gn.split(':')[1]}%, not 100%.", "grapes")
                elif gn == "partial_percentages":
                    flag("wine_vintage", vid, "missing", "Only some grapes have percentages.", "grapes", "info")
            if app_note == "classification_only":
                flag("wine_vintage", vid, "missing", f"Appellation field only says '{app_raw}'. Add the actual appellation.", "location_id")
            elif app_note == "missing":
                flag("wine_vintage", vid, "missing", "Appellation not recorded.", "location_id")
            if region_note == "combined_region":
                flag("wine_vintage", vid, "legacy",
                     f"Website region '{region_raw}' is a grouping; region set to {region} from the appellation.", "location_id", "info")
            elif region_note == "combined_region_unresolved":
                flag("wine_vintage", vid, "missing", f"Website region '{region_raw}' is a grouping; set the actual region.", "location_id")
            if page.get("h:Expert Notes"):
                flag("wine_vintage", vid, "legacy",
                     "Website has an expert quote with no score or vintage. It is kept in the legacy copy; attach it to a scored review if it should appear.",
                     "scores", "info")

            # provenance for factual fields (raw value preserved)
            for field, norm, raw in [
                ("vintage_text", vint, vint_raw),
                ("location_id", app_raw, w["appellation"]),
                ("region", region, w["region"]),
                ("grapes", w["grapes"], w["grapes"]),
                ("mevushal", mevushal, w["mevushal"]),
                ("supervision_display", sup_raw, w["supervision"]),
                ("special_designation", designation, w["appellation"]),
            ]:
                if raw or norm:
                    prov.append((uid("prov", vid, field), "wine_vintage", vid, field, norm, raw, SOURCE_ID,
                                 f"wines.json / wines/p/{slug}"))

    # supervision near-duplicates worth a human look (never auto-merged)
    names = {k: v["name"] for k, v in sup_auths.items()}
    for a, b in [("iku", "ikui"), ("badatz – beit yosef", "beit yosef chareidi")]:
        if a in names and b in names:
            flag("supervision_authority", sup_auths[a]["id"], "duplicate",
                 f"'{names[a]}' and '{names[b]}' may be the same authority. Confirm before merging.", "canonical_name")
    for c in critics_used:
        if c in UNCONFIRMED_CRITICS or c not in CRITICS:
            flag("critic", uid("critic", c.lower()), "missing",
                 f"Critic abbreviation '{c}' is not confirmed. Set the full critic or publication name.", "canonical_name")

    # ---------------- emit SQL ----------------
    def emit(table, cols, rows):
        if not rows:
            return
        sql.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n" +
                   ",\n".join("  (" + ", ".join(r) + ")" for r in rows) + ";\n")

    emit("locations", ["id", "parent_id", "type", "name", "slug"],
         [[q(i), q(p), q(t), q(n), q(slugify(n))] for (i, p, t, n) in locations.values()])

    emit("grapes", ["id", "canonical_name", "color"],
         [[q(i), q(n), q(GRAPE_COLOR.get(n))] for (i, n) in grapes.values()])

    crit_rows = []
    for c in sorted(critics_used | {k for k in CRITICS if k not in UNCONFIRMED_CRITICS}):
        short, pub, aliases = CRITICS.get(c, (None, None, []))
        crit_rows.append([q(uid("critic", c.lower())), q(c), q(short), q(pub), q(aliases)])
    emit("critics", ["id", "canonical_name", "short_label", "publication", "aliases"], crit_rows)

    emit("supervision_authorities", ["id", "canonical_name", "short_name", "display_name", "aliases"],
         [[q(v["id"]), q(v["name"]), q(v["name"] if len(v["name"]) <= 6 else None),
           q(SUPERVISION_SHORT.get(v["name"], v["name"])), q(sorted(v["aliases"]))] for v in sup_auths.values()])

    prod_rows = []
    for p in producers.values():
        ck = next(k for k in locations if k[1] == "country" and locations[k][3] in
                  (p["country"], "United States" if p["country"] == "USA" else p["country"]))
        primary = sorted(p["regions"], key=lambda k: str(k))[0] if len(p["regions"]) == 1 else ck
        prod_rows.append([q(p["id"]), q(p["name"]), q(slugify(p["name"])), q(locations[ck][0]), q(locations[primary][0])])
    emit("producers", ["id", "name", "slug", "country_location_id", "primary_location_id"], prod_rows)

    emit("wines", ["id", "producer_id", "canonical_name", "display_name", "slug", "category",
                   "primary_location_id", "default_designation", "website_slug"],
         [[q(x) for x in r] for r in wine_rows])

    emit("wine_vintages", ["id", "wine_id", "vintage_text", "status", "location_id", "mevushal",
                           "supervision_display", "special_designation", "tasting_note", "food_pairing",
                           "is_new", "legacy"],
         [[q(v["id"]), q(v["wine_id"]), q(v["vintage_text"]), q("needs_review"), q(v["location_id"]),
           q(v["mevushal"]), q(v["supervision_display"]), q(v["special_designation"]), q(v["tasting_note"]),
           q(v["food_pairing"]), q(v["is_new"]), q(v["legacy"])] for v in vintage_rows])

    emit("wine_grapes", ["wine_vintage_id", "grape_id", "percentage", "display_order"],
         [[q(a), q(b), q(c), q(d)] for (a, b, c, d) in wg_rows])
    emit("wine_supervision", ["wine_vintage_id", "authority_id", "display_order"],
         [[q(a), q(b), q(c)] for (a, b, c) in dict(((r[0], r[1]), r) for r in sup_rows).values()])
    emit("wine_scores", ["id", "wine_vintage_id", "critic_id", "score_text", "numeric_score", "score_low",
                         "score_high", "is_primary", "display_order", "raw_text", "source_id"],
         [[q(r[0]), q(r[1]), q(uid("critic", r[2].lower())), q(r[3]), q(r[4]), q(r[5]), q(r[6]), q(r[7]),
           q(r[8]), q(r[9]), q(SOURCE_ID)] for r in ws_rows])
    emit("field_provenance", ["id", "entity_type", "entity_id", "field_name", "normalized_value", "raw_value",
                              "source_id", "source_locator"],
         [[q(x) for x in r] for r in prov])
    emit("review_flags", ["id", "entity_type", "entity_id", "field_name", "flag_type", "severity", "message", "details"],
         [[q(r[0]), q(r[1]), q(r[2]), q(r[3]), q(r[4]), q(r[5]), q(r[6]), q(r[7])] for r in dict((f[0], f) for f in flags).values()])

    OUT.write_text("\n".join(sql), encoding="utf-8")
    print(f"producers={len(producers)} wines={len(wine_rows)} vintages={len(vintage_rows)} "
          f"locations={len(locations)} grapes={len(grapes)} scores={len(ws_rows)} "
          f"supervision={len(sup_auths)} flags={len(flags)} provenance={len(prov)}")


if __name__ == "__main__":
    main()
