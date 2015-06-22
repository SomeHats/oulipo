var Parser = require('../lib/Parser'),
    parser = new Parser();

function parse(str) {
  try {
    return parser.parse(str);
  } catch (e) {
    return {error: e.message};
  }
}

module.exports = parse;
