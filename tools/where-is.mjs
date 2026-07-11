#!/usr/bin/env node
// tools/where-is.mjs
//
// Thin wrapper around graphify's graph.json for subagent
// discoverability. Replaces grep-for-X with a structural lookup +
// blast-radius edges + suggested-next queries.
//
// Designed to prevent the "grep returns 8 files, model picks file 4"
// distractor-interference failure mode (Chroma 2025).
//
// Usage: node tools/where-is.mjs "<query>"
// Exit 0 with results, exit 1 if graph missing, exit 2 if query empty.
//
// Graph schema (real, verified against graphify-out/graph.json):
//   graph.nodes[]: { id, label, file_type, source_file,
//                     source_location, community (int) }
//   graph.links[]: { source, target, relation, confidence,
//                     confidence_score, weight, source_file }
//   graph.hyperedges[]: { id, label, nodes[] (list of node ids) }

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GRAPH = resolve('graphify-out/graph.json');

const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Usage: node tools/where-is.mjs "<query>"');
  process.exit(2);
}
if (!existsSync(GRAPH)) {
  console.error(`No graph at ${GRAPH}.`);
  console.error('Run: npm run graph   (wraps \`graphify --update\`).');
  process.exit(1);
}

const graph = JSON.parse(readFileSync(GRAPH, 'utf8'));
const nodes = graph.nodes || [];
const links = graph.links || [];

// Lowercase contains-match on label + id + source_file.
const q = query.toLowerCase();
const matches = nodes.filter(n => {
  const hay = `${n.id || ''} ${n.label || ''} ${n.source_file || ''}`.toLowerCase();
  return hay.includes(q);
});

if (matches.length === 0) {
  console.log(`No nodes match "${query}". Try a broader query or run \`npm run graph\`.`);
  process.exit(0);
}

// Group by community id. graphify doesn't ship community_labels at root
// (verified 2026-07-10), so we render "Community N" until labels exist.
const byComm = new Map();
for (const m of matches) {
  const c = String(m.community ?? '?');
  if (!byComm.has(c)) byComm.set(c, []);
  byComm.get(c).push(m);
}

console.log(`Found ${matches.length} node(s) matching "${query}":\n`);
for (const [c, ms] of byComm) {
  console.log(`## Community ${c}  (${ms.length})`);
  for (const m of ms) {
    console.log(`  - ${m.label || m.id}   [id=${m.id}]   source=${m.source_file || '?'}`);
  }
  console.log();
}

// Blast-radius: links whose source OR target is in matches and
// confidence is EXTRACTED. Cap at 25 to keep output bounded.
const matchIds = new Set(matches.map(m => m.id));
const blast = links.filter(e =>
  matchIds.has(e.source) && matchIds.has(e.target) &&
  e.confidence === 'EXTRACTED'
).slice(0, 25);
if (blast.length) {
  console.log(`## Blast-radius edges (EXTRACTED, ${blast.length} shown)`);
  for (const e of blast) {
    console.log(`  - ${e.source}  --[${e.relation || 'related'}, conf=${e.confidence || '?'}]-->  ${e.target}`);
  }
  console.log();
}

// Suggested next: highest-degree connection to a non-matching node.
const deg = new Map();
for (const e of links) {
  for (const k of [e.source, e.target]) deg.set(k, (deg.get(k) || 0) + 1);
}
const suggestions = [];
const seen = new Set();
for (const m of matches) {
  for (const e of links) {
    let otherId, otherNode;
    if (e.source === m.id && !matchIds.has(e.target)) {
      otherId = e.target;
      otherNode = nodes.find(n => n.id === e.target);
    } else if (e.target === m.id && !matchIds.has(e.source)) {
      otherId = e.source;
      otherNode = nodes.find(n => n.id === e.source);
    } else continue;
    if (otherNode) {
      const k = `${m.id}->${otherId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      suggestions.push({
        from: m.label || m.id,
        target: otherNode.label || otherNode.id,
        rel: e.relation || 'related',
      });
      if (suggestions.length >= 5) break;
    }
  }
  if (suggestions.length >= 5) break;
}
if (suggestions.length) {
  console.log('## Suggested next queries');
  for (const s of suggestions) {
    console.log(`  - node tools/where-is.mjs "${s.target}"   (linked from ${s.from} via ${s.rel})`);
  }
}
