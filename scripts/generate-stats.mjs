// Generates assets/stats-dark.svg and assets/stats-light.svg from the GitHub API.
// No third-party services, no dependencies. Runs on Node 20+ (global fetch).

const USER = process.env.GH_USER || 'sufyanqaid2';
const TOKEN = process.env.GITHUB_TOKEN || '';
const H = { 'Accept': 'application/vnd.github+json', 'User-Agent': USER };
if (TOKEN) H.Authorization = `Bearer ${TOKEN}`;


const api = async (url) => {
  const r = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return { data: await r.json(), link: r.headers.get('link') || '' };
};

const lastPage = (link) => {
  const m = /<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link);
  return m ? parseInt(m[1], 10) : null;
};

const user = (await api(`/users/${USER}`)).data;

let repos = [], page = 1;
while (true) {
  const { data } = await api(`/users/${USER}/repos?per_page=100&page=${page}&type=owner`);
  repos = repos.concat(data);
  if (data.length < 100) break;
  page++;
}
repos = repos.filter(r => !r.fork && !r.archived);

let stars = 0;
for (const r of repos) stars += r.stargazers_count;

// aggregate language bytes
const bytes = {};
for (const r of repos) {
  try {
    const { data } = await api(`/repos/${USER}/${r.name}/languages`);
    for (const [k, v] of Object.entries(data)) bytes[k] = (bytes[k] || 0) + v;
  } catch {}
}

// commit count per repo (cheap: per_page=1 + Link rel=last)
let commits = 0;
for (const r of repos) {
  try {
    const { data, link } = await api(`/repos/${USER}/${r.name}/commits?author=${USER}&per_page=1`);
    const lp = lastPage(link);
    commits += lp ? lp : data.length;
  } catch {}
}

const totalBytes = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const langs = Object.entries(bytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, v]) => ({ name, pct: (v / totalBytes) * 100 }));

const LANG_COLORS = {
  Python: '#3572A5', 'Jupyter Notebook': '#DA5B0B', 'C++': '#f34b7d', Java: '#b07219',
  JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c',
  PLpgSQL: '#336790', Shell: '#89e051', C: '#555555', 'C#': '#178600', PHP: '#4F5D95',
  Ruby: '#701516', Go: '#00ADD8', Rust: '#dea584', Dockerfile: '#384d54', Makefile: '#427819',
};
const FALLBACK = ['#22D3EE', '#818CF8', '#C084FC', '#34D399', '#FBBF24', '#FB7185'];
const colorFor = (n, i) => LANG_COLORS[n] || FALLBACK[i % FALLBACK.length];

const FONT = "'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,'SFMono-Regular',Consolas,'Liberation Mono',monospace";

const THEMES = {
  dark:  { bg1:'#060A14', bg2:'#0B1226', bg3:'#101A36', title:'#F8FAFC', label:'#94A3B8',
           value:'#E2E8F0', rule:'#1E293B', track:'#111C33', mono:'#64748B',
           a1:'#22D3EE', a2:'#818CF8', a3:'#C084FC' },
  light: { bg1:'#FFFFFF', bg2:'#F5F7FF', bg3:'#EAEEFF', title:'#0B1220', label:'#64748B',
           value:'#1E293B', rule:'#E2E8F0', track:'#E6EAFF', mono:'#94A3B8',
           a1:'#0891B2', a2:'#4F46E5', a3:'#7C3AED' },
};

const W = 900, HH = 260;

function card(theme) {
  const c = THEMES[theme];
  const rows = [
    ['Public repositories', String(user.public_repos)],
    ['Total commits',       String(commits)],
    ['Stars earned',        String(stars)],
    ['Followers',           String(user.followers)],
  ];

  const statRows = rows.map(([k, v], i) => {
    const y = 118 + i * 32;
    return `<text x="52" y="${y}" font-family="${FONT}" font-size="14.5" fill="${c.label}">${k}</text>` +
           `<text x="376" y="${y}" text-anchor="end" font-family="${MONO}" font-size="15" font-weight="600" fill="${c.value}">${v}</text>`;
  }).join('\n    ');

  // language stacked bar
  const bx = 500, bw = 356;
  let acc = 0;
  const segs = langs.map((l, i) => {
    const w = Math.max((l.pct / 100) * bw, 2);
    const x = bx + acc;
    acc += w;
    const r = i === 0 ? `<rect x="${x.toFixed(1)}" y="104" width="${w.toFixed(1)}" height="10" rx="5" fill="${colorFor(l.name, i)}"/>`
                      : `<rect x="${x.toFixed(1)}" y="104" width="${w.toFixed(1)}" height="10" fill="${colorFor(l.name, i)}"/>`;
    return r;
  }).join('\n    ');

  const legend = langs.map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = bx + col * 180, y = 146 + row * 28;
    const short = l.name.length > 12 ? l.name.slice(0, 11) + '\u2026' : l.name;
    return `<circle cx="${x + 5}" cy="${y - 4}" r="5" fill="${colorFor(l.name, i)}"/>` +
           `<text x="${x + 18}" y="${y}" font-family="${FONT}" font-size="13.5" fill="${c.label}">${short}</text>` +
           `<text x="${x + 160}" y="${y}" text-anchor="end" font-family="${MONO}" font-size="13" fill="${c.value}">${l.pct.toFixed(1)}%</text>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}" role="img" aria-label="GitHub statistics for ${USER}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c.bg1}"/><stop offset="55%" stop-color="${c.bg2}"/><stop offset="100%" stop-color="${c.bg3}"/>
    </linearGradient>
    <linearGradient id="accent" x1="-0.6" y1="0" x2="1.6" y2="0" spreadMethod="reflect">
      <stop offset="0%" stop-color="${c.a1}"/><stop offset="33%" stop-color="${c.a2}"/>
      <stop offset="66%" stop-color="${c.a3}"/><stop offset="100%" stop-color="${c.a1}"/>
      <animateTransform attributeName="gradientTransform" type="translate" values="-0.45 0; 0.45 0; -0.45 0" dur="9s" repeatCount="indefinite"/>
    </linearGradient>
    <clipPath id="round"><rect width="${W}" height="${HH}" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#round)">
    <rect width="${W}" height="${HH}" fill="url(#bg)"/>
    <rect x="0" y="0" width="${W}" height="4" fill="url(#accent)"/>

    <text x="52" y="58" font-family="${MONO}" font-size="11.5" letter-spacing="2.4" fill="${c.mono}">OVERVIEW</text>
    <line x1="52" y1="74" x2="376" y2="74" stroke="${c.rule}" stroke-width="1"/>
    ${statRows}

    <text x="500" y="58" font-family="${MONO}" font-size="11.5" letter-spacing="2.4" fill="${c.mono}">MOST USED LANGUAGES</text>
    <line x1="500" y1="74" x2="856" y2="74" stroke="${c.rule}" stroke-width="1"/>
    <rect x="${bx}" y="104" width="${bw}" height="10" rx="5" fill="${c.track}"/>
    ${segs}
    ${legend}

    <line x1="438" y1="44" x2="438" y2="216" stroke="${c.rule}" stroke-width="1"/>
    <rect x="0.5" y="0.5" width="${W - 1}" height="${HH - 1}" rx="16" fill="none" stroke="${c.rule}" stroke-width="1"/>
  </g>
</svg>
`;
}

import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('assets', { recursive: true });
writeFileSync('assets/stats-dark.svg', card('dark'));
writeFileSync('assets/stats-light.svg', card('light'));
console.log(`repos=${repos.length} commits=${commits} stars=${stars} langs=${langs.map(l=>l.name).join(',')}`);
