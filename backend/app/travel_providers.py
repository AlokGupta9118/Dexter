"""
travel_providers.py - booking provider layer for travel_agent.py
================================================================
One interface, several back ends, chosen per kind (flight / hotel / train /
bus / activity) from environment variables:

    BOOKING_MODE        simulate (default) | sandbox | live
    DUFFEL_API_TOKEN    duffel_test_...  -> real API calls, TEST data (sandbox)
                        duffel_live_...  -> REAL tickets. Also needs
                                            BOOKING_MODE=live and ALLOW_LIVE_BOOKINGS=yes
    FLIGHT_PROVIDER     sim | duffel            (default: duffel if token + mode != simulate)
    HOTEL_PROVIDER      sim | duffel_stays      (same default rule; needs Duffel Stays enabled)
    TRAIN_PROVIDER      sim | assisted | <registered name>
    BUS_PROVIDER        sim | assisted | <registered name>
    OPERATOR_PAYS       yes  -> in LIVE mode the operator's Duffel balance pays and you
                               collect money from the traveller elsewhere.

What is REAL and what is not (be honest with your users):
  * Flights and stays: real search, live price re-check, real orders through Duffel.
    Verify field names against https://duffel.com/docs before going live; the
    sandbox token lets you test the whole flow without spending money.
  * Trains and buses: there is NO open public booking API for most operators
    (IRCTC, redBus, Trainline, FlixBus ... are partner-only). So the default is
    "assisted": distance-based estimates + official booking links; the agent
    hands the user over and can record the confirmation code afterwards.
    If you become a partner of an aggregator, implement a GroundProvider
    subclass and call register_provider("train", "myname", MyProvider()).
  * "sim" is clearly labelled sample data and never touches the network
    (except geocoding).
"""

from __future__ import annotations

import hashlib
import math
import os
import random
import re
import time
from datetime import date, datetime, time as dtime, timedelta
from functools import lru_cache
from typing import Any, Callable, Dict, List, Optional

import requests

BOOKING_MODE = os.getenv("BOOKING_MODE", "simulate").strip().lower()
KINDS = ("flight", "hotel", "train", "bus", "activity")

SIM_NOTE = ("SIMULATED sample data for planning only (distance-based estimate). "
            "Not live availability or prices; verify before relying on it.")


class ProviderError(Exception):
    """definitive=True  -> we know NOTHING was booked/charged (validation, 4xx).
    definitive=False -> outcome unknown (timeout, 5xx): never retry blindly."""

    def __init__(self, message: str, definitive: bool = True, code: Optional[str] = None):
        super().__init__(message)
        self.definitive = definitive
        self.code = code


# ------------------------------------------------------------
# shared helpers
# ------------------------------------------------------------

def http_json(url: str, params: dict, timeout: int = 12) -> dict:
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


@lru_cache(maxsize=256)
def geocode(city: str) -> Optional[dict]:
    try:
        data = http_json("https://geocoding-api.open-meteo.com/v1/search",
                         {"name": city.strip(), "count": 1, "language": "en"})
        res = (data.get("results") or [None])[0]
        if not res:
            return None
        return {"name": res["name"], "country": res.get("country", ""),
                "cc": res.get("country_code", ""),
                "lat": res["latitude"], "lon": res["longitude"]}
    except Exception:  # noqa: BLE001
        return None


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))


def seeded_rng(*parts) -> random.Random:
    digest = hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()
    return random.Random(int(digest[:12], 16))


def parse_date(value: str) -> date:
    return date.fromisoformat(str(value).strip())


