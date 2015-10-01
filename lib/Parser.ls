require! {
  'prelude-ls': {last, empty, replicate, tail, find-index, take, drop}
  'fs'
}

EOL = \\n
match-EOL = /\r\n|\r|\n/
match-EOL-global = /\r\n|\r|\n/g

module.exports = class Parser
  parse-default: ->
    @parse-dialogue 0, allow-sections: true

  # Main parser:
  parse-dialogue: (min-indent = 0, {allow-sections = false, return-on-section = false} = {}) ->
    @consume /\s/
    base-indent = @current-indent!
    if base-indent < min-indent then throw '[parse-dialogue] Unexpected dedent'
    lines = []

    while @current-indent! >= base-indent and @pos < @source.length
      switch
      | @ch! is \# and allow-sections =>
        if return-on-section then return lines else lines[*] = @parse-section!
      | @ch!.match match-EOL => @next!
      | otherwise => lines[*] = @parse-statement!

      @consume /\s/

    lines

  parse-statement: ->
    | @ch!.match /[A-Z]/ => @parse-line-or-choice!
    | @ch!.match /[a-z]/ => @parse-instruction!
    | @ch! is \[ => @parse-note!
    | otherwise => throw "[parse-dialogue] Unexpected '#{@ch!}'"

  # Complex structures to parse:
  parse-line-or-choice: ->
    name = @parse-name!
    @consume ' '
    if @ch!.match match-EOL
      if name.annotations then throw "[parse-line-or-choice] Name shouldn't include annotations"
      @next!
      choices = @parse-choice-list!
      {type: \choice, name, choices}
    else
      content = @parse-string!
      {type: \line, name, content}

  parse-instruction: ->
    name = @parse-identifier!
    @consume ' '
    switch name
    | \set => @parse-instruction-set!
    | \go, \goto => @parse-instruction-go!
    | \exec => @parse-instruction-exec!
    | \branch => @parse-instruction-branch!
    | \continue => @parse-instruction-continue!
    | otherwise => throw "Unknown command '#{name}'. Character names for lines of dialogue must start with a capital letter"

  parse-section: ->
    @next! # Skip over starting '#'
    @consume ' '
    name = @parse-identifier!
    lines = @parse-dialogue 0, allow-sections: true, return-on-section: true
    {type: \section, name, lines}

  parse-note: ->
    depth = 1
    note = ''
    while depth > 0
      switch @next!
      | \[ => depth++
      | \] => depth--

      note += @ch!

    @next!
    note .= replace /]$/ '' .trim!
    {type: \note, contents: note}

  # Nested choices:
  parse-choice-list: ->
    base-indent = @consume-indent!
    choices = []
    while @current-indent! >= base-indent and @ch!.match /[\-\*\+]/ and @pos < @source.length
      @next!
      @consume ' '
      choices.push @parse-choice!
      @consume /\s/

    if choices.length is 0 then throw 'Cannot have empty choice-list'
    choices

  parse-choice: ->
    if @ch! is \(
      condition = @parse-condition!
      @consume ' '

    if @ch! is \[
      @next!
      @consume ' '
      annotations = @parse-annotations!
      @consume ' '
      if annotations.length is 0 then throw "[parse-choice] Expected annotations, got #{@ch!}"
      if @ch! is \]
        @next!
        @consume ' '
      else throw "[parse-choice] Expected ], got #{@ch!}"

    if @ch! in [\' \"]
      content = @parse-quoted-string!
      @consume ' '
      if @ch! is '-' and @peek! is '>'
        @next 2
        @consume ' '
        next = @parse-identifier!
      else
        @consume ' '
        if @ch!.match match-EOL
          @next!
          next = @parse-dialogue!
        else throw "[parse-choice] Unexpected '#{@ch!}', expected newline"
    else
      content = ''
      loop
        if @ch! is '-' and @peek! is '>'
          @next 2
          @consume ' '
          next = @parse-identifier!
          break
        else if @ch!.match match-EOL
          @next!
          next = @parse-dialogue!
          break
        else
          content += @ch!
          @next!

    {content, next, condition, annotations}

  parse-condition: ->
    @next! # skip over opening '('
    type = @parse-identifier!
    if type not in <[if unless default]> then throw "Condition type must be if or unless, not '#type'. If you are trying to start a line with a bracket, wrap the line in speach marks."
    value = {
      if: true
      unless: false
      default: {default: true}
    }[type]

    expression = @parse-expression 1

    @next!
    if type is \default and expression.exp.length isnt 0 then throw "Default condition should have no expression"
    {expression, is: value}

  # Instructions/commands
  parse-instruction-set: ->
    variable = @parse-identifier!
    @consume ' '
    if @ch!.match match-EOL then return {type: \set, op: \=, value: true, variable}
    op = @consume /[\=\-\+\?]/
    if op not in <[ = -= += ?= ]> then throw "Unknown set operation: '#op'"
    @consume ' '
    value = @parse-value!
    {type: \set, variable, op, value}

  parse-instruction-go: ->
    {type: \go, to: @parse-identifier!}

  parse-instruction-exec: ->
    {type: \exec, js: @parse-string!}

  parse-instruction-branch: ->
    if @ch! is \: then @next!
    @consume /\s/

    base-indent = @current-indent!
    branches = []
    while @current-indent! >= base-indent and @ch!.match /[\-\*\+]/ and @pos < @source.length
      @next!
      @consume ' '
      if @ch! isnt '(' then throw "[parse-instruction-branch] Unexpected '#{@ch!}': branch option should start with a condition"
      condition = @parse-condition!
      @consume ' '
      statement = @parse-statement!
      @consume /\s/

      indent = @current-indent!
      if indent > base-indent
        statements = [statement] ++ @parse-dialogue indent
      else statements = [statement]

      branches[*] = {condition, next: statements}

    {type: \branch, branches}

  parse-instruction-continue: ->
    @consume ' '
    {type: \continue}

  # Literal values etc.
  parse-expression: ->
    binary-precedence = <[& | == != < > <= >= + - * /]>
    unary-precedence = <[!]>
    binary-split-on = (op, obj) ->
      if typeof! obj is \Array
        if obj.length is 1 then return obj.0
        i = find-index ( .op is op ), obj
        unless i? then return obj
        return {
          type: \operator
          op: op
          left: binary-split-on op, (take i, obj)
          right: binary-split-on op, (drop i + 1, obj)
        }
      else if typeof obj is \object
        if obj.left then obj.left = binary-split-on op, obj.left
        if obj.right then obj.right = binary-split-on op, obj.right
        if obj.exp then obj.exp = binary-split-on op, obj.exp
        return obj
      else throw new TypeError "Cannot split on #{obj}"

    unary-split-on = (op, obj) ->
      if typeof! obj is \Array
        if obj.length is 1 then return obj.0
        i = find-index ( .op is op ), obj
        unless i? then return obj
        return {
          type: \unary
          op: op
          exp: unary-split-on op, (drop i + 1, obj)
        }
      else if typeof obj is \object
        if obj.left then obj.left = unary-split-on op, obj.left
        if obj.right then obj.right = unary-split-on op, obj.right
        if obj.exp then obj.exp = unary-split-on op, obj.exp
        return obj
      else throw new TypeError "Cannot split on #{obj}"

    tokens = []
    while @pos < @source.length
      @consume ' '
      if @ch! is \(
        @next!
        tokens[*] = @parse-expression!
      else if @ch! is \)
        @next!
        break
      else
        tokens[*] = @parse-exp-item!

    for token in tokens when token.type is \operator and token.op in <[is isnt and or not]>
      token.op = {is: '==', isnt: '!=', and: '&', or: '|', not: '!'}[token.op]

    exp = tokens
    for op in binary-precedence => exp = binary-split-on op, exp
    for op in unary-precedence => exp = unary-split-on op, exp, true

    {type: \expression, exp}

  parse-exp-item: ->
    | @match /^(&|\||==|!=|<|>|<=|>=|\+|\-|\*|\/|!|isnt|is|and|or|not)/, true => type: \operator, op: that
    | @match /^\-?[0-9]+(\.[0-9]+)?/, true => type: \number, val: parse-float that
    | @match /^(true|false)/, true => type: \boolean, val: (if that is \true then true else false)
    | @match /^[a-zA-Z_][a-zA-Z0-9_\-\.]*/, true => type: \identifier, val: that
    | @ch! in [\' \"] => type: \string, val: @parse-quoted-string!
    | otherwise => throw "[parse-exp-item] Unexpected '#{@ch!}'"

  parse-name: ->
    name = @consume /[a-zA-Z0-9_-]/
    @consume ' '
    if name.length is 0 then throw "Expexted name, got #{@ch!}"
    if @ch! is '['
      @next!
      @consume ' '
      annotations = @parse-annotations!
      @consume ' '
      if annotations.length is 0 then throw "Expected annotations, got #{@ch!}"
      if @ch! is ']'
        @next!
        @consume ' '
      else throw "Expected ']', got #{@ch!}"

    if @ch! is ':'
      @next!
      console.log {name, annotations}
      return {name, annotations}
    else throw "Expected ':', got #{@ch!}"

  parse-annotations: ->
    @consume ' '
    annotations = []
    while @ch! isnt ']'
      annotations[*] = @parse-value!
      @consume ' '

    console.log '[parse-annotations]' annotations

    annotations

  parse-value: ->
    | @ch!.match /[0-9\-\.]/ => @parse-number!
    | @ch! in [\' \"] => @parse-quoted-string!
    | @ch!.match /[a-zA-Z_-]/ =>
      id = @parse-identifier!
      if id is \true then true else if id is \false then false else id
    | otherwise => throw "[parse-value] Unexpected #{@ch!}"

  parse-number: -> parse-float @consume /[0-9\-\.]/

  parse-string: ->
    if @ch! in [\' \"]
      @parse-quoted-string!
    else
      @parse-line-string!

  parse-quoted-string: ->
    quote = @ch!
    string = ''
    while @next! isnt quote
      if @pos > @source.length then throw "Unterminated string: #{string}"
      if @ch! is \\
        @next!
      string += @ch!

    @next!
    string

  parse-line-string: ->
    string = @consume /[^\n\r]/
    @next!
    string

  parse-identifier: ->
    res = @match /^[a-zA-Z_][a-zA-Z0-9_\-\.\:]*/, true
    res

  # Utilities:
  parse: (source) ->
    @source = source.replace /\r\n|\r/, \\n
    @source += \\n
    @pos = 0

    try
      return @parse-default!
    catch e
      console.log e.stack if e.stack
      throw new Error @log-pos(e.message || e)

  ch: -> @source[@pos] or '\n'

  peek: (n = 1) -> @source[@pos + n]

  next: (n = 1) -> @source[@pos += n]
  prev: (n = 1) -> @source[@pos -= n]

  match: (regex, consume = true) ->
    m = @source.slice @pos .match regex
    if m and consume
      m = m.0
      @next m.length
      m
    else m

  consume: (regex) ->
    consumed = ''
    while @ch!.match regex and @pos < @source.length
      consumed += @ch!
      @next!

    consumed

  consume-indent: ->
    @consume /[ \t]/ .length

  current-indent: (at = @pos)  ->
    indent-level = 0
    indenting = true
    for i from 0 til at
      if indenting and @source[i].match /[ \t]/
        indent-level++
      else if @source[i].match match-EOL
        indent-level = 0
        indenting = true
      else indenting = false

    indent-level

  line: (at = @pos) -> @line-ch at .0

  line-ch: (at = @pos) ->
    line = 1
    char = 0
    for i from 0 til Math.min @source.length - 1, at
      char++
      if @source[i].match match-EOL
        line++
        char = 0

    [line, char]

  log-pos: (msg = '', at = @pos) ->
    [line, char] = @line-ch at
    """
    At line #line, character #{char + 1}: '#{@ch!.replace match-EOL-global, '\\n'}'
    #{(@source.split match-EOL)[line - 1]}
    #{replicate(char, '~').join ''}^ #{msg}
    """
