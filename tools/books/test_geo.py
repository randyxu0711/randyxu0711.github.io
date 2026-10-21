import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
AUTHORS = yaml.safe_load((ROOT / "_data/authors.yml").read_text(encoding="utf-8"))
GEO = yaml.safe_load((ROOT / "_data/geo.yml").read_text(encoding="utf-8"))
BOOKS = json.loads((ROOT / "_data/books.json").read_text(encoding="utf-8"))
ATLAS = json.loads((ROOT / "assets/vendor/world-atlas/countries-110m.json").read_text(encoding="utf-8"))


def test_every_author_resolves_to_a_geo_country():
    for name, a in AUTHORS.items():
        if "counts_as" in a:
            target = AUTHORS.get(a["counts_as"])
            assert target and "literature" in target, name
        else:
            assert a.get("literature") in GEO["countries"], name


def test_authors_carry_no_region_fields():
    for name, a in AUTHORS.items():
        assert not {"continent", "subregion"} & a.keys(), name


def test_every_country_has_subregion_and_continent():
    for name, c in GEO["countries"].items():
        sub = GEO["subregions"].get(c.get("subregion"))
        assert sub, name
        assert sub.get("continent") in GEO["continents"], name


def test_every_country_matches_world_atlas_name():
    names = {g["properties"]["name"] for g in ATLAS["objects"]["countries"]["geometries"]}
    for name, c in GEO["countries"].items():
        assert c.get("topo", name) in names, name


def test_every_country_has_zh_and_valid_anchor():
    for name, c in GEO["countries"].items():
        assert c.get("zh"), name
        lon, lat = c["at"]
        assert -180 <= lon <= 180 and -90 <= lat <= 90, name


def test_csv_books_have_known_authors():
    missing = {b["author"] for b in BOOKS if "issue" not in b and b["author"] not in AUTHORS}
    assert not missing
