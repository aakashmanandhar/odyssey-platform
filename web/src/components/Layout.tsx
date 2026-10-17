import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useJSON } from "../lib/data";
import type { IndexFile } from "../lib/types";
import { fmtDate } from "../lib/format";
import { Icon, type IconName } from "./Icon";
import { SearchPalette } from "./SearchPalette";
import { HelmetMark } from "./Logo";

const SearchCtx = createContext<{ open: () => void }>({ open: () => {} });
export const useSearch = () => useContext(SearchCtx);

const NAV: { to: string; label: string; short: string; icon: IconName }[] = [
  { to: "/explore", label: "Explore", short: "Explore", icon: "compass" },
  { to: "/countries", label: "Countries", short: "Countries", icon: "globe" },
  { to: "/compare", label: "Compare", short: "Compare", icon: "columns" },
  { to: "/about", label: "How it's built", short: "About", icon: "info" },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("odyssey-theme", next); } catch { /* private mode: theme just isn't remembered */ }
    setDark(!dark);
  };
  return (
    <button className="icon-btn" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}>
      <Icon name={dark ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const { data: index } = useJSON<IndexFile>("index.json");

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); setSearchOpen(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SearchCtx.Provider value={{ open: () => setSearchOpen(true) }}>
      <header className={`hdr${scrolled ? " scrolled" : ""}`}>
        <div className="wrap hdr-in">
          <Link to="/" className="brand" aria-label="Odyssey home">
            <span className="brand-mark"><HelmetMark size={22} /></span>Odyssey
          </Link>
          <nav className="nav" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}>
                {({ isActive }) => (<>
                  {isActive && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  {n.label}
                </>)}
              </NavLink>
            ))}
          </nav>
          <div className="hdr-right">
            <button className="search-btn" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Icon name="search" size={18} /><span className="label">Search places</span><kbd>⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="ftr">
        <div className="wrap ftr-in">
          <div className="col">
            <strong>Odyssey</strong>
            <span>Know where to go, and when: climate, sights and travel facts built from open data and refreshed automatically.</span>
            <span>Photos by Wikimedia Commons contributors (CC0, CC BY, CC BY-SA), credited on every image.</span>
          </div>
          <div className="col">
            <span>Designed and developed by <a href="https://aakashmanandhar.tech/" target="_blank" rel="noreferrer">Aakash Manandhar</a></span>
            <span><a href="https://www.linkedin.com/in/aakashmanandhar/" target="_blank" rel="noreferrer">LinkedIn</a> · <a href="https://github.com/aakashmanandhar/odyssey-platform" target="_blank" rel="noreferrer">GitHub</a> · <Link to="/about">How it's built</Link></span>
            {index && <span>Data snapshot {fmtDate(index.generated_at)}</span>}
          </div>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><Icon name="home" size={22} />Home</NavLink>
        {NAV.map((n) => <NavLink key={n.to} to={n.to}><Icon name={n.icon} size={22} />{n.short}</NavLink>)}
      </nav>

      <AnimatePresence>{searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}</AnimatePresence>
    </SearchCtx.Provider>
  );
}
