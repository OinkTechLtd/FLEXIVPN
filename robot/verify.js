#!/usr/bin/env node
// FlexiVPN Robot — Server Verifier
// Проверяет работоспособность серверов и обновляет пинг

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createConnection } from 'net';

const SERVERS_FILE = resolve('../servers.json');
const TIMEOUT_MS = 5000;
const CONCURRENCY = 20;

async function checkProxy(host, port) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = createConnection({ host, port, timeout: TIMEOUT_MS });

    socket.on('connect', () => {
      const ping = Date.now() - start;
      socket.destroy();
      resolve({ alive: true, ping });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ alive: false, ping: 9999 });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ alive: false, ping: 9999 });
    });
  });
}

async function verify() {
  let servers;
  try {
    servers = JSON.parse(readFileSync(SERVERS_FILE, 'utf-8'));
  } catch (e) {
    console.log('No servers file found, skipping verify');
    return;
  }

  console.log(`🔍 Verifying ${servers.length} servers (concurrency: ${CONCURRENCY})...`);

  const results = [];
  let alive = 0, dead = 0;

  // Process in batches
  for (let i = 0; i < servers.length; i += CONCURRENCY) {
    const batch = servers.slice(i, i + CONCURRENCY);
    const checked = await Promise.all(
      batch.map(async (server) => {
        const { alive: isAlive, ping } = await checkProxy(server.host, server.port);
        return { ...server, ping: isAlive ? ping : 9999, alive: isAlive };
      })
    );

    for (const s of checked) {
      if (s.alive) alive++;
      else dead++;
      results.push(s);
    }

    console.log(`  Batch ${Math.floor(i / CONCURRENCY) + 1}: ${alive} alive, ${dead} dead so far`);
  }

  // Keep alive servers + some dead ones as fallback
  const aliveServers = results.filter(s => s.alive);
  const deadFallbacks = results.filter(s => !s.alive).slice(0, 3); // Keep some dead as backup

  // Remove 'alive' field before saving
  const toSave = [...aliveServers, ...deadFallbacks].map(({ alive, ...s }) => s);

  // Sort by tier then ping
  toSave.sort((a, b) => {
    if (a.tier === 'free' && b.tier !== 'free') return -1;
    if (b.tier === 'free' && a.tier !== 'free') return 1;
    return (a.ping || 999) - (b.ping || 999);
  });

  console.log(`\n✅ Verification complete: ${aliveServers.length} alive, ${dead} dead`);
  console.log(`💾 Saving ${toSave.length} servers`);
  writeFileSync(SERVERS_FILE, JSON.stringify(toSave, null, 2));
}

verify().catch(e => {
  console.error('Verify failed:', e);
  // Don't exit with error — allow commit even if verify fails
});
