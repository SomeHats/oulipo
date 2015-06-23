require! {
  'node-uuid': uuid
  'prelude-ls': {id, partition}
}

walk = (obj, fn) ->
  walked = []
  walker = (obj) !->
    if obj in walked then return
    walked.push obj
    if typeof! obj is \Array
      for item in obj => walker item
    else if typeof! obj is \Object
      fn obj
      for key, value of obj => walker value

  walker obj

export prepare = (ast, existing-sections = []) ->
  [section-array, nodes] = partition ( .type is \section ), ast

  prepare-fns = {
    line: id
    set: id
    note: id
    exec: id
    continue: id

    choice: (node) ->
      for choice in node.choices
        if typeof choice.next is \string
          choice.next = sections[choice.next]
        else if typeof! choice.next is \Array
          choice.next = prepare-lines choice.next, node.next
        else throw new TypeError "Bad type of choice.next: '#{choice.next}'"

    go: (node) ->
      node.next = sections[node.to]
      delete node.to

    branch: (node) ->
      for branch in node.branches
        branch.next = prepare-lines branch.next, node.next
  }

  sections = {[node.name, node.lines.0] for node in section-array}

  prepare-lines = (nodes, final-next = null) ->
    for node, i in nodes
      if nodes[i + 1]
        node.next = that
      else node.next = final-next
      if prepare-fns[node.type]
        prepare-fns[node.type] node
      else throw new TypeError "Bad node type '#{node.type}'"

    nodes.0

  prepare-lines nodes
  for section in section-array => prepare-lines section.lines

  nodes.0

export flatten = (ast) ->
  nodes = {}

  walk ast, (node) ->
    if node.type
      node._id = uuid.v4!
      nodes[node._id] = node

  for id, node of nodes
    if node.next then node.next = node.next._id
    if typeof! node.choices is \Array
      for choice in node.choices when typeof choice.next is \object
        choice.next = choice.next._id

  {start: ast._id, nodes}
