import { ArrowRight, Banknote, Calendar, CalendarDays, Camera, Check, ChevronDown, CloudRain, Coins, Columns2, Compass, Droplets, Globe, House, Info, Landmark, Languages,
  MapPin, Moon, PartyPopper, Plane, Ruler, Search, ShieldCheck, Sparkles, Sun, Tag, TrendingUp, TriangleAlert, Users, X } from "lucide-react";
// Lucide icons behind one small API, so components only name the icon they need.
const ICONS = { search: Search, sun: Sun, moon: Moon, compass: Compass, globe: Globe, columns: Columns2, info: Info, home: House, arrow: ArrowRight,
  pin: MapPin, camera: Camera, check: Check, alert: TriangleAlert, calendar: Calendar, sparkles: Sparkles, rain: CloudRain, drop: Droplets,
  landmark: Landmark, users: Users, ruler: Ruler, languages: Languages, coins: Coins, tag: Tag, chevron: ChevronDown, x: X, trend: TrendingUp,
  party: PartyPopper, plane: Plane, shield: ShieldCheck, days: CalendarDays, banknote: Banknote };
export type IconName = keyof typeof ICONS;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={1.8} aria-hidden="true" />;
}
