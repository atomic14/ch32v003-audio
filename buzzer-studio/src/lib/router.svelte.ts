// Simple router for Svelte 5 with path-based routing (hash fallback)
function getCurrentPath(): string {
  // Check if we have a hash route (fallback for compatibility)
  if (window.location.hash) {
    return window.location.hash.slice(1);
  }
  // Otherwise use pathname
  return window.location.pathname;
}

export const currentPath = $state({ value: getCurrentPath() });

// Listen to both hash changes and popstate (browser back/forward)
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    currentPath.value = getCurrentPath();
  });

  window.addEventListener('popstate', () => {
    currentPath.value = getCurrentPath();
  });
}

export function navigate(path: string) {
  // Use History API for path-based routing
  window.history.pushState({}, '', path);
  currentPath.value = path;
}
