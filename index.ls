require! {
  'prelude-ls': {last, empty, replicate}
  'fs'
}

source = fs.read-file-sync './example.md', encoding: 'utf-8'

class Parser
  (source) ->
    @source = source

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
      | @ch!.match /[A-Z]/ => lines[*] = @parse-line-or-choice!
      | @ch!.match /[a-z]/ => lines[*] = @parse-instruction!
      | @ch! is \# and allow-sections =>
        if return-on-section then return lines else lines[*] = @parse-section!
      | @ch! is \\n => @next!
      | otherwise => throw "[parse-dialogue] Unexpected '#{@ch!}"

      @consume /\s/

    lines

  # Complex structures to parse:
  parse-line-or-choice: ->
    name = @parse-name!
    @consume ' '
    if @ch! is \\n
      @next!
      choices = @parse-choice-list!
      {type: \choice, name, choices}
    else
      string = @parse-string!
      {type: \line, name, string}

  parse-instruction: ->
    name = @parse-identifier!
    @consume ' '
    switch name
    | \set => @parse-instruction-set!
    | \go, \goto => @parse-instruction-go!
    | \exec => @parse-instruction-exec!
    | otherwise => throw "Unknown command '#{name}'. Character names for lines of dialogue must start with a capital letter"

  parse-section: ->
    @next! # Skip over starting '#'
    @consume ' '
    name = @parse-identifier!
    lines = @parse-dialogue 0, allow-sections: true, return-on-section: true
    {type: \section, name, lines}

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
    if @ch! in [\' \"]
      string = @parse-quoted-string!
      @consume ' '
      if @ch! is '-' and @peek! is '>'
        @next 2
        @consume ' '
        next = @parse-identifier!
      else
        @consume ' '
        if @ch! is \\n
          @next!
          next = @parse-dialogue!
        else throw "[parse-choice] Unexpected '#{@ch!}', expected newline"
    else
      string = ''
      loop
        if @ch! is '-' and @peek! is '>'
          @next 2
          @consume ' '
          next = @parse-identifier!
          break
        else if @ch! is \\n
          @next!
          next = @parse-dialogue!
          break
        else
          string += @ch!
          @next!

    {string, next}

  # Instructions/commands
  parse-instruction-set: ->
    variable = @parse-identifier!
    @consume ' '
    if @ch! is \\n then return {type: \set, op: \=, value: true, variable}
    op = @consume /[\=\-\+\?]/
    if op not in <[ = -= += ?= ]> then throw "Unknown set operation: '#op'"
    @consume ' '
    value = @parse-value!
    {type: \set, variable, op, value}

  parse-instruction-go: ->
    {type: \go, to: @parse-identifier!}

  parse-instruction-exec: ->
    {type: \exec, js: @parse-string!}

  # Literal values etc.
  parse-name: ->
    name = ''
    loop
      if @ch!.match /[a-zA-Z0-9_-]/
        name += @ch!
      else if @ch! is ':'
        if name.length is 0
          throw 'Expected name, got :'
        else
          @next!
          return name
      else throw "Bad name character: #{@ch!}"
      @next!

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
        @log-pos 'Quoted character'
      string += @ch!

    @next!
    string

  parse-line-string: ->
    string = @consume /[^\n]/
    @next!
    string

  parse-identifier: ->
    @consume /[a-zA-Z0-9\.\-\_]/

  start: ->
    @pos = 0

    try
      return @parse-default!
    catch e
      @log-pos e

  ch: -> @source[@pos] or '\n'

  peek: (n = 1) -> @source[@pos + n]

  next: (n = 1) -> @source[@pos += n]

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
      else if @source[i] is \\n
        indent-level = 0
        indenting = true
      else indenting = false

    indent-level

  line: (at = @pos) -> @line-ch at .0

  line-ch: (at = @pos) ->
    line = 1
    char = 0
    for i from 0 til at
      char++
      if @source[i] is \\n
        line++
        char = 0

    [line, char]

  log-pos: (msg = '', at = @pos) ->
    [line, char] = @line-ch at
    console.log "\nAt line #line, character #char: '#{@ch!}'"
    console.log (@source.split \\n)[line - 1]
    console.log "#{replicate char, '~' .join ''}^", msg


console.log (require \util).inspect (new Parser source .start!), depth: null, colors: true
