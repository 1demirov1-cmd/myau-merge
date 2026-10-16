/* Register the service worker at the GitHub Pages project path. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope:'./'})
      .catch(error => console.warn('МЯУ: offline mode unavailable', error));
  });
}
