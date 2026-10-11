import { useEffect } from "react";
import { FONT_IMPORT_ID } from "../data";

export function useInjectFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_IMPORT_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_IMPORT_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);
}

export default function GlobalStyle() {
  return (
    <style>{`
      :root {
        --paddy: #062B1C;
        --growth: #188B5D;
        --growth-dark: #126242;
        --harvest: #D9A441;
        --soil: #8B5E3C;
        --mist: #F4F6F2;
        --sky: #4A6FA5;
        --ink: #20241E;
        --line: rgba(6,43,28,0.12);
      }
      .acm-root {
        font-family: 'Inter', sans-serif;
        color: var(--ink);
        background: #FFFFFF;
        -webkit-font-smoothing: antialiased;
        width: 100%;
        overflow-x: hidden;
      }
      .acm-root h1, .acm-root h2, .acm-root h3 { letter-spacing: -0.015em; }
      .acm-eyebrow {
        display: inline-flex; align-items: center; gap: 8px;
        font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
        text-transform: uppercase; color: var(--growth-dark);
        padding: 6px 14px 6px 10px; border: 1.5px solid var(--growth);
        border-radius: 999px; background: #fff;
      }
      .acm-eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--harvest); }
      .card {
        background: #fff; border-radius: 16px; border: 1px solid var(--line);
        box-shadow: 0 1px 2px rgba(6,43,28,0.04);
        transition: transform .3s ease, box-shadow .3s ease, border-color .3s ease;
      }
      .card:hover { transform: translateY(-4px); box-shadow: 0 16px 32px -18px rgba(6,43,28,0.22); border-color: rgba(24,139,93,0.35); }
      .btn-primary {
        background: var(--growth); color: #fff; font-weight: 600;
        border-radius: 12px; padding: 13px 24px; display: inline-flex;
        align-items: center; gap: 8px; transition: background .2s, transform .2s;
        border: none; cursor: pointer;
      }
      .btn-primary:hover { background: var(--growth-dark); transform: translateY(-1px); }
      .btn-primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }
      .btn-shimmer { position: relative; overflow: hidden; }
      .btn-shimmer::after {
        content: ""; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%);
        animation: shimmer 2.5s ease-in-out infinite;
        transform: translateX(-100%);
      }
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .btn-outline {
        border: 1.5px solid var(--growth); color: var(--growth-dark); font-weight: 600;
        border-radius: 12px; padding: 12.5px 24px; display: inline-flex;
        align-items: center; gap: 8px; transition: background .2s, color .2s;
        background: #fff; cursor: pointer;
      }
      .btn-outline:hover { background: var(--growth); color: #fff; }
.nav-link {
  position: relative; font-size: 14px; font-weight: 500; color: var(--paddy); padding: 6px 2px;
  background: none; border: none; cursor: pointer; font-family: inherit; white-space: nowrap;
  flex-shrink: 0;
}
      .nav-link::after {
        content: ""; position: absolute; left: 0; bottom: 0; height: 2px;
        background: var(--harvest); transition: width .2s ease;
        width: 0%;
      }
      .nav-link:hover::after, .nav-link.active::after { width: 100%; }
      .nav-link.active { color: var(--growth-dark); }
      .seal {
        width: 42px; height: 42px; border-radius: 12px; display: flex;
        align-items: center; justify-content: center; background: transparent;
        color: #fff; flex-shrink: 0;
      }
      .accordion-panel { max-height: 0; overflow: hidden; transition: max-height .35s ease; }
      .accordion-panel.open { max-height: 460px; }
      .dropdown-panel {
        position: absolute; top: 100%; left: 50%; transform: translateX(-50%) translateY(4px);
        padding-top: 12px; min-width: 220px;
        opacity: 0; visibility: hidden; pointer-events: none;
        transition: opacity .2s ease, transform .2s ease, visibility .2s ease;
      }
      .group:hover .dropdown-panel, .group:focus-within .dropdown-panel {
        opacity: 1; visibility: visible; pointer-events: auto; transform: translateX(-50%) translateY(0);
      }
      .dropdown-menu {
        background: #fff; border: 1px solid var(--line); border-radius: 14px;
        padding: 8px; box-shadow: 0 20px 40px -18px rgba(6,43,28,0.28);
      }
      .dropdown-item {
        display: block; width: 100%; text-align: left; padding: 10px 14px; font-size: 13.5px; font-weight: 500;
        color: var(--ink); white-space: nowrap; border-radius: 10px; background: none; border: none; cursor: pointer;
        font-family: inherit; transition: background .15s ease, color .15s ease;
      }
      .dropdown-item:hover { background: var(--mist); color: var(--growth-dark); }
      .filter-chip {
        font-size: 12.5px; font-weight: 600; padding: 8px 16px; border-radius: 999px;
        border: 1.5px solid var(--line); background: #fff; color: #4b5548; cursor: pointer;
        transition: all .2s ease; white-space: nowrap;
      }
      .filter-chip.active { background: var(--growth); border-color: var(--growth); color: #fff; }
      .filter-chip:hover:not(.active) { border-color: var(--growth); color: var(--growth-dark); }
      .reveal { animation: acmRise .6s cubic-bezier(.2,.7,.3,1) both; }
      @keyframes acmRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      .chat-bubble-in { animation: acmPop .2s ease both; }
      @keyframes acmPop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .header-search {
        display: flex; align-items: center; gap: 8px;
        border: 1px solid var(--line); background: var(--mist);
        border-radius: 999px; padding: 8px 14px; width: 180px;
        transition: width .2s ease, border-color .2s ease;
      }
      .header-search:focus-within { border-color: var(--growth); width: 220px; }
      .header-search input {
        background: transparent; border: none; outline: none; flex: 1;
        font-size: 13px; color: var(--ink); min-width: 0;
      }
      .mobile-search {
        display: flex; align-items: center; gap: 8px;
        border: 1px solid var(--line); background: var(--mist);
        border-radius: 999px; padding: 10px 14px; width: 100%;
      }
      .mobile-search input {
        background: transparent; border: none; outline: none; flex: 1;
        font-size: 13.5px; color: var(--ink); min-width: 0;
      }
      .hero-carousel {
        position: relative; overflow: hidden; width: 100%; height: 560px;
      }
      @media (max-width: 1024px) {
        .hero-carousel { height: 420px; }
        .header-search { width: 150px; }
      }
      @media (max-width: 640px) {
        .hero-carousel { height: 300px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .reveal, .chat-bubble-in, .card, .btn-primary, .btn-outline { animation: none !important; transition: none !important; }
      }
      input:focus, textarea:focus, button:focus-visible, a:focus-visible {
        outline: 2px solid var(--harvest); outline-offset: 2px;
      }
    `}</style>
  );
}
