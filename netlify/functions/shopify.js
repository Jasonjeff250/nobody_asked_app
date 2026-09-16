const apiHandler = require('../../api/shopify');
const { run } = require('../lib/adapter');

exports.handler = (event) => run(apiHandler, event);
