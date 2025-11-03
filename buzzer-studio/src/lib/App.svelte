<script lang="ts">
  import SoundEffects from './tools/SoundEffects.svelte';
  import MidiConverter from './tools/MidiConverter.svelte';
  import AdpcmConverter from './tools/AdpcmConverter.svelte';
  import LpcEncoder from './tools/LpcEncoder.svelte';
  import LpcPlayer from './tools/LpcPlayer.svelte';

  type TabId = 'midi-converter' | 'sound-effects' | 'adpcm-converter' | 'lpc-encoder' | 'lpc-player';

  let activeTab = $state<TabId>('midi-converter');

  const tabs = [
    { id: 'midi-converter' as TabId, icon: '🎵', label: 'MIDI Converter', component: MidiConverter },
    { id: 'sound-effects' as TabId, icon: '🔊', label: 'Sound Effects', component: SoundEffects },
    { id: 'adpcm-converter' as TabId, icon: '📦', label: 'ADPCM Converter', component: AdpcmConverter },
    { id: 'lpc-encoder' as TabId, icon: '🎙️', label: 'Talkie (LPC) Encoder', component: LpcEncoder },
    { id: 'lpc-player' as TabId, icon: '🤖', label: 'Talkie (LPC) Player', component: LpcPlayer },
  ];
</script>

<div class="app-container">
  <header class="app-header">
    <h1>🔊 Buzzer Studio</h1>
    <p class="app-subtitle">Embedded Audio Development Tools</p>
  </header>

  <nav class="tab-nav">
    {#each tabs as tab}
      <button
        class="tab-button"
        class:active={activeTab === tab.id}
        onclick={() => activeTab = tab.id}
      >
        <span class="tab-icon">{tab.icon}</span>
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </nav>

  <main class="tab-content">
    {#each tabs as tab}
      {#if activeTab === tab.id}
        <div class="tab-pane active">
          {#if tab.component === MidiConverter}
            <MidiConverter />
          {:else if tab.component === SoundEffects}
            <SoundEffects />
          {:else if tab.component === AdpcmConverter}
            <AdpcmConverter />
          {:else if tab.component === LpcEncoder}
            <LpcEncoder />
          {:else if tab.component === LpcPlayer}
            <LpcPlayer />
          {/if}
        </div>
      {/if}
    {/each}
  </main>

  <footer class="app-footer">
    <div class="footer-links">
      <a href="https://github.com/atomic14/ch32v003-music" target="_blank" rel="noopener noreferrer">YouTube</a>
      <span class="separator">•</span>
      <a href="https://www.atomic14.com" target="_blank" rel="noopener noreferrer">Blog</a>
      <span class="separator">•</span>
      <a href="https://github.com/atomic14" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  </footer>
</div>
