// CloudFront Function (viewer-request): canonical host + explicit SPA routes.
// Unknown paths are intentionally left untouched so the distribution's
// custom error response can return the real 404 page with HTTP 404.

function querySuffix(querystring) {
  var parts = [];
  for (var key in querystring) {
    if (!Object.prototype.hasOwnProperty.call(querystring, key)) continue;
    var item = querystring[key];
    if (item.multiValue) {
      for (var i = 0; i < item.multiValue.length; i += 1) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.multiValue[i].value));
      }
    } else {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(item.value || ''));
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: location },
      'cache-control': { value: 'public, max-age=3600' },
    },
  };
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  var suffix = querySuffix(request.querystring || {});

  if (host === 'www.quantumchess.ninja') {
    var canonicalPath = request.uri === '/index.html'
      ? '/'
      : request.uri === '/puzzle.html' || request.uri === '/puzzle/' ? '/puzzle' : request.uri;
    return redirect('https://quantumchess.ninja' + canonicalPath + suffix);
  }

  if (request.uri === '/index.html') {
    return redirect('https://quantumchess.ninja/' + suffix);
  }

  if (request.uri === '/puzzle.html' || request.uri === '/puzzle/') {
    return redirect('https://quantumchess.ninja/puzzle' + suffix);
  }

  if (request.uri === '/play' || request.uri === '/play/'
      || request.uri === '/review' || request.uri === '/review/'
      || request.uri === '/profile' || request.uri === '/profile/') {
    request.uri = '/index.html';
  }

  if (request.uri === '/puzzle') {
    request.uri = '/puzzle.html';
  }

  return request;
}
