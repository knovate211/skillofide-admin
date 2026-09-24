import React from 'react';

// Line icons for the sidebar, top bar and dashboard. One 24px grid, stroke
// drawn in currentColor, so an icon takes the colour of the text around it.

type P = React.SVGProps<SVGSVGElement> & { size?: number };

const make = (paths: React.ReactNode) =>
  function Icon({ size = 18, ...rest }: P) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        {paths}
      </svg>
    );
  };

export const IconHome = make(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></>);
export const IconUsers = make(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>);
export const IconUserPlus = make(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M19 8v6M16 11h6" /></>);
export const IconCalendar = make(<><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>);
export const IconClipboard = make(<><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3h6v1.5" /><path d="M8.5 11h7M8.5 15h5" /></>);
export const IconLayers = make(<><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>);
export const IconCode = make(<><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>);
export const IconUserCheck = make(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="m16 11 2 2 4-4" /></>);
export const IconMessage = make(<><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9.5h8M8 12.5h5" /></>);
export const IconFile = make(<><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>);
export const IconAward = make(<><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.5-1.5 7.5 5-2.5 5 2.5-1.5-7.5" /></>);
export const IconBuilding = make(<><rect x="4" y="3" width="11" height="18" /><path d="M15 9h5v12h-5M7.5 7h4M7.5 11h4M7.5 15h4" /></>);
export const IconShield = make(<><path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6L12 3Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>);
export const IconBell = make(<><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>);
export const IconMenu = make(<><path d="M4 6h16M4 12h16M4 18h16" /></>);
export const IconChevronDown = make(<><path d="m6 9 6 6 6-6" /></>);
export const IconChevronRight = make(<><path d="m9 6 6 6-6 6" /></>);
export const IconLogout = make(<><path d="M15 4h4v16h-4" /><path d="M10 8 6 12l4 4M6 12h10" /></>);
export const IconArrowUp = make(<><path d="M12 19V5M6 11l6-6 6 6" /></>);
export const IconArrowDown = make(<><path d="M12 5v14M6 13l6 6 6-6" /></>);
export const IconArrowRight = make(<><path d="M5 12h14M13 6l6 6-6 6" /></>);
export const IconCap = make(<><path d="M2.5 9 12 4.5 21.5 9 12 13.5 2.5 9Z" /><path d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11M21.5 9v5" /></>);
export const IconInbox = make(<><path d="M3.5 13 6 5h12l2.5 8v6h-17v-6Z" /><path d="M3.5 13H9a3 3 0 0 0 6 0h5.5" /></>);
export const IconStar = make(<><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z" /></>);
export const IconZap = make(<><path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12l1-8Z" /></>);
export const IconClock = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconHelp = make(<><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5a2.5 2.5 0 0 1 4.9.7c0 1.6-2.5 2.2-2.5 3.8M12 17h.01" /></>);
export const IconRefresh = make(<><path d="M20 11a8 8 0 0 0-14.3-4.8L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.8L20 16M20 20v-4h-4" /></>);
