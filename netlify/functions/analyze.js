const apiHandler = require('../../api/analyze');
const { run } = require('../lib/adapter');

exports.handler = (event) => run(apiHandler, event);
