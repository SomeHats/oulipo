CodeMirror.defineMode('oulipo', function(cmCfg, modeCfg) {
  var indentUnit = cmCfg.indentUnit;
  var debug = false;

  var builtins = 'true false and or not is isnt'.split(' ');

  function contains(needle, haystack) {
    for (var i = 0, l = haystack.length; i < l; i++) {
      if (needle === haystack[i]) return true;
    }
    return false;
  }

  function parseDialogue(indentation, next, s, state) {
    if (s.indentation() < indentation) {
      state.f = next;
      return call(state.f, s, state);
    }
    var ch = s.next();
    if (ch === '#') {
      s.skipToEnd();
      state.lastLineType = 'header';
      return 'header';
    } else if (ch === '\n') {
      return null;
    } else {
      return parseStatement(ch, bind(parseDialogue, indentation, next), s, state);
    }
  }

  function parseStatement(ch, next, s, state) {
    if (ch.match(/[A-Z]/)) {
      return parseLineOrChoice(next, s, state);
    } else if (ch.match(/[a-z]/)) {
      return parseInstruction(next, s, state);
    } else if (ch === '[') {
      return parseNote(next, s, state);
    } else {
      return "error";
    }
  }

  function parseLineOrChoice(next, s, state) {
    consumeName(s);
    state.lastLineType = '';
    state.f = function(s, state) {
      s.eatSpace();
      var nextChar = s.next();
      if (nextChar === ':') {
        return parseLineOrChoiceContents(next, s, state);
      } else if (nextChar === '[') {
        return parseEmotion(function(s, state) {
          if (s.next() === ':') {
            return parseLineOrChoiceContents(next, s, state);
          } else {
            s.skipToEnd();
            state.f = next;
            return 'error';
          }
        }, s, state);
      } else {
        s.skipToEnd();
        state.f = next;
        return 'error';
      }
    };
    return 'variable-2';
  }

  function parseLineOrChoiceContents(next, s, state) {
    s.eatSpace();
    if (s.eol()) {
      s.next();
      state.lastLineType = 'choice-start';
      state.f = parseChoiceList(s.indentation(), next);
    } else {
      state.lastLineType = 'line';
      state.f = function(s, state) {
        return parseString(next, s, state);
      };
    }
    return null;
  }

  function parseChoiceList(baseIndent, next) {
    var thisFn = function(s, state) {
      var ch = s.peek();
      if (s.indentation() > baseIndent && ch.match(/[\-\*\+]/)) {
        s.next();
        s.eatSpace();
        state.f = bind(parseChoice, thisFn);
        return null;
      } else {
        state.f = next;
        return call(state.f, s, state);
      }
    };
    return thisFn;
  }

  function parseChoice(next, s, state) {
    var ch = s.peek();
    if (ch === '(') {
      return parseCondition(bind(parseChoice, next), s, state);
    } else if (ch === '[') {
      s.next();
      return parseEmotion(bind(parseChoice, next), s, state);
    } else if (ch === '\'' || ch === '"') {
      // quoted string
      s.next();
      s.eatSpace();
      if (s.eol()) {
        state.lastLineType = 'choice-continued';
      } else {
        state.lastLineType = 'choice-next';
      }
      return parseQuotedString(ch, bind(parseChoiceEnd, next), s, state);
    } else {
      // implicit string
      while (!s.match('->', false) && !s.eol()) {
        s.next();
      }

      if (s.match('->', false)) {
        state.lastLineType = 'choice-next';
      } else {
        state.lastLineType = 'choice-continued';
      }
      state.f = bind(parseChoiceEnd, next);
      return 'implicit-string';
    }
  }

  function parseChoiceEnd(next, s, state) {
    if (s.sol() || s.indentation() === s.column()) {
      state.lastLineType = 'choice-continued';
      state.f = bind(parseChoiceNext, next);
      return call(state.f, s, state);
    } else if (s.match('->')) {
      state.lastLineType = 'choice-next';
      s.eatSpace();
      state.f = function(s, state) {
        consumeIdentifier(s);
        state.f = endLine(next);
        return 'variable-3';
      };
      return 'builtin';
    } else {
      state.lastLineType = 'choice-continued';
      state.f = bind(parseChoiceNext, next);
      if (s.eol()) {
        s.next();
        return null;
      } else {
        s.skipToEnd();
        return 'error';
      }
    }
  }

  function parseChoiceNext(next, s, state) {
    s.eatSpace();
    if(s.peek().match(/[\-\*\+]/)) {
      state.f = next;
    } else {
      state.f = bind(parseDialogue, s.indentation(), function(s, state) {
        return call(next, s, state);
      });
    }
    return call(state.f, s, state);
  }

  function parseInstruction(next, s, state) {
    state.lastLineType = '';
    consumeIdentifier(s);
    var name = s.current();
    s.eatSpace();
    if (instructions[name]) {
      state.f = bind(instructions[name], next);
      return 'builtin';
    } else {
      s.skipToEnd();
      return 'builtin error';
    }
  }

  var instructions = {
    set: function (next, s, state) {
      s.eatSpace();
      if (consumeIdentifier(s)) {
        s.eatSpace();
        if (s.eol()) {
          state.f = next;
        } else {
          state.f = function(s, state) {
            s.eatSpace();
            if (s.match(/^(\=|\-\=|\+\=|\?\=)/)) {
              s.eatSpace();
              state.f = function(s, state) {
                return parseValue(next, s, state);
              };
              return 'operator';
            } else {
              s.skipToEnd();
              state.f = next;
              return 'operator error';
            }
          };
        }
        return 'variable';
      } else {
        return 'variable error';
      }
    },

    go: function(next, s, state) {
      s.eatSpace();
      if (consumeIdentifier(s)) {
        state.f = endLine(next);
        return 'variable-3';
      } else {
        state.f = next;
        s.skipToEnd();
        return 'variable-3 error';
      }
    },

    exec: function(next, s, state) {
      s.eatSpace();
      return parseString(endLine(next), s, state);
    },

    branch: function(next, s, state) {
      state.lastLineType = 'branch';
      s.skipToEnd();
      state.f = function(s, state) {
        state.f = bind(parseBranchChoice, s.indentation(), next);
        return call(state.f, s, state);
      };
      return null;
    },

    continue: function(next, s, state) {
      s.eatSpace();
      state.f = endLine(next);
      return null;
    }
  };

  instructions.goto = instructions.go;

  function parseBranchChoice(baseIndent, next, s, state) {
    s.eatSpace();
    if (s.indentation() < baseIndent || !s.peek().match(/[\-\*\+]/)) {
      state.f = next;
      return call(state.f, s, state);
    }

    s.next(); // consume bullet point
    s.eatSpace();
    state.f = function(s, state) {
      if (s.peek() !== '(') {
        s.skipToEnd();
        state.f = bind(parseBranchChoice, baseIndent, next);
        return 'error';
      }

      return parseCondition(function(s, state) {
        s.eatSpace();
        // return parseStatement(s.next(), bind(parseBranchChoice, baseIndent, next), s, state);
        return parseStatement(s.next(), function(s, state) {
          s.eatSpace();
          if (s.indentation() > baseIndent) {
            state.f = bind(parseDialogue, s.indentation(), bind(parseBranchChoice, baseIndent, next));
          } else {
            state.f = bind(parseBranchChoice, baseIndent, next);
          }
          return call(state.f, s, state);
        }, s, state);
      }, s, state);
    };
    return null;
  }

  function parseNote(next, s, state) {
    state.lastLineType = '';
    if (!state.noteDepth) {
      state.noteDepth = 1;
    }
    var ch;
    while (!s.eol()) {
      ch = s.next();
      if (ch === '[') state.noteDepth++;
      if (ch === ']') state.noteDepth--;
      if (state.noteDepth < 1) {
        state.noteDepth = undefined;
        state.f = endLine(next);
        return 'comment';
      }
    }
    state.f = bind(parseNote, next);
    return 'comment';
  }

  function parseCondition(next, s, state) {
    s.next();
    s.eatSpace();
    state.f = function(s, state) {
      consumeIdentifier(s);
      var id = s.current().trim();
      if (id === 'if' || id === 'unless') {
        state.f = bind(parseExpression, '(', ')', 1, next);
        return 'builtin';
      } else if (id === 'default') {
        state.f = function(s, state) {
          s.eatSpace();
          state.f = next;
          if (s.next() === ')') {
            s.eatSpace();
            return null;
          } else {
            if (!s.skipTo(')'))  s.skipToEnd();
            s.next();
            s.eatSpace();
            return 'error';
          }
        };
        return 'builtin';
      } else {
        if (!s.skipTo(')')) s.skipToEnd();
        s.next();
        s.eatSpace();
        state.f = next;
        return 'error';
      }
    };
    return null;
  }

  function parseEmotion(next, s, state) {
    state.f = function(s, state) {
      consumeName(s);
      s.eatSpace();
      state.f = function(s, state) {
        state.f = next;
        if (s.next() === ']') {
          s.eatSpace();
          return null;
        } else {
          return 'error';
        }
      };
      return 'qualifier';
    };
    return null;
  }

  function consumeName(s) {
    s.eatWhile(/[a-zA-Z0-9_-]/);
  }

  function parseExpression(open, close, depth, next, s, state) {
    s.eatSpace();
    var ch = s.peek();
    if (ch === open) {
      depth++;
      s.next();
      state.f = bind(parseExpression, open, close, depth, next);
      return null;
    } else if (ch === close) {
      depth--;
      s.next();
      if (depth === 0) {
        s.eatSpace();
        state.f = next;
      } else {
        state.f = bind(parseExpression, open, close, depth, next);
      }
      return null;
    } else if (s.eatWhile(/[\=\+\-\*\?]/)) {
      return 'operator';
    } else {
      return parseValue(bind(parseExpression, open, close, depth, next), s, state);
    }
  }

  function parseValue(next, s, state) {
    var ch = s.next();
    if (!ch) {
      state.f = next;
      return null;
    }

    if (ch.match(/[0-9\-\.]/)) {
      state.f = next;
      consumeNumber(s);
      return 'number';
    } else if (ch === '\'' || ch === '"') {
      return parseQuotedString(ch, next, s, state);
    } else if (ch.match(/[a-zA-Z_-]/)) {
      consumeIdentifier(s);
      var id = s.current().trim();
      state.f = next;
      if (contains(id, builtins)) {
        return 'builtin';
      } else {
        return 'variable';
      }
    } else {
      state.f = next;
      s.skipToEnd();
      return 'error';
    }
  }

  function consumeNumber(s) {
    s.eatWhile(/[0-9\.\-]/);
  }

  function parseString(next, s, state) {
    var ch = s.next();
    if (ch === '\'' || ch === '"') {
      return parseQuotedString(ch, next, s, state);
    } else {
      s.skipToEnd();
      state.f = next;
      return 'implicit-string';
    }
  }

  function parseQuotedString(quote, next, s, state) {
    var ch;
    while (!s.eol()) {
      ch = s.next();
      if (ch === '\\') {
        s.next();
        continue;
      }
      if (ch === quote) {
        state.f = next;
        return 'string';
      }
    }
    state.f = bind(parseQuotedString, quote, next);
    return 'string';
  }

  function consumeIdentifier(s) {
    return s.eatWhile(/[a-zA-Z0-9\.\-\_]/);
  }

  function endLine(next) {
    return function(s, state) {
      s.eatSpace();
      state.f = next;
      if (s.sol() || s.column() === s.indentation()) {
        return call(state.f, s, state);
      } else if (s.eol()) {
        s.next();
        return null;
      } else {
        s.skipToEnd();
        s.next();
        return 'error';
      }
    };
  }

  function bind(fn) {
    var args = [].slice.call(arguments, 1);
    return {
      fn: fn,
      args: args
    };
  }

  function call(f) {
    var args = [].slice.call(arguments, 1),
      res;
    if (typeof f === 'function') {
      res = f.apply(null, args);
    } else {
      res = f.fn.apply(null, f.args.concat(args));
    }

    if (debug) console.log('call', f, res);
    return res;
  }

  var mode = {
    startState: function() {
      return {
        f: bind(parseDialogue, 0, function(){}),
        lastIndent: 0,
        lastLineType: ''
      };
    },
    copyState: function(s) {
      return {
        f: s.f,
        noteDepth: s.noteDepth,
        lastIndent: s.lastIndent,
        lastLineType: s.lastLineType
      };
    },
    token: function(s, state) {
      if (s.sol() && s.eatSpace()) {
        return null;
      }

      if (debug) console.log('----------------------------------------');
      var f = state.f;
      var res = call(state.f, s, state);
      if (debug) console.log('token:', '"' + s.current() + '" -> ' + res + ', "' + s.string + '", lastLineType:', state.lastLineType, f, state);
      state.lastIndent = s.indentation();
      return res;
    },
    indent: function(state, line) {
      if (debug) console.log('indent', state, line, state);
      if (state.lastLineType === 'choice-start' || state.lastLineType === 'branch' || state.lastLineType === 'choice-continued') {
        return state.lastIndent + indentUnit;
      }

      if (state.lastLineType === 'choice-next' && !line.match(/^[ \t]*[\-\+\*]/)) {
        return state.lastIndent - indentUnit;
      }

      return state.lastIndent;
    },
    electricInput: /^[ \t]*[\-\*\+]$/
  };

  return mode;
});
