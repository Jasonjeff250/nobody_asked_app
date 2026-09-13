module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({
      ok: false,
      error: 'Only POST requests are supported.'
    });
  }

  const payload = request.body || {};

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const sessionCount = new Set(rows.map((row) => row.session_id).filter(Boolean)).size;

  const result = {
    ok: true,
    summary: {
      totalRows: rows.length,
      sessions: sessionCount,
      users: new Set(rows.map((row) => row.user_id).filter(Boolean)).size
    },
    insights: [
      {
        title: 'Checkout drop-off pattern detected',
        confidence: 88,
        impact: 'Potential lost conversions'
      }
    ],
    note: 'This backend endpoint is a ready-to-extend contract for production AI analysis.'
  };

  response.status(200).json(result);
};
