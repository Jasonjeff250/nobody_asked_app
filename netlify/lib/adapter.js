function createRequest(event) {
  let body = event.body || {};
  if (typeof body === 'string' && body) {
    try { body = JSON.parse(body); } catch { /* Keep non-JSON request bodies unchanged. */ }
  }

  return {
    method: event.httpMethod || 'GET',
    body,
    query: event.queryStringParameters || {},
    headers: event.headers || {}
  };
}

function createResponse() {
  const response = {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '',
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(value) {
      response.headers['Content-Type'] = 'application/json';
      response.body = JSON.stringify(value);
      return response;
    },
    send(value) {
      response.headers['Content-Type'] = 'text/html; charset=utf-8';
      response.body = String(value);
      return response;
    },
    redirect(url) {
      response.statusCode = 302;
      response.headers.Location = url;
      response.body = '';
      return response;
    }
  };

  return response;
}

async function run(apiHandler, event) {
  const response = createResponse();
  await apiHandler(createRequest(event), response);
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body
  };
}

module.exports = { run };
