import { ChevronDown, LogOut } from "lucide-react";

import { RouteClosingDetails } from "@/components/route-closing-details";
import { logoutAction } from "@/server/auth/actions";

export function ProfileMenu({
  locale,
  userName,
  logoutLabel,
}: {
  locale: string;
  userName: string;
  logoutLabel: string;
}) {
  const initials = userName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const logout = logoutAction.bind(null, locale);

  return (
    <RouteClosingDetails
      className="profile-menu"
      summary={
        <summary className="profile-menu__trigger">
          <span className="profile-name">{userName}</span>
          <span className="profile-avatar">{initials}</span>
          <ChevronDown size={15} aria-hidden />
        </summary>
      }
    >
      <div className="profile-menu__panel">
        <p className="profile-menu__name">{userName}</p>
        <form action={logout}>
          <button type="submit">
            <LogOut size={16} />
            <span>{logoutLabel}</span>
          </button>
        </form>
      </div>
    </RouteClosingDetails>
  );
}
