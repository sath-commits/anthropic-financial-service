export default function DashboardPreview() {
  return (
    <svg
      viewBox="0 0 480 308"
      className="w-full rounded-xl drop-shadow-2xl"
      aria-hidden="true"
    >
      {/* Window frame */}
      <rect width="480" height="308" rx="12" fill="white" stroke="#e5ddd3" strokeWidth="1.5" />

      {/* Header bar */}
      <rect width="480" height="33" rx="12" fill="#f7f2eb" />
      <rect y="22" width="480" height="11" fill="#f7f2eb" />
      <rect y="32.5" width="480" height="1" fill="#e5ddd3" />

      {/* Traffic lights */}
      <circle cx="16" cy="16.5" r="4" fill="#f87171" />
      <circle cx="28" cy="16.5" r="4" fill="#fbbf24" />
      <circle cx="40" cy="16.5" r="4" fill="#34d399" />

      {/* App name */}
      <text x="54" y="21" fontSize="9" fill="#4a3d33" fontWeight="600" fontFamily="system-ui, sans-serif">Beta than nothing</text>

      {/* Nav pills */}
      <rect x="184" y="10" width="42" height="14" rx="5" fill="#ede8df" />
      <text x="205" y="20" fontSize="7" fill="#4a3d33" textAnchor="middle" fontFamily="system-ui, sans-serif">Dashboard</text>

      {/* Refresh button */}
      <rect x="408" y="9" width="58" height="15" rx="4" fill="white" stroke="#d4c9bc" strokeWidth="0.8" />
      <text x="437" y="19.5" fontSize="7" fill="#6e5f52" textAnchor="middle" fontFamily="system-ui, sans-serif">⟳ Refresh</text>

      {/* ── Metric cards row ── */}
      {/* Portfolio Value */}
      <rect x="8" y="42" width="108" height="56" rx="6" fill="white" stroke="#e5ddd3" strokeWidth="1" />
      <text x="16" y="54" fontSize="5.5" fill="#9e9087" fontFamily="system-ui, sans-serif" letterSpacing="0.8">PORTFOLIO VALUE</text>
      <text x="16" y="68" fontSize="13" fill="#1c1612" fontWeight="700" fontFamily="system-ui, sans-serif">$878,526</text>
      {/* mini sparkline */}
      <polyline points="16,86 30,83 44,84 58,80 72,78 86,75 100,73 108,71" fill="none" stroke="#b8ad9e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Total P&L */}
      <rect x="124" y="42" width="108" height="56" rx="6" fill="white" stroke="#e5ddd3" strokeWidth="1" />
      <text x="132" y="54" fontSize="5.5" fill="#9e9087" fontFamily="system-ui, sans-serif" letterSpacing="0.8">TOTAL P&amp;L</text>
      <text x="132" y="68" fontSize="13" fill="#1c1612" fontWeight="700" fontFamily="system-ui, sans-serif">-$11,482</text>
      <text x="132" y="79" fontSize="7.5" fill="#f87171" fontFamily="system-ui, sans-serif">-1.29%</text>
      <polyline points="132,88 146,89 160,87 174,90 188,88 202,91 216,90 228,92" fill="none" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Day Change */}
      <rect x="240" y="42" width="108" height="56" rx="6" fill="white" stroke="#e5ddd3" strokeWidth="1" />
      <text x="248" y="54" fontSize="5.5" fill="#9e9087" fontFamily="system-ui, sans-serif" letterSpacing="0.8">DAY CHANGE</text>
      <text x="248" y="68" fontSize="13" fill="#1c1612" fontWeight="700" fontFamily="system-ui, sans-serif">-$20,783</text>
      <text x="248" y="79" fontSize="7.5" fill="#f87171" fontFamily="system-ui, sans-serif">-3.87%</text>
      <polyline points="248,88 262,87 276,89 290,86 304,90 318,88 332,91 340,92" fill="none" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* Cash Equivalents */}
      <rect x="356" y="42" width="116" height="56" rx="6" fill="white" stroke="#e5ddd3" strokeWidth="1" />
      <text x="364" y="54" fontSize="5.5" fill="#9e9087" fontFamily="system-ui, sans-serif" letterSpacing="0.8">CASH EQUIVALENTS</text>
      <text x="364" y="68" fontSize="13" fill="#1c1612" fontWeight="700" fontFamily="system-ui, sans-serif">$24,500</text>
      <text x="364" y="79" fontSize="7.5" fill="#6e5f52" fontFamily="system-ui, sans-serif">2 accounts</text>
      <polyline points="364,88 378,87 392,87 406,86 420,87 434,86 448,86 464,86" fill="none" stroke="#b8ad9e" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* ── Chart panel ── */}
      <rect x="8" y="106" width="302" height="132" rx="7" fill="white" stroke="#e5ddd3" strokeWidth="1" />
      <text x="18" y="120" fontSize="8" fill="#2d2218" fontWeight="600" fontFamily="system-ui, sans-serif">NVDA</text>
      <text x="38" y="120" fontSize="7" fill="#9e9087" fontFamily="system-ui, sans-serif">12 months</text>
      <text x="278" y="120" fontSize="8" fill="#10b981" fontWeight="600" fontFamily="system-ui, sans-serif">+44.2%</text>

      {/* Grid lines */}
      {[130, 148, 166, 184, 202, 220].map(y => (
        <line key={y} x1="16" y1={y} x2="302" y2={y} stroke="#f0ece6" strokeWidth="0.6" />
      ))}

      {/* Chart gradient fill */}
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M18,218 C40,210 55,205 75,196 S100,188 118,182 S142,170 162,158 S188,148 208,140 S234,128 255,120 S278,112 302,108 L302,228 L18,228 Z"
        fill="url(#g1)"
      />
      <path
        d="M18,218 C40,210 55,205 75,196 S100,188 118,182 S142,170 162,158 S188,148 208,140 S234,128 255,120 S278,112 302,108"
        fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round"
      />
      <circle cx="302" cy="108" r="3" fill="#3b82f6" />
      <rect x="272" y="97" width="36" height="12" rx="3" fill="#3b82f6" />
      <text x="290" y="106" fontSize="6.5" fill="white" textAnchor="middle" fontFamily="system-ui, sans-serif">$1,409</text>

      {/* ── Allocation panel ── */}
      <rect x="318" y="106" width="154" height="132" rx="7" fill="white" stroke="#e5ddd3" strokeWidth="1" />
      <text x="328" y="120" fontSize="8" fill="#2d2218" fontWeight="600" fontFamily="system-ui, sans-serif">Asset Allocation</text>

      {[
        { label: 'US Large Cap', pct: 78, color: '#3b82f6' },
        { label: 'International', pct: 44, color: '#8b5cf6' },
        { label: 'Bonds', pct: 30, color: '#10b981' },
        { label: 'REITs', pct: 20, color: '#f59e0b' },
        { label: 'Gold', pct: 13, color: '#f97316' },
        { label: 'Cash', pct: 8,  color: '#6b7280' },
      ].map(({ label, pct, color }, i) => (
        <g key={label}>
          <text x="328" y={135 + i * 17} fontSize="6.5" fill="#6e5f52" fontFamily="system-ui, sans-serif">{label}</text>
          <rect x="328" y={138 + i * 17} width="130" height="4.5" rx="2" fill="#f0ece6" />
          <rect x="328" y={138 + i * 17} width={pct} height="4.5" rx="2" fill={color} />
        </g>
      ))}

      {/* ── Positions table ── */}
      <rect x="8" y="246" width="464" height="54" rx="7" fill="white" stroke="#e5ddd3" strokeWidth="1" />

      {/* Table header */}
      {['SYMBOL', 'SHARES', 'VALUE', 'P&L', 'WEIGHT'].map((h, i) => (
        <text key={h} x={[18, 130, 220, 310, 415][i]} y="258" fontSize="5.5" fill="#9e9087" fontFamily="system-ui, sans-serif" letterSpacing="0.5">{h}</text>
      ))}
      <line x1="8" y1="261" x2="472" y2="261" stroke="#f0ece6" strokeWidth="0.8" />

      {/* Row 1 */}
      <text x="18"  y="272" fontSize="8"   fill="#1c1612" fontWeight="600" fontFamily="system-ui, sans-serif">NVDA</text>
      <text x="55"  y="272" fontSize="6.5" fill="#9e9087" fontFamily="system-ui, sans-serif">Nvidia</text>
      <text x="130" y="272" fontSize="7.5" fill="#1c1612" fontFamily="system-ui, sans-serif">45</text>
      <text x="220" y="272" fontSize="7.5" fill="#1c1612" fontFamily="system-ui, sans-serif">$63,405</text>
      <text x="310" y="272" fontSize="7.5" fill="#10b981" fontFamily="system-ui, sans-serif">+$28,120</text>
      <text x="415" y="272" fontSize="7.5" fill="#1c1612" fontFamily="system-ui, sans-serif">7.2%</text>

      <line x1="8" y1="276" x2="472" y2="276" stroke="#f7f2eb" strokeWidth="0.8" />

      {/* Row 2 */}
      <text x="18"  y="288" fontSize="8"   fill="#1c1612" fontWeight="600" fontFamily="system-ui, sans-serif">VTI</text>
      <text x="55"  y="288" fontSize="6.5" fill="#9e9087" fontFamily="system-ui, sans-serif">Vanguard Total Mkt</text>
      <text x="130" y="288" fontSize="7.5" fill="#1c1612" fontFamily="system-ui, sans-serif">310</text>
      <text x="220" y="288" fontSize="7.5" fill="#1c1612" fontFamily="system-ui, sans-serif">$71,890</text>
      <text x="310" y="288" fontSize="7.5" fill="#10b981" fontFamily="system-ui, sans-serif">+$14,350</text>
      <text x="415" y="288" fontSize="7.5" fill="#1c1612" fontFamily="system-ui, sans-serif">8.2%</text>

      {/* Fade-out overlay at bottom of positions */}
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="white" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect x="8" y="280" width="464" height="20" rx="0" fill="url(#fade)" />
    </svg>
  );
}
