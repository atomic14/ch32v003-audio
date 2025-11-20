<script lang="ts">
  interface Props {
    videoId: string;
    title?: string;
  }

  let { videoId, title = 'See it in action' }: Props = $props();
</script>

<details class="video-demo">
  <summary class="video-demo-summary">{title}</summary>
  <div class="video-demo-content">
    <div class="video-container">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </div>
    <p class="video-caption">Watch a demonstration of the LPC player running on a 10¢ chip.</p>
  </div>
</details>

<style>
  .video-demo {
    background: #2a2a4e;
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .video-demo-summary {
    cursor: pointer;
    font-weight: 500;
    font-size: 1rem;
    user-select: none;
    padding: 0.25rem 0;
  }

  .video-demo-summary:hover {
    color: #00ff88;
  }

  .video-demo-content {
    margin-top: 1rem;
  }

  .video-container {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%; /* 16:9 aspect ratio */
    height: 0;
    overflow: hidden;
    border-radius: 4px;
    background: #000;
  }

  .video-container iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .video-caption {
    margin: 1rem 0 0 0;
    font-size: 0.9rem;
    color: #888;
    text-align: center;
    font-style: italic;
  }
</style>
