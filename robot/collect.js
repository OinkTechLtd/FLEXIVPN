#!/usr/bin/env node
// FlexiVPN Robot — Server Collector
// Собирает публичные прокси и VPN серверы из множества источников

import fetch from 'node-fetch';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_FILE = resolve('../servers.json');

// ─── Источники прокси ────────────────────────────────────────────────────────
// Добавляй новые источники сюда — массив объектов с { name, url, parser }
const SOURCES = [
  {
    name: 'ProxyScrape SOCKS5',
    url: 'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&proxy_type=socks5&country=all&ssl=all&anonymity=elite&limit=100',
    parser: parseLineList,
    type: 'SOCKS5',
  },
  {
    name: 'ProxyScrape HTTP',
    url: 'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&proxy_type=http&country=NL,DE,SE,FI,FR,CH,GB,US&ssl=all&anonymity=elite&limit=50',
    parser: parseLineList,
    type: 'HTTP',
  },
  {
    name: 'ProxyList SOCKS5',
    url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
    parser: parseLineList,
    type: 'SOCKS5',
  },
  {
    name: 'ProxyList HTTP',
    url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    parser: parseLineList,
    type: 'HTTP',
  },
  {
    name: 'Monosans SOCKS5',
    url: 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
    parser: parseLineList,
    type: 'SOCKS5',
  },
  {
    name: 'HexSS SOCKS5',
    url: 'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
    parser: parseLineList,
    type: 'SOCKS5',
  },
  {
    name: 'Openproxy SOCKS5',
    url: 'https://openproxy.space/list/socks5',
    parser: parseLineList,
    type: 'SOCKS5',
  },
];

// Страны, которые нас интересуют (западные серверы)
const TARGET_COUNTRIES = {
  NL: { name: 'Netherlands 🇳🇱', city: 'Amsterdam', tier: 'free' },
  DE: { name: 'Germany 🇩🇪', city: 'Frankfurt', tier: 'free' },
  SE: { name: 'Sweden 🇸🇪', city: 'Stockholm', tier: 'free' },
  FI: { name: 'Finland 🇫🇮', city: 'Helsinki', tier: 'free' },
  FR: { name: 'France 🇫🇷', city: 'Paris', tier: 'premium' },
  CH: { name: 'Switzerland 🇨🇭', city: 'Zurich', tier: 'premium' },
  US: { name: 'USA 🇺🇸', city: 'New York', tier: 'premium' },
  GB: { name: 'UK 🇬🇧', city: 'London', tier: 'premium' },
  CA: { name: 'Canada 🇨🇦', city: 'Toronto', tier: 'premium' },
  JP: { name: 'Japan 🇯🇵', city: 'Tokyo', tier: 'premium' },
  SG: { name: 'Singapore 🇸🇬', city: 'Singapore', tier: 'premium' },
  PL: { name: 'Poland 🇵🇱', city: 'Warsaw', tier: 'free' },
  UA: { name: 'Ukraine 🇺🇦', city: 'Kyiv', tier: 'free' },
};

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseLineList(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(l))
    .map(l => {
      const [host, portStr] = l.split(':');
      return { host, port: parseInt(portStr) };
    });
}

// ─── Geo lookup ───────────────────────────────────────────────────────────────
const GEO_CACHE = new Map();

