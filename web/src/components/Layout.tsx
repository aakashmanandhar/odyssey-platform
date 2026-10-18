import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Icon, type IconName } from "./Icon";
import { SearchPalette } from "./SearchPalette";
import { OdysseyMark } from "./Logo";
import { PalettePicker } from "./PalettePicker";

const SearchCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useSearch = () => useContext(SearchCtx);

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/explore", label: "Explore", icon: "compass" },
  { to: "/countries", label: "Countries", icon: "globe" },
  { to: "/compare", label: "Compare", icon: "columns" },
  { to: "/about", label: "How it's built", icon: "info" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? "dark") === "dark");
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("odyssey-theme", next); } catch { /* private mode: not remembered */ }
    setDark(!dark);
  };
  return (
    <button className="side-link" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
      <Icon name={dark ? "sun" : "moon"} size={20} /><span className="side-tip">{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { main.current?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); setSearchOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SearchCtx.Provider value={{ open: () => setSearchOpen(true) }}>
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="shell">
        <aside className="side">
          <Link to="/" className="side-logo" aria-label="Odyssey home"><OdysseyMark size={28} /></Link>
          <nav className="side-nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className="side-link" aria-label={n.label}>
                {({ isActive }) => (<>
                  {isActive && <motion.span layoutId="side-pill" className="side-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <Icon name={n.icon} size={21} /><span className="side-tip">{n.label}</span>
                </>)}
              </NavLink>
            ))}
          </nav>
          <div className="side-foot">
            <button className="side-link" onClick={() => setSearchOpen(true)} aria-label="Search"><Icon name="search" size={20} /><span className="side-tip">Search · ⌘K</span></button>
            <PalettePicker />
            <ThemeToggle />
          </div>
        </aside>
        <main className="main" ref={main}>{children}</main>
      </div>
      <AnimatePresence>{searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}</AnimatePresence>
    </SearchCtx.Provider>
  );
}
