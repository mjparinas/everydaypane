// Illustrative wall-dashboard frames used as homepage "screenshots". Drawn in CSS so the marketing page stays light
// and we are not shipping huge photo assets until real captures land.
import type { ReactNode } from "react";

type Variant = "morning" | "family" | "commute" | "photos" | "night";

const TITLES: Record<Variant, string> = {
  morning: "Morning view — clocks, weather and today's plan",
  family: "Family view — chores, meals and the shopping list",
  commute: "Leaving soon — TransLink, traffic and the next ferry",
  photos: "Photos as the backdrop, widgets on top",
  night: "Night mode — dimmed and quiet",
};

export function PaneMock({ variant, className = "" }: { variant: Variant; className?: string }) {
  return (
    <figure className={`pane-mock ${className}`}>
      <div className={`pane-bezel pane-${variant}`} role="img" aria-label={TITLES[variant]}>
        <div className="pane-chrome">
          <span />
          <span />
          <span />
        </div>
        {variant === "morning" && <Morning />}
        {variant === "family" && <Family />}
        {variant === "commute" && <Commute />}
        {variant === "photos" && <Photos />}
        {variant === "night" && <Night />}
      </div>
      <figcaption className="mt-3 text-center text-sm text-soft">{TITLES[variant]}</figcaption>
    </figure>
  );
}

function Tile({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`pane-tile ${className}`}>{children}</div>;
}

function Morning() {
  return (
    <div className="pane-grid pane-grid-morning">
      <Tile className="span-2 pane-clock">
        <p className="pane-kicker">Vancouver</p>
        <p className="pane-time">7:42</p>
        <p className="pane-sub">Monday · Nov 23</p>
      </Tile>
      <Tile>
        <p className="pane-kicker">Toronto</p>
        <p className="pane-time-sm">10:42</p>
      </Tile>
      <Tile className="span-2 pane-weather">
        <p className="pane-kicker">Langley</p>
        <p className="pane-big">
          8° <span aria-hidden>⛅</span>
        </p>
        <p className="pane-sub">UV 2 · Pollen low · AQHI 2</p>
      </Tile>
      <Tile className="span-3 pane-agenda">
        <p className="pane-kicker">Today</p>
        <ul>
          <li>
            <b>8:15</b> School drop-off
          </li>
          <li>
            <b>12:00</b> Lunch — leftovers
          </li>
          <li>
            <b>17:30</b> Swim practice
          </li>
        </ul>
      </Tile>
      <Tile>
        <p className="pane-kicker">Garbage</p>
        <p className="pane-big-sm">Thu</p>
        <p className="pane-sub">Organics + recycling</p>
      </Tile>
    </div>
  );
}

function Family() {
  return (
    <div className="pane-grid pane-grid-family">
      <Tile className="span-2">
        <p className="pane-kicker">Chores · this week</p>
        <ul className="pane-checks">
          <li className="done">Make bed — Alex ★</li>
          <li>Unload dishwasher — Sam</li>
          <li className="done">Feed the dog — Alex ★</li>
        </ul>
      </Tile>
      <Tile>
        <p className="pane-kicker">Stars</p>
        <p className="pane-big-sm">12 / 15</p>
        <p className="pane-sub">Weekly goal</p>
      </Tile>
      <Tile className="span-2">
        <p className="pane-kicker">Dinner</p>
        <p className="pane-big-sm">Sheet-pan salmon</p>
        <p className="pane-sub">Tomorrow · Tacos</p>
      </Tile>
      <Tile>
        <p className="pane-kicker">Shopping</p>
        <ul className="pane-checks">
          <li>Milk</li>
          <li className="done">Eggs</li>
          <li>Berries</li>
        </ul>
      </Tile>
    </div>
  );
}

function Commute() {
  return (
    <div className="pane-grid pane-grid-commute">
      <Tile className="span-2">
        <p className="pane-kicker">501 → Surrey Central</p>
        <p className="pane-big-sm">6 min</p>
        <p className="pane-sub">Next · 12 min · 19 min</p>
      </Tile>
      <Tile>
        <p className="pane-kicker">Drive · work</p>
        <p className="pane-big-sm">28 min</p>
        <p className="pane-sub">Leave by 7:52</p>
      </Tile>
      <Tile className="span-2">
        <p className="pane-kicker">Rain radar</p>
        <div className="pane-radar" aria-hidden />
        <p className="pane-sub">Past hour + 90 min forecast</p>
      </Tile>
      <Tile>
        <p className="pane-kicker">Tsawwassen → Swartz</p>
        <p className="pane-big-sm">1:20</p>
        <p className="pane-sub">68% full</p>
      </Tile>
    </div>
  );
}

function Photos() {
  return (
    <div className="pane-photos">
      <div className="pane-photo-bg" aria-hidden />
      <div className="pane-photo-widgets">
        <Tile className="pane-on-photo">
          <p className="pane-time">19:04</p>
          <p className="pane-sub">Good evening</p>
        </Tile>
        <Tile className="pane-on-photo pane-narrow">
          <p className="pane-kicker">Canucks</p>
          <p className="pane-big-sm">3 – 2</p>
        </Tile>
      </div>
    </div>
  );
}

function Night() {
  return (
    <div className="pane-grid pane-grid-night">
      <Tile className="span-2 pane-clock">
        <p className="pane-time">22:18</p>
        <p className="pane-sub">Night view · dimmed</p>
      </Tile>
      <Tile>
        <p className="pane-kicker">Alerts</p>
        <p className="pane-sub">All clear</p>
      </Tile>
      <Tile className="span-3">
        <p className="pane-kicker">Tomorrow</p>
        <ul>
          <li>
            <b>7:10</b> Leave for school
          </li>
          <li>
            <b>9:00</b> Dentist
          </li>
        </ul>
      </Tile>
    </div>
  );
}

export function ShotFrame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="shot-frame">
      <div className="shot-inner">{children}</div>
      <figcaption className="mt-3 text-center text-sm text-soft">{label}</figcaption>
    </figure>
  );
}
