/* Register the service worker at the GitHub Pages project path. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'})
      .then(reg => { reg.update().catch(() => {}); })
      .catch(error => console.warn('МЯУ: offline mode unavailable', error));
  });
}