def _epoch(iso: Optional[str]) -> Optional[float]:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _hours(iso_duration: Optional[str]) -> Optional[float]:
    m = re.match(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$", iso_duration or "")
    if not m:
        return None
    d, h, mi = (int(x or 0) for x in m.groups())
    return round(d * 24 + h + mi / 60, 1)


def _money(x: Any) -> float:
    return round(float(x), 2)


# ------------------------------------------------------------
# provider base class
# ------------------------------------------------------------

class BaseProvider:
    name = "base"
    live = False        # talks to a real supplier API
    sandbox = False     # real API but test data
    handoff = False     # cannot book in-app, user is sent to official links
    fallback_reason: Optional[str] = None

    def label(self) -> str:
        return self.name

    # searches (each returns {"source", "note", "offers": [...]})
    # offers carry public fields + private "_raw" (dict) and "_expires" (epoch);
    # the agent strips and stores the private ones.
    def search_flights(self, **kw) -> dict:
        raise ProviderError("Flight search not supported by this provider.")

    def search_stays(self, **kw) -> dict:
        raise ProviderError("Stay search not supported by this provider.")

    def search_ground(self, **kw) -> dict:
        raise ProviderError("Train/bus search not supported by this provider.")

    # lifecycle. `offer` = {"offer_id","kind","raw","price","currency","expires_at"}
    def revalidate(self, offer: dict) -> dict:
        return {"ok": True, "price": offer["price"], "currency": offer["currency"]}

    def book(self, kind: str, offer: dict, details: dict, passengers: List[dict],
             idem: str) -> dict:
        raise ProviderError("Booking not supported by this provider.")

    def cancel_preview(self, booking: dict) -> dict:
        raise ProviderError("Cancellation not supported by this provider.")

    def cancel(self, booking: dict, preview: dict) -> dict:
        raise ProviderError("Cancellation not supported by this provider.")

    def status(self, booking: dict) -> dict:
        return {"provider_status": booking.get("status")}


# ------------------------------------------------------------
# SIMULATED provider (all kinds)
# ------------------------------------------------------------

HSR_COUNTRIES = {"JP", "CN", "FR", "ES", "DE", "IT", "KR", "GB", "TW", "BE", "NL",
                 "CH", "AT", "SE", "TR", "MA"}
LOW_COST = {"IN", "TH", "VN", "ID", "PK", "BD", "LK", "NP", "PH", "EG", "MM", "KH",
            "LA", "MX", "CO", "PE", "BO", "MA", "TR"}
HIGH_COST = {"CH", "GB", "NO", "SE", "DK", "JP", "DE", "AT", "NL", "FR", "AU", "US",
             "CA", "IT", "FI", "IE", "SG"}


def _tier(cc: str) -> str:
    return "low" if cc in LOW_COST else "high" if cc in HIGH_COST else "mid"


class SimProvider(BaseProvider):
    name = "sim"

    def label(self) -> str:
        base = "simulated (sample data, nothing real is booked)"
        return f"{base}; fallback: {self.fallback_reason}" if self.fallback_reason else base

    # ---- flights ----
    def search_flights(self, origin, destination, depart_date, return_date=None,
                       passengers=1, cabin="economy", **_) -> dict:
        a, b = geocode(origin), geocode(destination)
        if not a or not b:
            return {"error": "Could not locate the origin or destination city."}
        km = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
        rng = seeded_rng(a["name"], b["name"], depart_date, return_date, cabin, passengers)
        mult = {"economy": 1.0, "premium_economy": 1.6, "business": 3.2, "first": 5.0}.get(cabin, 1.0)
        base = (45 + 0.075 * km) * mult
        legs = 2 if return_date else 1
        offers = []
        for label, stops, pm in [("cheapest", 1, 0.85), ("balanced", 1, 1.0),
                                 ("fastest", 0, 1.35), ("flexible_fare", 0, 1.55)]:
            if km < 700:
                stops = 0
            oid = "FL-" + hashlib.md5(
                f"{label}{a['name']}{b['name']}{depart_date}{return_date}{cabin}{passengers}".encode()
            ).hexdigest()[:6].upper()
            offers.append({
                "offer_id": oid, "type": label,
                "route": f"{a['name']} -> {b['name']}" + (" and back" if return_date else ""),
                "depart_date": depart_date, "return_date": return_date,
                "departure_time_local": f"{rng.choice([6, 8, 11, 14, 18, 21]):02d}:00",
                "stops_each_way": stops,
                "duration_hours": round(km / 800 + 0.6 + stops * 2.0, 1),
                "refundable": label == "flexible_fare", "cabin": cabin,
                "passengers": passengers,
                "price_total": round(base * pm * legs * passengers * rng.uniform(0.93, 1.07), 2),
                "currency": "USD", "distance_km": round(km),
                "_raw": {"passengers": passengers,
                         "refund_fraction": 1.0 if label == "flexible_fare" else 0.0},
                "_expires": time.time() + 1800,
            })
        return {"source": "SIMULATED", "note": SIM_NOTE, "offers": offers}

    # ---- stays ----
    def search_stays(self, city, check_in, check_out, guests=2, max_price=None, **_) -> dict:
        g = geocode(city)
        if not g:
            return {"error": "Could not locate that city."}
        nights = max((parse_date(check_out) - parse_date(check_in)).days, 1)
        rng = seeded_rng(g["name"], check_in, check_out, guests)
        factor = rng.uniform(0.8, 1.4)
        tiers = [("budget", 45, "near station"), ("mid-range", 95, "city centre"),
                 ("upscale", 190, "old town / best area"), ("luxury", 380, "prime location")]
        offers = []
        for tier, base, area in tiers:
            per_night = round(base * factor * rng.uniform(0.9, 1.1) * (1 + 0.35 * max(guests - 2, 0)), 2)
            if max_price and per_night > max_price:
                continue
            free = tier in ("mid-range", "upscale")
            offers.append({
                "offer_id": "HT-" + hashlib.md5(
                    f"{tier}{g['name']}{check_in}{check_out}{guests}".encode()).hexdigest()[:6].upper(),
                "name": f"[Sample] {tier.title()} stay, {area}", "city": g["name"],
                "tier": tier, "area": area, "check_in": check_in, "check_out": check_out,
                "nights": nights, "guests": guests, "price_per_night": per_night,
                "price_total": round(per_night * nights, 2), "currency": "USD",
                "free_cancellation": free,
                "_raw": {"guests": guests, "refund_fraction": 1.0 if free else 0.0},
                "_expires": time.time() + 1800,
            })
        return {"source": "SIMULATED", "note": SIM_NOTE, "offers": offers}

    # ---- trains and buses ----
    def search_ground(self, kind, origin, destination, date_str, passengers=1,
                      travel_class=None, **_) -> dict:
        a, b = geocode(origin), geocode(destination)
        if not a or not b:
            return {"error": "Could not locate the origin or destination city."}
        if a["name"] == b["name"] and a["cc"] == b["cc"]:
            return {"error": "Origin and destination are the same place."}
        try:
            d = parse_date(date_str)
        except ValueError:
            return {"error": "Date must be YYYY-MM-DD."}
        straight = haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
        km = straight * (1.25 if kind == "train" else 1.35)
        limit = 2800 if kind == "train" else 1600
        if km > limit:
            return {"error": f"About {round(km)} km by {kind}: not a practical journey. "
                             "Compare flights instead."}
        rng = seeded_rng(kind, a["name"], b["name"], date_str, passengers)
        tier = _tier(a["cc"])
        offers = (self._train_offers if kind == "train" else self._bus_offers)(
            a, b, km, d, passengers, travel_class, rng, tier)
        if not offers:
            return {"error": f"No {kind} option matched class '{travel_class}'."}
        return {"source": "SIMULATED", "note": SIM_NOTE + " Timetables are not real; "
                "times are local and approximate.", "distance_km_by_road_or_rail": round(km),
                "offers": offers}

    def _make_ground(self, prefix, kind, a, b, d, pax, dep, dur_h, label, cls, price, rng,
                     extra=None) -> dict:
        arr = dep + timedelta(hours=dur_h)
        oid = prefix + hashlib.md5(
            f"{kind}{a['name']}{b['name']}{dep.isoformat()}{label}{cls}{pax}".encode()
        ).hexdigest()[:6].upper()
        o = {"offer_id": oid, "mode": kind, "route": f"{a['name']} -> {b['name']}",
             "service": label, "class": cls,
             "departs": dep.strftime("%Y-%m-%d %H:%M"), "arrives": arr.strftime("%Y-%m-%d %H:%M"),
             "duration_hours": round(dur_h, 1), "passengers": pax,
             "seats_left": rng.randint(2, 40), "price_total": round(price, 2),
             "currency": "USD", "refundable": True,
             "_raw": {"passengers": pax, "refund_fraction": 0.75},
             "_expires": time.time() + 1800}
        if extra:
            o.update(extra)
        return o

    def _train_offers(self, a, b, km, d, pax, want_cls, rng, tier):
        per_km = {"low": 0.02, "mid": 0.08, "high": 0.17}[tier]
        services = [("Express", 62 if tier == "low" else 90, 1.0)]
        if a["cc"] == b["cc"] and a["cc"] in HSR_COUNTRIES and 120 <= km <= 1600:
            services.append(("High-speed", 230, 2.3))
        classes = ([("sleeper", 0.4), ("3A", 1.0), ("2A", 1.5), ("1A", 2.5)]
                   if a["cc"] == "IN" else [("standard", 1.0), ("first", 1.6)])
        if want_cls:
            classes = [c for c in classes if c[0].lower() == want_cls.lower()]
        offers = []
        for label, speed, smult in services:
            dur = km / speed + 0.3
            for h in rng.sample([5, 7, 9, 12, 15, 18, 20, 22], 2):
                dep = datetime.combine(d, dtime(h, rng.choice([0, 15, 30, 45])))
                for cls, cm in classes:
                    price = per_km * km * smult * cm * pax * rng.uniform(0.95, 1.05)
                    offers.append(self._make_ground("TR-", "train", a, b, d, pax, dep, dur,
                                                    label, cls, price, rng))
        offers.sort(key=lambda o: (o["departs"], o["price_total"]))
        return offers[:8]

    def _bus_offers(self, a, b, km, d, pax, want_cls, rng, tier):
        per_km = {"low": 0.017, "mid": 0.05, "high": 0.07}[tier]
        speed = 48 if tier == "low" else 62
        types = [("seater", 1.0), ("ac_seater", 1.35)] + ([("sleeper", 1.7)] if km >= 350 else [])
        if want_cls:
            types = [t for t in types if t[0].lower() == want_cls.lower()]
        offers = []
        dur = km / speed + 0.5 * (km // 250)
        for h in rng.sample([6, 9, 13, 17, 20, 22], 3):
            dep = datetime.combine(d, dtime(h, rng.choice([0, 30])))
            for cls, tm in types:
                if cls == "sleeper" and h < 17:
                    continue
                price = per_km * km * tm * pax * rng.uniform(0.95, 1.05)
                offers.append(self._make_ground("BS-", "bus", a, b, d, pax, dep, dur,
                                                "Coach", cls, price, rng))
        offers.sort(key=lambda o: (o["departs"], o["price_total"]))
        return offers[:8]

    # ---- lifecycle ----
    def book(self, kind, offer, details, passengers, idem) -> dict:
        return {"provider_ref": None, "provider_order_id": None,
                "status": "CONFIRMED_SIMULATED",
                "meta": {"refund_fraction": offer["raw"].get("refund_fraction", 0.0)}}

    def cancel_preview(self, booking) -> dict:
        frac = float((booking.get("meta") or {}).get("refund_fraction", 0.0))
        total = float(booking.get("total_price") or 0)
        return {"refund_amount": round(total * frac, 2), "currency": booking.get("currency"),
                "note": "Simulated refund rule."}

    def cancel(self, booking, preview) -> dict:
        return {"status": "CANCELLED_SIMULATED", "refund_amount": preview.get("refund_amount"),
                "currency": preview.get("currency")}


# ------------------------------------------------------------
# ASSISTED ground provider: estimates + official links, hand-off
# ------------------------------------------------------------

GROUND_LINKS = {
    "train": {
        "IN": [("IRCTC (official)", "https://www.irctc.co.in/nget/train-search")],
        "GB": [("Trainline", "https://www.thetrainline.com/")],
        "default": [("Omio", "https://www.omio.com/"), ("Trainline", "https://www.thetrainline.com/"),
                    ("12Go Asia", "https://12go.asia/")],
    },
    "bus": {
        "IN": [("redBus", "https://www.redbus.in/")],
        "default": [("FlixBus", "https://www.flixbus.com/"), ("Omio", "https://www.omio.com/"),
                    ("12Go Asia", "https://12go.asia/")],
    },
}


class AssistedGround(SimProvider):
    """Honest default for trains/buses without a partner API: realistic
    estimates plus official booking links. The agent never claims a booking."""
    name = "assisted"
    handoff = True

    def label(self) -> str:
        return "assisted (estimates + official booking links; booking happens on their site)"

    def search_ground(self, kind, origin, destination, date_str, passengers=1,
                      travel_class=None, **kw) -> dict:
        res = super().search_ground(kind, origin, destination, date_str, passengers,
                                    travel_class, **kw)
        if "error" in res:
            return res
        a = geocode(origin) or {}
        table = GROUND_LINKS[kind]
        links = [{"name": n, "url": u} for n, u in table.get(a.get("cc", ""), table["default"])]
        res["source"] = "ESTIMATE"
        res["note"] = ("ESTIMATED fares/times from distance, NOT a live timetable. Seats, exact "
                       "times and prices must be checked and booked on the official sites below.")
        res["booking_links"] = links
        for o in res["offers"]:
            o["_raw"]["links"] = links
        return res


# ------------------------------------------------------------
# DUFFEL (real flights + stays)
# ------------------------------------------------------------

class DuffelClient:
    BASE = "https://api.duffel.com"

    def __init__(self, token: str, timeout: int = 30):
        self.token = token
        self.timeout = timeout
        self.sandbox = token.startswith("duffel_test")
        if not self.sandbox and not (BOOKING_MODE == "live"
                                     and os.getenv("ALLOW_LIVE_BOOKINGS", "").lower() == "yes"):
            raise RuntimeError("Live Duffel token refused: set BOOKING_MODE=live and "
                               "ALLOW_LIVE_BOOKINGS=yes to enable real bookings.")

    @classmethod
    def from_env(cls) -> "DuffelClient":
        token = os.getenv("DUFFEL_API_TOKEN", "").strip()
        if not token:
            raise RuntimeError("DUFFEL_API_TOKEN is not set.")
        return cls(token)

    def request(self, method: str, path: str, params: dict = None, body: dict = None):
        headers = {"Authorization": f"Bearer {self.token}", "Duffel-Version": "v2",
                   "Accept": "application/json", "Content-Type": "application/json"}
        try:
            r = requests.request(method, self.BASE + path, headers=headers, params=params,
                                 json=body, timeout=self.timeout)
        except requests.RequestException as e:
            raise ProviderError(f"Network error talking to Duffel: {e}",
                                definitive=(method == "GET"))
        if r.status_code >= 400:
            try:
                errs = r.json().get("errors") or []
                msg = "; ".join(e.get("message", "") for e in errs) or r.text[:200]
                code = errs[0].get("code") if errs else None
            except ValueError:
                msg, code = r.text[:200], None
            raise ProviderError(f"Duffel {r.status_code}: {msg}",
                                definitive=r.status_code < 500, code=code)
        try:
            return r.json().get("data")
        except ValueError:
            raise ProviderError("Duffel returned a non-JSON response.", definitive=False)


def _passenger_payload(p: dict, pid: str) -> dict:
    gender = (p.get("gender") or "m").lower()[:1]
    title = (p.get("title") or ("mr" if gender == "m" else "ms")).lower()
    return {"id": pid, "title": title, "gender": gender,
            "given_name": p["given_name"], "family_name": p["family_name"],
            "born_on": p["born_on"], "email": p["email"], "phone_number": p["phone"]}


class DuffelFlights(BaseProvider):
    name = "duffel"
    live = True

    def __init__(self, client: DuffelClient):
        self.c = client
        self.sandbox = client.sandbox

    def label(self) -> str:
        return "Duffel flights " + ("SANDBOX (test data, no real tickets)" if self.sandbox
                                    else "LIVE (real tickets)")

    @lru_cache(maxsize=128)
    def _place(self, query: str) -> str:
        q = query.strip()
        if re.fullmatch(r"[A-Za-z]{3}", q):
            return q.upper()
        data = self.c.request("GET", "/places/suggestions", params={"query": q}) or []
        for p in data:
            if p.get("iata_code"):
                return p["iata_code"]
        raise ProviderError(f"No airport found for '{query}'. Try an airport code like NAG.")

    def search_flights(self, origin, destination, depart_date, return_date=None,
                       passengers=1, cabin="economy", **_) -> dict:
        o, d = self._place(origin), self._place(destination)
        slices = [{"origin": o, "destination": d, "departure_date": depart_date}]
        if return_date:
            slices.append({"origin": d, "destination": o, "departure_date": return_date})
        body = {"data": {"slices": slices, "cabin_class": cabin,
                         "passengers": [{"type": "adult"} for _ in range(passengers)]}}
        req = self.c.request("POST", "/air/offer_requests",
                             params={"return_offers": "true", "supplier_timeout": 15000},
                             body=body)
        raw_offers = (req or {}).get("offers") or []
        if not raw_offers:
            return {"error": f"No flights found {o} -> {d} on {depart_date}."}

        def total_hours(of):
            return sum(_hours(s.get("duration")) or 0 for s in of["slices"])

        def stops(of):
            return sum(len(s["segments"]) - 1 for s in of["slices"])

        by_price = sorted(raw_offers, key=lambda x: float(x["total_amount"]))
        picks: Dict[str, str] = {}
        for tag, ranked in (("cheapest", by_price),
                            ("fastest", sorted(raw_offers, key=total_hours)),
                            ("fewest_stops", sorted(raw_offers, key=lambda x: (stops(x), float(x["total_amount"]))))):
            picks.setdefault(ranked[0]["id"], tag)
        for of in by_price:
            if len(picks) >= 6:
                break
            picks.setdefault(of["id"], "alternative")
        offers = []
        for of in raw_offers:
            if of["id"] not in picks:
                continue
            cond = of.get("conditions") or {}
            refund = cond.get("refund_before_departure") or {}
            change = cond.get("change_before_departure") or {}
            sl = []
            for s in of["slices"]:
                segs = s["segments"]
                sl.append({
                    "from": s["origin"]["iata_code"], "to": s["destination"]["iata_code"],
                    "departs": segs[0]["departing_at"], "arrives": segs[-1]["arriving_at"],
                    "duration_hours": _hours(s.get("duration")), "stops": len(segs) - 1,
                    "flights": [f"{g['marketing_carrier']['iata_code']}"
                                f"{g['marketing_carrier_flight_number']}" for g in segs]})
            offers.append({
                "offer_id": of["id"], "type": picks[of["id"]],
                "airline": (of.get("owner") or {}).get("name"), "slices": sl,
                "duration_hours": sl[0]["duration_hours"], "cabin": cabin,
                "passengers": passengers, "price_total": _money(of["total_amount"]),
                "currency": of["total_currency"],
                "refundable": bool(refund.get("allowed")),
                "refund_penalty": refund.get("penalty_amount"),
                "changeable": bool(change.get("allowed")),
                "change_penalty": change.get("penalty_amount"),
                "offer_valid_until": of.get("expires_at"),
                "_raw": {"passengers": passengers, "origin": o, "destination": d,
                         "identity_docs_required": bool(of.get("passenger_identity_documents_required")),
                         "refund_allowed": bool(refund.get("allowed"))},
                "_expires": _epoch(of.get("expires_at")) or time.time() + 600})
        offers.sort(key=lambda x: x["price_total"])
        return {"source": "LIVE" if not self.sandbox else "SANDBOX (test data)",
                "note": ("Live Duffel offers; prices can change and offers expire within minutes."
                         if not self.sandbox else
                         "Duffel SANDBOX test data: realistic structure, fake inventory."),
                "offers": offers}

    def revalidate(self, offer) -> dict:
        try:
            live = self.c.request("GET", f"/air/offers/{offer['offer_id']}")
        except ProviderError as e:
            return {"ok": False, "reason": f"Offer no longer available ({e}). Search again."}
        return {"ok": True, "price": _money(live["total_amount"]),
                "currency": live["total_currency"]}

    def book(self, kind, offer, details, passengers, idem) -> dict:
        live = self.c.request("GET", f"/air/offers/{offer['offer_id']}")
        if live.get("passenger_identity_documents_required"):
            raise ProviderError("This fare requires a passport/ID document, which this app never "
                                "collects. Complete this booking on the airline's website.")
        pax_ids = [p["id"] for p in live["passengers"]]
        if len(pax_ids) != len(passengers):
            raise ProviderError(f"Offer is for {len(pax_ids)} passenger(s) but "
                                f"{len(passengers)} were given.")
        body = {"data": {
            "type": "instant", "selected_offers": [live["id"]],
            "payments": [{"type": "balance", "currency": live["total_currency"],
                          "amount": live["total_amount"]}],
            "passengers": [_passenger_payload(p, pid) for p, pid in zip(passengers, pax_ids)],
            "metadata": {"idem": idem[:40]}}}
        order = self.c.request("POST", "/air/orders", body=body)
        return {"provider_ref": order.get("booking_reference"), "provider_order_id": order["id"],
                "status": "CONFIRMED_SANDBOX" if self.sandbox else "CONFIRMED",
                "meta": {"documents": order.get("documents"),
                         "refund_allowed": offer["raw"].get("refund_allowed")}}

    def cancel_preview(self, booking) -> dict:
        oid = booking.get("provider_order_id")
        if not oid:
            raise ProviderError("Booking has no provider order id.")
        c = self.c.request("POST", "/air/order_cancellations", body={"data": {"order_id": oid}})
        return {"cancellation_id": c["id"], "refund_amount": _money(c.get("refund_amount") or 0),
                "currency": c.get("refund_currency")}

    def cancel(self, booking, preview) -> dict:
        self.c.request("POST", f"/air/order_cancellations/{preview['cancellation_id']}/actions/confirm")
        return {"status": "CANCELLED", "refund_amount": preview.get("refund_amount"),
                "currency": preview.get("currency")}

    def status(self, booking) -> dict:
        oid = booking.get("provider_order_id")
        if not oid:
            return {"provider_status": booking.get("status")}
        o = self.c.request("GET", f"/air/orders/{oid}")
        return {"provider_status": "CANCELLED" if o.get("cancelled_at") else "ACTIVE",
                "booking_reference": o.get("booking_reference"),
                "airline_initiated_changes": o.get("airline_initiated_changes") or [],
                "documents": len(o.get("documents") or [])}


def _free_cancel_until(timeline: list, total: float) -> Optional[str]:
    for t in timeline or []:
        try:
            if float(t.get("refund_amount", 0)) >= total - 0.01:
                return t.get("before")
        except (TypeError, ValueError):
            continue
    return None


def _stay_refund_now(timeline: list) -> float:
    now = time.time()
    for t in timeline or []:
        ts = _epoch(t.get("before"))
        if ts and ts > now:
            try:
                return float(t.get("refund_amount", 0))
            except (TypeError, ValueError):
                return 0.0
    return 0.0


class DuffelStays(BaseProvider):
    """Needs Duffel Stays enabled on your account; verify fields in the docs."""
    name = "duffel_stays"
    live = True

    def __init__(self, client: DuffelClient):
        self.c = client
        self.sandbox = client.sandbox

    def label(self) -> str:
        return "Duffel stays " + ("SANDBOX (test data)" if self.sandbox else "LIVE (real bookings)")

    def search_stays(self, city, check_in, check_out, guests=2, max_price=None, **_) -> dict:
        g = geocode(city)
        if not g:
            return {"error": "Could not locate that city."}
        nights = max((parse_date(check_out) - parse_date(check_in)).days, 1)
        body = {"data": {"rooms": 1, "check_in_date": check_in, "check_out_date": check_out,
                         "guests": [{"type": "adult"} for _ in range(guests)],
                         "location": {"radius": 8, "geographic_coordinates": {
                             "latitude": g["lat"], "longitude": g["lon"]}}}}
        data = self.c.request("POST", "/stays/search", body=body) or {}
        results = data.get("results") or []
        if not results:
            return {"error": f"No stays found in {city} for those dates."}

        def price(r):
            return float(r.get("cheapest_rate_total_amount") or 1e12)

        cheap = sorted(results, key=price)[:3]
        rated = sorted(results, key=lambda r: -(r.get("accommodation", {}).get("rating") or 0))[:3]
        chosen, seen = [], set()
        for r in cheap + rated:
            if r["id"] not in seen:
                seen.add(r["id"])
                chosen.append(r)
        offers = []
        for r in chosen:
            acc = r.get("accommodation") or {}
            try:
                rates_data = self.c.request(
                    "GET", f"/stays/search_results/{r['id']}/actions/fetch_all_rates")
                rates = [rt for room in (rates_data.get("accommodation") or {}).get("rooms", [])
                         for rt in room.get("rates", [])]
                rate = min(rates, key=lambda x: float(x["total_amount"]))
            except (ProviderError, ValueError, KeyError):
                continue
            total = _money(rate["total_amount"])
            per_night = round(total / nights, 2)
            if max_price and rate.get("total_currency") == "USD" and per_night > max_price:
                continue
            timeline = rate.get("cancellation_timeline") or []
            addr = (acc.get("location") or {}).get("address") or {}
            offers.append({
                "offer_id": rate["id"], "name": acc.get("name"), "city": g["name"],
                "area": addr.get("line_one") or addr.get("city_name"),
                "rating": acc.get("rating"), "review_score": acc.get("review_score"),
                "check_in": check_in, "check_out": check_out, "nights": nights, "guests": guests,
                "board": rate.get("board_type"), "payment_type": rate.get("payment_type"),
                "price_per_night": per_night, "price_total": total,
                "currency": rate.get("total_currency"),
                "free_cancellation_until": _free_cancel_until(timeline, total),
                "_raw": {"guests": guests, "rate_id": rate["id"], "timeline": timeline},
                "_expires": time.time() + 900})
        if not offers:
            return {"error": "No bookable rates found. Try other dates or a higher budget."}
        offers.sort(key=lambda x: x["price_total"])
        return {"source": "LIVE" if not self.sandbox else "SANDBOX (test data)",
                "note": "Rates can change; the app re-quotes before booking.", "offers": offers}

    def revalidate(self, offer) -> dict:
        try:
            q = self.c.request("POST", "/stays/quotes",
                               body={"data": {"rate_id": offer["raw"]["rate_id"]}})
        except ProviderError as e:
            return {"ok": False, "reason": f"Rate no longer available ({e}). Search again."}
        return {"ok": True, "price": _money(q["total_amount"]), "currency": q["total_currency"]}

    def book(self, kind, offer, details, passengers, idem) -> dict:
        q = self.c.request("POST", "/stays/quotes",
                           body={"data": {"rate_id": offer["raw"]["rate_id"]}})
        if _money(q["total_amount"]) > offer["price"] * 1.01 + 0.01:
            raise ProviderError("Price changed since the search.", definitive=True,
                                code="price_changed")
        lead = passengers[0]
        body = {"data": {"quote_id": q["id"], "email": lead["email"], "phone_number": lead["phone"],
                         "guests": [{"given_name": p["given_name"], "family_name": p["family_name"]}
                                    for p in passengers],
                         "metadata": {"idem": idem[:40]}}}
        b = self.c.request("POST", "/stays/bookings", body=body)
        return {"provider_ref": b.get("reference"), "provider_order_id": b["id"],
                "status": "CONFIRMED_SANDBOX" if self.sandbox else "CONFIRMED",
                "meta": {"timeline": offer["raw"].get("timeline")}}

    def cancel_preview(self, booking) -> dict:
        meta = booking.get("meta") or {}
        return {"refund_amount": round(_stay_refund_now(meta.get("timeline")), 2),
                "currency": booking.get("currency"),
                "note": "Refund according to the rate's cancellation timeline."}

    def cancel(self, booking, preview) -> dict:
        oid = booking.get("provider_order_id")
        if not oid:
            raise ProviderError("Booking has no provider id.")
        r = self.c.request("POST", f"/stays/bookings/{oid}/actions/cancel") or {}
        return {"status": "CANCELLED", "refund_amount": r.get("refund_amount",
                                                              preview.get("refund_amount")),
                "currency": preview.get("currency")}

    def status(self, booking) -> dict:
        oid = booking.get("provider_order_id")
        if not oid:
            return {"provider_status": booking.get("status")}
        b = self.c.request("GET", f"/stays/bookings/{oid}") or {}
        return {"provider_status": b.get("status"), "reference": b.get("reference")}


# ------------------------------------------------------------
# registry
# ------------------------------------------------------------

_REGISTRY: Dict[tuple, BaseProvider] = {}
_CACHE: Dict[str, BaseProvider] = {}


def register_provider(kind: str, name: str, provider: BaseProvider) -> None:
    """Plug in your own back end, then set e.g. TRAIN_PROVIDER=<name>."""
    _REGISTRY[(kind, name.lower())] = provider
    _CACHE.pop(kind, None)


def _default_name(kind: str) -> str:
    token = os.getenv("DUFFEL_API_TOKEN")
    if BOOKING_MODE != "simulate":
        if kind == "flight" and token:
            return "duffel"
        if kind == "hotel" and token:
            return "duffel_stays"
        if kind in ("train", "bus"):
            return "assisted"
    return "sim"


def _build(kind: str, name: str) -> BaseProvider:
    if (kind, name) in _REGISTRY:
        return _REGISTRY[(kind, name)]
    if name == "sim":
        return SimProvider()
    if name == "assisted" and kind in ("train", "bus"):
        return AssistedGround()
    if name == "duffel" and kind == "flight":
        return DuffelFlights(DuffelClient.from_env())
    if name == "duffel_stays" and kind == "hotel":
        return DuffelStays(DuffelClient.from_env())
    raise RuntimeError(f"Unknown provider '{name}' for {kind}.")


def get_provider(kind: str) -> BaseProvider:
    if kind in _CACHE:
        return _CACHE[kind]
    name = os.getenv(f"{kind.upper()}_PROVIDER", "").strip().lower() or _default_name(kind)
    try:
        prov = _build(kind, name)
    except Exception as e:  # noqa: BLE001
        prov = SimProvider()
        prov.fallback_reason = f"{name} unavailable: {e}"[:200]
        print(f"[providers] {kind}: {prov.fallback_reason}")
    if kind == "activity" and BOOKING_MODE == "live":
        prov = AssistedGround()  # activities have no live provider: never fake a booking
        prov.name = "assisted"
    _CACHE[kind] = prov
    return prov


def provider_status() -> Dict[str, str]:
    return {k: get_provider(k).label() for k in KINDS}


# ------------------------------------------------------------
# payment hook (LIVE mode only)
# ------------------------------------------------------------

PAYMENT_HOOK: Optional[Callable[[str, dict], dict]] = None


def set_payment_hook(fn: Callable[[str, dict], dict]) -> None:
    """fn(action, payload) -> dict.
        action 'charge': payload = booking details; return {'ok': bool, 'ref': str}
        action 'refund': payload = {'charge': <ref>}; best effort.
    Wire Stripe/Razorpay here. Called BEFORE the supplier order is placed."""
    global PAYMENT_HOOK
    PAYMENT_HOOK = fn
