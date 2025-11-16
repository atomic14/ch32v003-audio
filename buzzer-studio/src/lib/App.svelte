<script lang="ts">
  import { currentPath, navigate } from './router.svelte';
  import SoundEffects from './tools/SoundEffects.svelte';
  import MidiConverter from './tools/MidiConverter.svelte';
  import AdpcmConverter from './tools/AdpcmConverter.svelte';
  import LpcEncoder from './tools/LpcEncoder.svelte';
  import LpcPlayer from './tools/LpcPlayer.svelte';

  // Declare gtag function for Google Analytics
  declare global {
    interface Window {
      gtag?: (command: string, ...args: unknown[]) => void;
    }
  }

  const tabs = [
    {
      path: '/midi-converter',
      icon: '🎵',
      label: 'MIDI Converter',
    },
    {
      path: '/sound-effects',
      icon: '🔊',
      label: 'Sound Effects',
    },
    {
      path: '/adpcm-converter',
      icon: '📦',
      label: 'ADPCM Converter',
    },
    {
      path: '/lpc-encoder',
      icon: '🎙️',
      label: 'Talkie (LPC) Encoder',
    },
    {
      path: '/lpc-player',
      icon: '🤖',
      label: 'Talkie (LPC) Player',
    },
  ];

  function handleNavClick(event: MouseEvent, path: string) {
    event.preventDefault();
    navigate(path);
  }

  // Track route changes with Google Analytics
  $effect(() => {
    const path = currentPath.value;

    // Send pageview to Google Analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: document.title,
        page_location: window.location.href,
      });
    }
  });
</script>

<div class="app-container">
  <header class="app-header">
    <h1>🔊 Buzzer Studio</h1>
    <p class="app-subtitle">Embedded Audio Development Tools</p>
  </header>

  <nav class="tab-nav">
    {#each tabs as tab}
      <a
        href={tab.path}
        class="tab-button"
        class:active={currentPath.value === tab.path ||
          (currentPath.value === '/' && tab.path === '/midi-converter')}
        onclick={(e) => handleNavClick(e, tab.path)}
      >
        <span class="tab-icon">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
      </a>
    {/each}
  </nav>

  <main class="tab-content">
    <div class="tab-pane active">
      {#if currentPath.value === '/sound-effects'}
        <SoundEffects />
      {:else if currentPath.value === '/adpcm-converter'}
        <AdpcmConverter />
      {:else if currentPath.value === '/lpc-encoder'}
        <LpcEncoder />
      {:else if currentPath.value === '/lpc-player'}
        <LpcPlayer />
      {:else}
        <MidiConverter />
      {/if}
    </div>
  </main>

  <footer class="app-footer">
    <div class="footer-links">
      <a href="https://github.com/atomic14/ch32v003-music" target="_blank" rel="noopener noreferrer"
        >YouTube</a
      >
      <span class="separator">•</span>
      <a href="https://www.atomic14.com" target="_blank" rel="noopener noreferrer">Blog</a>
      <span class="separator">•</span>
      <a href="https://github.com/atomic14" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  </footer>
</div>
