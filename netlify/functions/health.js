const apiHandler = require('../../api/health');
const { run } = require('../lib/adapter');

exports.handler = (event) => run(apiHandler, event);
