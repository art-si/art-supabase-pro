/** 全局启动页品牌 Loading 图形，由 Element Plus 注入外层 SVG。 */
export const brandLoaderSvg = `
  <defs>
    <linearGradient id="brand-loader-panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8b5cf6" />
      <stop offset="55%" stop-color="#635bff" />
      <stop offset="100%" stop-color="#087bff" />
    </linearGradient>
    <linearGradient id="brand-loader-route" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8b5cf6" />
      <stop offset="52%" stop-color="#635bff" />
      <stop offset="100%" stop-color="#22d3ee" />
    </linearGradient>
    <filter id="brand-loader-shadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="9" stdDeviation="8" flood-color="#4338ca" flood-opacity="0.28" />
    </filter>
  </defs>
  <style>
    .brand-loader__orbit {
      transform-origin: 48px 48px;
      animation: brand-loader-orbit 2.4s linear infinite;
    }
    .brand-loader__dash {
      transform-origin: 48px 48px;
      animation: brand-loader-dash 1.8s ease-in-out infinite;
    }
    .brand-loader__pulse {
      transform-origin: 63px 36px;
      animation: brand-loader-pulse 1.6s ease-in-out infinite;
    }
    @keyframes brand-loader-orbit {
      to { transform: rotate(360deg); }
    }
    @keyframes brand-loader-dash {
      0%, 100% { stroke-dashoffset: 14; opacity: 0.62; }
      50% { stroke-dashoffset: -32; opacity: 1; }
    }
    @keyframes brand-loader-pulse {
      0%, 100% { opacity: 0.72; transform: scale(0.86); }
      50% { opacity: 1; transform: scale(1.18); }
    }
    @media (prefers-reduced-motion: reduce) {
      .brand-loader__orbit,
      .brand-loader__dash,
      .brand-loader__pulse { animation: none; }
    }
  </style>
  <circle cx="48" cy="48" r="43" fill="none" stroke="currentColor" stroke-opacity="0.08" />
  <circle
    class="brand-loader__dash"
    cx="48"
    cy="48"
    r="43"
    fill="none"
    stroke="url(#brand-loader-route)"
    stroke-width="2"
    stroke-linecap="round"
    stroke-dasharray="92 178"
  />
  <g class="brand-loader__orbit">
    <circle cx="48" cy="5" r="3.5" fill="#22d3ee" />
    <circle cx="91" cy="48" r="2.2" fill="#8b5cf6" />
  </g>
  <g filter="url(#brand-loader-shadow)">
    <rect x="24" y="24" width="48" height="48" rx="16" fill="url(#brand-loader-panel)" />
    <path d="M35 61L46.5 35L56.5 60" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M49 53L62.5 36.5" fill="none" stroke="#91f4ff" stroke-width="4" stroke-linecap="round" />
    <circle class="brand-loader__pulse" cx="63" cy="36" r="4" fill="#52f0c4" />
  </g>
`
