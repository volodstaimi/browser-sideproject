(function () {
  const params = new URLSearchParams(location.search);
  const code = params.get('code') || '';
  const desc = params.get('desc') || '';
  const failedUrl = params.get('url') || '';

  const REASONS = {
    '-105': ["This site can't be reached", "The server address couldn't be found (DNS error). Check the address for typos."],
    '-106': ['No internet connection', 'You appear to be offline. Check your network connection and try again.'],
    '-21': ['No internet connection', 'Your network changed or disconnected. Try again.'],
    '-7': ['The connection timed out', 'The site took too long to respond.'],
    '-2': ['This page failed to load', 'A network error occurred while loading the page.'],
    '-501': ['Your connection is not private', 'This site sent an insecure response.'],
    '-200': ['Your connection is not secure', 'There is a problem with this site’s security certificate.'],
    '-118': ['The connection timed out', 'The site took too long to respond.'],
    '-137': ["This site can't be reached", "The server address couldn't be resolved."],
  };

  const friendly = REASONS[code] || ["This page isn't working", desc || 'Aether could not load the page.'];
  document.getElementById('title').textContent = friendly[0];
  document.getElementById('reason').textContent = friendly[1];
  document.getElementById('url').textContent = failedUrl;
  document.getElementById('code').textContent = code ? `Error ${code}${desc ? ' (' + desc + ')' : ''}` : '';

  document.getElementById('reload').addEventListener('click', () => {
    if (failedUrl) location.href = failedUrl; else location.reload();
  });
}());
