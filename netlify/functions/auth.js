const apiHandler = require('../../api/auth');
const { run } = require('../lib/adapter');

exports.handler = (event) => run(apiHandler, event);