var remote = require('remote'),
    browserWindow = remote.getCurrentWindow(),
    dialog = remote.require('dialog'),
    fs = require('fs'),
    parse = remote.require('./app/parser.js'),
    astUtils = remote.require('./lib/ast'),
    app = remote.require('app');

var originalFile = null,
    isEdited = false,
    fileName = null;

var codemirror = CodeMirror(document.querySelector('.codemirror'), {
  mode: 'oulipo',
  theme: 'solarized light',
  indentUnit: 2,
  smartIndent: false,
  tabSize: true,
  indentWithTabs: false,
  electricChars: false,
  lineWrapping: true,
  lineNumbers: true,
  inputStyle: 'textarea'
});

function change() {
  isEdited = originalFile !== codemirror.getValue();
  // For some reason, calling this within the change function causes two line breaks to be inserted when pressing enter. No idea why.
  setTimeout(function () {browserWindow.setDocumentEdited(isEdited);}, 10);
}
codemirror.on('change', change);

var $window = $(window),
    $body = $(document.body);

function resizeCodeMirror() {
  var height = $window.height() - 64;
  codemirror.display.wrapper.style.height = height + 'px';
  codemirror.refresh();
}
resizeCodeMirror();

$(window).on('resize', resizeCodeMirror);
$('.btn').on('click', function(e) {
  e.target.blur();
});

$('.button-new').on('click', function() {newFile();});
$('.button-open').on('click', function() {openFile();});
$('.button-save').on('click', function() {saveFile();});
$('.button-run').on('click', function() {runScript();});

newFile();

function newFile() {
  if (isEdited && confirm('If you create a new file, you\'ll lose your changes! Would you like to save first?')) {
    saveFile();
  }

  codemirror.setValue('');
  codemirror.clearHistory();
  fileName = null;
  browserWindow.setRepresentedFilename('');
}

function openFile(name) {
  var file;

  if (isEdited && confirm('If you open a file, you\'ll lose your changes! Would you like to save first?')) {
    saveFile();
  }

  if (!name) {
    file = dialog.showOpenDialog(browserWindow, {
      title: 'Open Script',
      properties: ['openFile'],
      filters: [
        { name: 'Oulipo Scripts', extensions: ['oulipo', 'oul'] },
        { name: 'Text Files', extensions: ['txt', 'md'] }
      ]
    });

    if (!file || !file[0]) return;
    file = file[0];
  } else {
    file = name;
  }

  originalFile = fs.readFileSync(file, {encoding: 'utf-8'});
  codemirror.setValue(originalFile);
  codemirror.clearHistory();
  fileName = file;
  app.addRecentDocument(file);
  browserWindow.setRepresentedFilename(file);
}

function saveFile(as) {
  if (as || !fileName) {
    file = dialog.showSaveDialog(browserWindow, {
      title: 'Save Script',
      filters: [
        { name: 'Oulipo Script', extensions: ['oulipo', 'oul'] },
        { name: 'Text File', extensions: ['txt', 'md'] }
      ]
    });
    if (file) {
      fileName = file;
      browserWindow.setRepresentedFilename(file);
    } else {
      return;
    }
  }

  originalFile = codemirror.getValue();
  fs.writeFileSync(fileName, originalFile, {encoding: 'utf-8'});
  app.addRecentDocument(fileName);
  change();
}

function exportFile() {
  var file = dialog.showSaveDialog(browserWindow, {
    title: 'Export',
    filters: [{ name: 'JSON', extensions: ['json', 'js'] }]
  });

  if (!file) return;
  var ast = parse(codemirror.getValue());
  if (ast.error) {
    console.log(ast.error);
    $('#error-modal-content').text(ast.error);
    $('#error-modal').modal('show');
    return;
  }

  fs.writeFileSync(file, JSON.stringify(astUtils.flatten(astUtils.prepare(ast))), {encoding: 'utf-8'});
}

function runScript() {
  var source = codemirror.getValue();
  var ast = parse(source);

  if (ast.error) {
    console.log(ast.error);
    $('#error-modal-content').text(ast.error);
    $('#error-modal').modal('show');
    return;
  }

  console.log(ast);
}
