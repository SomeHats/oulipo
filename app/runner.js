var $runner = $('#runner'),
    $editor = $('#editor'),
    $runButton = $('.button-run'),
    $stopButton = $('.button-stop'),
    $messageList = $('#runner .messages'),
    $state = $('.runner-data pre'),
    $choiceList = $('.runner-choices'),
    $choiceListPanel = $('.runner-choices-panel'),
    Promise = require('bluebird');

var formatters = {
  line: function(node) {
    return '<div class="line-author">' + node.name + '</div>' +
      '<div class="line-content">' + node.content + '</div>';
  },
  'line choice': function(node) {
    return formatters.line(node);
  },
  set: function(node, extras) {
    return 'set ' + node.variable + ' ' + node.op + ' ' + JSON.stringify(node.value) +
      ' (' + JSON.stringify(extras.before) + ' &rarr; ' + JSON.stringify(extras.after) + ')';
  }
};

var processors = {
  line: function(node) {
    return Promise.delay(500)
      .then(function() {
        addMessage(node);
        return node.next;
      })
      .tap(function() {
        return Promise.delay(500);
      });
  },
  choice: function(node) {
    return new Promise(function(resolve, reject) {
      console.log('choice-node', node);
      node.choices.filter(function(choice) {
        if (choice.condition) {
          return evalCondition(choice.condition);
        } else {
          return true;
        }
      }).map(function(choice) {
        console.log('choice', choice);
        return $('<a></a>')
          .attr('href', '#')
          .text(choice.content)
          .on('click', function(e) {
            e.preventDefault();
            $choiceListPanel.hide();
            $choiceList.empty();
            addMessage({type: 'line choice', name: node.name, content: choice.content, choice: true});
            resolve(choice.next);
          });
      }).forEach(function($el) {
        $('<li></li>')
          .append($el)
          .appendTo($choiceList);
      });
      $choiceListPanel.show();
    });
  },
  set: function(node) {
    console.log(node);
    var before = state[node.variable];
    if (node.op === '=' || (node.op === '?=' && state[node.variable] == null)) state[node.variable] = node.value;

    if (node.op === '+=' || node.op === '-=') {
      if (state[node.variable] == null) state[node.variable] = 0;
      state[node.variable] = node.op === '+=' ? state[node.variable] + node.value : state[node.variable] - node.value;
    }
    updateState();
    addMessage(node, {before: before, after: state[node.variable]});
    return node.next;
  },
  note: function(node) {
    return node.next;
  },
  go: function(node) {
    return node.next;
  },
  exec: function(node) {
    addMessage(node);
    return node.next;
  },
  branch: function(node) {
    console.log(node);
  }
};

var scrollTimer = null;
function updateScroll() {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(function() {
    $body.stop().animate({scrollTop: document.body.scrollHeight - $window.height()}, 200);
  }, 50);
}

function evalCondition(condition) {
  return !!state[condition.expression] === condition.is;
}

var state = {},
    nodes;

function updateState() {
  $state.text(JSON.stringify(state, null, 2));
}

function addMessage(node, extras) {
  if (formatters[node.type]) {
    var $li = $(document.createElement('li'))
      .addClass("message-" + node.type)
      .append(formatters[node.type](node, extras))
      .appendTo($messageList);

    updateScroll();
  } else {
    console.log('No formatter for node', node.type, node);
  }
}

function processNode(id) {
  var node = nodes[id];
  console.log(id, node);
  state.node = node._id;
  updateState();
  if (processors[node.type]) {
    return Promise.resolve(processors[node.type](node))
      .then(processNode);
  } else {
    throw new TypeError("Unknown type of node: " + node.type);
  }
}

function run(ast) {
  $runner.show();
  $stopButton.show();
  $editor.hide();
  $runButton.hide();

  var state = {};
  updateState();

  nodes = ast.nodes;
  processNode(ast.start)
    .catch(function(e) {
      console.error(e);
      throw e;
    });
}

function clearRunner() {
  $runner.hide();
  $stopButton.hide();
  $editor.show();
  $runButton.show();

  state = {};
  updateState();
  $messageList.empty();
  $choiceList.empty();
  $choiceListPanel.hide();
}
