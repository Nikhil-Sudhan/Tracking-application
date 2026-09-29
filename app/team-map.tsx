"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import {
  initials,
  status,
  type Employee,
  type Point,
  type Geofence,
} from "@/lib/model";
import "leaflet/dist/leaflet.css";
export default function TeamMap({
  employees,
  selected,
  onSelect,
  points,
  now,
  geofences = [],
  onPick,
}: {
  employees: Employee[];
  selected: string | null;
  onSelect: (id: string) => void;
  points: Point[];
  now: number;
  geofences?: Geofence[];
  onPick?: (lat: number, lng: number) => void;
}) {
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  const viewport = useRef("");
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    layer = useRef<Leaflet.LayerGroup | null>(null),
    lib = useRef<typeof Leaflet | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      lib.current = L;
      const m = L.map(container.current, { zoomControl: false }).setView(
        [20.5937, 78.9629],
        5,
      );
      map.current = m;
      m.on("click", (e) => pick.current?.(e.latlng.lat, e.latlng.lng));
      L.control.zoom({ position: "bottomright" }).addTo(m);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      observer = new ResizeObserver(() => m.invalidateSize());
      observer.observe(container.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current,
      L = lib.current,
      g = layer.current;
    if (!ready || !m || !L || !g) return;
    g.clearLayers();
    geofences.forEach((site) => {
      const label = document.createElement("span");
      label.textContent = site.name + " · " + site.radius + " m";
      L.circle([site.lat, site.lng], {
        radius: site.radius,
        color: "#17694f",
        weight: 2,
        fillOpacity: 0.12,
      })
        .bindTooltip(label)
        .addTo(g);
    });
    const located = employees.filter((e) => e.lat !== null && e.lng !== null);
    located.forEach((e) => {
      const state = status(e, now);
      const el = document.createElement("button");
      el.className = "person-marker" + (e.id === selected ? " chosen" : "");
      el.style.setProperty(
        "--avatar",
        state === "Location stale"
          ? "#a67c39"
          : state === "Off duty"
            ? "#88949c"
            : e.color,
      );
      el.title = e.name + " · " + state;
      el.textContent = initials(e.name);
      el.setAttribute("aria-label", "Locate " + e.name);
      el.addEventListener("click", () => onSelect(e.id));
      L.marker([e.lat!, e.lng!], {
        keyboard: false,
        icon: L.divIcon({
          html: el,
          className: "map-pin",
          iconSize: [42, 46],
          iconAnchor: [21, 46],
        }),
      }).addTo(g);
    });
    const employee = located.find((e) => e.id === selected);
    const viewKey =
      selected +
      ":" +
      points.length +
      ":" +
      geofences.map((s) => s.id + s.lat + s.lng + s.radius).join(",") +
      ":" +
      located.map((e) => e.id).join(",");
    if (points.length > 1) {
      const route = L.polyline(
        points.map((p) => [p.lat, p.lng]),
        { color: "#2a6df4", weight: 4, dashArray: "8 6" },
      ).addTo(g);
      if (viewport.current !== viewKey)
        m.fitBounds(route.getBounds(), { padding: [55, 55] });
    } else if (employee) {
      if (viewport.current !== viewKey)
        m.setView([employee.lat!, employee.lng!], 15);
    } else if (located.length && viewport.current !== viewKey) {
      m.fitBounds(L.latLngBounds(located.map((e) => [e.lat!, e.lng!])), {
        padding: [65, 65],
        maxZoom: 14,
      });
    } else if (geofences.length && viewport.current !== viewKey) {
      const bounds = L.latLngBounds(geofences.map((s) => [s.lat, s.lng]));
      geofences.forEach((s) =>
        bounds.extend(L.latLng(s.lat, s.lng).toBounds(s.radius * 2)),
      );
      m.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
    }
    viewport.current = viewKey;
  }, [ready, employees, selected, onSelect, points, now, geofences]);
  return (
    <div
      ref={container}
      className="team-map"
      aria-label="Employee locations map"
    />
  );
}
