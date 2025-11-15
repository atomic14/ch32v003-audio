// Simple hash-based router for Svelte 5
export const currentPath = $state({ value: window.location.hash.slice(1) || '/' });

// Listen to hash changes
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    currentPath.value = window.location.hash.slice(1) || '/';
  });
}

export function navigate(path: string) {
  window.location.hash = path;
}
