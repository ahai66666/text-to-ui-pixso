function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function words(value) {
  return normalize(value).split(' ').filter(Boolean);
}

function hasHan(value) {
  return /\p{Script=Han}/u.test(value);
}

function routeTerms(route) {
  return [...new Set([route.id, ...(route.aliases ?? []), ...(route.domains ?? [])]
    .map(normalize)
    .filter(Boolean))];
}

function phraseOccurrences(queryWords, termWords) {
  const positions = [];
  if (!termWords.length || termWords.length > queryWords.length) return positions;
  for (let start = 0; start <= queryWords.length - termWords.length; start += 1) {
    if (termWords.every((word, offset) => queryWords[start + offset] === word)) {
      positions.push(Array.from({ length: termWords.length }, (_, offset) => start + offset));
    }
  }
  return positions;
}

export function findTaskRouteCandidates(query, routes) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { kind: 'unmatched', candidates: [] };

  const termsByRoute = routes.map((route) => ({ route, terms: routeTerms(route) }));
  const exact = termsByRoute
    .filter(({ terms }) => terms.includes(normalizedQuery))
    .map(({ route }) => route);
  if (exact.length) return { kind: 'exact', candidates: exact };

  const queryWords = words(normalizedQuery);
  const completeMatches = new Map();
  const consumedPositions = new Set();

  for (const { route, terms } of termsByRoute) {
    for (const term of terms) {
      if (hasHan(term)) {
        const compactQuery = normalizedQuery.replaceAll(' ', '');
        const compactTerm = term.replaceAll(' ', '');
        if (compactQuery.includes(compactTerm)) {
          completeMatches.set(route.id, route);
          for (let index = 0; index < queryWords.length; index += 1) {
            if (queryWords[index].includes(compactTerm)) consumedPositions.add(index);
          }
        }
        continue;
      }
      const occurrences = phraseOccurrences(queryWords, words(term));
      if (!occurrences.length) continue;
      completeMatches.set(route.id, route);
      for (const occurrence of occurrences) for (const position of occurrence) consumedPositions.add(position);
    }
  }

  const partialMatches = new Map();
  for (let index = 0; index < queryWords.length; index += 1) {
    if (consumedPositions.has(index)) continue;
    const token = queryWords[index];
    if (hasHan(token) || token.length < 4) continue;
    for (const { route, terms } of termsByRoute) {
      if (terms.some((term) => !hasHan(term) && words(term).includes(token))) {
        partialMatches.set(route.id, route);
      }
    }
  }

  const candidates = new Map([...completeMatches, ...partialMatches]);
  if (!candidates.size) return { kind: 'unmatched', candidates: [] };
  return {
    kind: completeMatches.size ? 'phrase' : 'partial',
    candidates: routes.filter((route) => candidates.has(route.id))
  };
}

export function selectTaskRoute(query, routes, explicitRouteId) {
  const match = findTaskRouteCandidates(query, routes);
  if (explicitRouteId) {
    const normalizedId = normalize(explicitRouteId);
    const route = routes.find((candidate) => normalize(candidate.id) === normalizedId);
    if (!route) {
      throw new Error(`Unknown task route '${explicitRouteId}'. Use a canonical task route ID: ${routes.map((item) => item.id).join(', ')}.`);
    }
    if (match.candidates.length && !match.candidates.some((candidate) => candidate.id === route.id)) {
      throw new Error(`Task route '${route.id}' conflicts with task '${query}'. Matching candidates: ${match.candidates.map((item) => item.id).join(', ')}.`);
    }
    return { route, source: 'explicit-task-route', candidates: match.candidates };
  }

  if (match.candidates.length > 1) {
    throw new Error(`Ambiguous task route for '${query}'. Candidates: ${match.candidates.map((item) => item.id).join(', ')}. Rerun with --task-route <route-id>.`);
  }
  return { route: match.candidates[0] ?? null, source: match.kind, candidates: match.candidates };
}
