import {
  Sprout, Fish, Stethoscope, GraduationCap, Zap, Layers, Megaphone,
  ClipboardList, UserCheck, MessageSquare, Building2, Target, TrendingUp, Users,
} from "lucide-react";

export const ICON_MAP = {
  sprout: Sprout,
  fish: Fish,
  stethoscope: Stethoscope,
  graduation: GraduationCap,
  zap: Zap,
  layers: Layers,
  megaphone: Megaphone,
  clipboard: ClipboardList,
  "user-check": UserCheck,
  message: MessageSquare,
  building: Building2,
  target: Target,
  trending: TrendingUp,
  users: Users,
};

// Convert a stored {icon: "x"} item into an element-bearing shape for rendering
// given the icon map. Falls back to a generic icon if the name is unknown.
export function withIcon(item, Fallback = Sprout) {
  const Cmp = ICON_MAP[item.icon] || Fallback;
  return { ...item, Icon: Cmp };
}