async function getCountry(ip) {
  if (GEO_CACHE.has(ip)) return GEO_CACHE.get(ip);

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,status`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await res.json();
    const code = data.status === 'success' ? data.countryCode : null;
    GEO_CACHE.set(ip, code);
    return code;
  } catch {
    GEO_CACHE.set(ip, null);
    return null;
  }
}

// ─── Main Collector ───────────────────────────────────────────────────────────
async function collect() {
  console.log('🤖 FlexiVPN Robot starting...');
  const allProxies = new Map(); // host:port -> { host, port, type }

  // Fetch from all sources
  for (const source of SOURCES) {
    try {
      console.log(`📡 Fetching from ${source.name}...`);
      const res = await fetch(source.url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'FlexiVPN-Robot/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const proxies = source.parser(text);
      console.log(`  ✓ Found ${proxies.length} proxies`);

      for (const p of proxies) {
        const key = `${p.host}:${p.port}`;
        if (!allProxies.has(key)) {
          allProxies.set(key, { ...p, type: source.type });
        }
      }
    } catch (e) {
      console.warn(`  ✗ Failed: ${e.message}`);
    }
  }

  console.log(`\n📊 Total unique proxies: ${allProxies.size}`);

  // Geo-lookup for first 200 proxies to find target countries
  const candidates = [];
  let checked = 0;
  const maxCheck = 200;

  console.log(`\n🌍 Looking up geolocation (max ${maxCheck})...`);

  // Rate limit: ip-api allows 45 req/min free
  const proxiesList = Array.from(allProxies.values());
  const batchSize = 15;

  for (let i = 0; i < Math.min(proxiesList.length, maxCheck); i += batchSize) {
    const batch = proxiesList.slice(i, i + batchSize);

    await Promise.all(batch.map(async (proxy) => {
      const country = await getCountry(proxy.host);
      if (country && TARGET_COUNTRIES[country]) {
        candidates.push({ ...proxy, country });
      }
      checked++;
    }));

    // Rate limit pause
    if (i + batchSize < Math.min(proxiesList.length, maxCheck)) {
      await new Promise(r => setTimeout(r, 1500));
    }

    if (checked % 30 === 0) {
      console.log(`  Checked ${checked}/${Math.min(proxiesList.length, maxCheck)}, found ${candidates.length} candidates`);
    }
  }

  console.log(`\n✅ Found ${candidates.length} target-country proxies`);

  // Build server list
  // Group by country, take best per country
  const byCountry = {};
  for (const p of candidates) {
    if (!byCountry[p.country]) byCountry[p.country] = [];
    byCountry[p.country].push(p);
  }

  const servers = [];
  for (const [country, proxies] of Object.entries(byCountry)) {
    const meta = TARGET_COUNTRIES[country];
    // Take up to 2 per country, prefer SOCKS5
    const sorted = [...proxies].sort((a, b) => {
      if (a.type === 'SOCKS5' && b.type !== 'SOCKS5') return -1;
      if (b.type === 'SOCKS5' && a.type !== 'SOCKS5') return 1;
      return 0;
    });

    const toAdd = sorted.slice(0, 2);
    for (let i = 0; i < toAdd.length; i++) {
      const p = toAdd[i];
      servers.push({
        id: `${country.toLowerCase()}-${i + 1}-${Date.now()}`,
        name: meta.name,
        country,
        city: meta.city,
        host: p.host,
        port: p.port,
        type: p.type,
        tier: meta.tier,
        ping: Math.floor(Math.random() * 80) + 30, // Will be measured on verify step
        load: Math.floor(Math.random() * 60) + 10,
        updated: new Date().toISOString(),
      });
    }
  }

  // Add static fallback servers (always included)
  const fallback = [
    { id: 'nl-static-1', name: 'Netherlands 🇳🇱', country: 'NL', city: 'Amsterdam', host: '45.76.120.100', port: 1080, type: 'SOCKS5', tier: 'free', ping: 45, load: 30 },
    { id: 'de-static-1', name: 'Germany 🇩🇪', country: 'DE', city: 'Frankfurt', host: '157.90.115.200', port: 1080, type: 'SOCKS5', tier: 'free', ping: 38, load: 45 },
    { id: 'fi-static-1', name: 'Finland 🇫🇮', country: 'FI', city: 'Helsinki', host: '95.216.200.100', port: 1080, type: 'SOCKS5', tier: 'free', ping: 55, load: 60 },
  ];

  // Merge: dynamic + fallback (deduplicate by host)
  const dynamicHosts = new Set(servers.map(s => s.host));
  const merged = [...servers, ...fallback.filter(s => !dynamicHosts.has(s.host))];

  // Sort: free first, then by ping
  merged.sort((a, b) => {
    if (a.tier === 'free' && b.tier !== 'free') return -1;
    if (b.tier === 'free' && a.tier !== 'free') return 1;
    return (a.ping || 100) - (b.ping || 100);
  });

  console.log(`\n📝 Writing ${merged.length} servers to ${OUTPUT_FILE}`);
  writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2));
  console.log('✅ Done!');
}

collect().catch(e => {
  console.error('Robot failed:', e);
  process.exit(1);
});
