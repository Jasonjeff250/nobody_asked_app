module.exports = async function handler(request, response) {
  response.status(200).json({
    ok: true,
    name: 'FrictionMap',
    status: 'ready',
    version: '1.0.0',
    message: 'API layer is available for future backend integration.'
  });
};
