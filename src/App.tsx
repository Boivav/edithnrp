/**
 * ==============================================================================
 * E.D.I.T.H. - ROOT APPLICATION SHELL & STATE ORCHESTRATOR
 * ==============================================================================
 * Manages route navigation, simulation clock tick, backend sync, and
 * user action dispatchers (permission actions, slider manipulations, resets).
 * ==============================================================================
 */

import { useEffect, useReducer, useRef, useState } from "react";
import {
  createSim,
  tick,
  setPerm,
  triggerRogue,
  allRecs,
  setManualFeature,
  resetAppToBaseline,
  simulateViaML,
  Sim
} from "./engine";
import { Act } from "./ui";
import { Dashboard, Applications, Detail, Alerts, Activity } from "./pages";
import { checkBackendHealth, resolveAlert } from "./api";

const TABS: [string, string][] = [
  ["dashboard", "Dashboard"],
  ["apps", "Applications"],
  ["activity", "Activity"],
  ["alerts", "Alerts"]
];

const readRoute = () => location.hash.slice(1) || "dashboard";

export default function App() {
  const ref = useRef<Sim>();
  if (!ref.current) ref.current = createSim();
  const S = ref.current;

  const [, force] = useReducer((x: number) => x + 1, 0);
  const [route, setRoute] = useState(readRoute());
  const [backendAlive, setBackendAlive] = useState(false);
  const pressed = useRef(false);

  useEffect(() => {
    const hash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    const dn = () => (pressed.current = true);
    const up = () => (pressed.current = false);

    window.addEventListener("hashchange", hash);
    window.addEventListener("pointerdown", dn);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    // Initial backend health check
    checkBackendHealth().then(alive => {
      setBackendAlive(alive);
      S.backendConnected = alive;
      force();
    });

    // Clock tick interval (every 1.5s)
    const id = setInterval(() => {
      if (S.run) {
        tick(S);
        if (!pressed.current) force();
      }
    }, 1500);

    // Periodic backend health ping (every 10s)
    const healthInterval = setInterval(() => {
      checkBackendHealth().then(alive => {
        if (alive !== backendAlive) {
          setBackendAlive(alive);
          S.backendConnected = alive;
          force();
        }
      });
    }, 10000);

    return () => {
      clearInterval(id);
      clearInterval(healthInterval);
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("pointerdown", dn);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [S, backendAlive]);

  // Action dispatchers
  const act: Act = {
    perm: (app, p, st) => {
      setPerm(S, app, p, st);
      force();
    },
    all: () => {
      allRecs(S).forEach(r => setPerm(S, r.app, r.perm, r.st));
      force();
    },
    dismiss: id => {
      const x = S.alerts.find(a => a.id === id);
      if (x) {
        x.state = "dismissed";
        resolveAlert(id);
      }
      force();
    },
    feature: (app, feat, val) => {
      setManualFeature(S, app, feat, val);
      force();
    },
    resetApp: app => {
      resetAppToBaseline(S, app);
      force();
    },
    simulateML: app => {
      simulateViaML(S, app, force);
    }
  };

  const base = route.startsWith("app-") ? "apps" : route;
  const open = S.alerts.filter(a => a.state === "open").length;
  const detailApp = route.startsWith("app-") ? S.apps.find(a => a.id === route.slice(4)) : undefined;
  const rogueOn = S.apps.some(a => a.rogue);

  return (
    <>
      <header>
        <div className="brand">
          E.D.I.T.H.
          <small>Enhanced Digital Identity, Trust &amp; Heuristics</small>
        </div>
        <nav>
          {TABS.map(([k, l]) => (
            <a key={k} href={`#${k}`} className={k === base ? "on" : ""}>
              {l}
              {k === "alerts" && open ? ` (${open})` : ""}
            </a>
          ))}
        </nav>
        <div className="ctl">
          <span
            className="chip"
            style={{
              fontSize: 11,
              borderLeftColor: backendAlive ? "var(--good)" : "var(--mut)",
              margin: 0
            }}
            title={backendAlive ? "Connected to Node.js Backend & MongoDB Atlas" : "Running local ML inference"}
          >
            {backendAlive ? "API: Online" : "ML: Local"}
          </span>
          <span className={"live" + (S.run ? "" : " off")}>
            <i />
            {S.run ? "Live" : "Paused"}
          </span>
          <button
            className="btn danger"
            disabled={rogueOn}
            onClick={() => {
              triggerRogue(S);
              force();
            }}
          >
            Simulate rogue app
          </button>
          <button
            className="btn"
            onClick={() => {
              S.run = !S.run;
              force();
            }}
          >
            {S.run ? "Pause" : "Resume"}
          </button>
          <button
            className="btn"
            onClick={() => {
              Object.assign(S, createSim());
              force();
            }}
          >
            Reset
          </button>
          <button
            className="btn"
            onClick={() => {
              const h = document.documentElement;
              h.dataset.theme = h.dataset.theme === "dark" ? "light" : "dark";
            }}
          >
            Theme
          </button>
        </div>
      </header>

      <main>
        {detailApp ? (
          <Detail S={S} act={act} a={detailApp} />
        ) : route === "apps" ? (
          <Applications S={S} act={act} />
        ) : route === "activity" ? (
          <Activity S={S} />
        ) : route === "alerts" ? (
          <Alerts S={S} act={act} />
        ) : (
          <Dashboard S={S} act={act} />
        )}
      </main>
    </>
  );
}
