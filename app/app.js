var remote = require('remote'),
    browserWindow = remote.getCurrentWindow(),
    dialog = remote.require('dialog'),
    fs = require('fs');

var originalFile = null,
    isEdited = false,
    fileName = null;

var codemirror = CodeMirror(document.querySelector('.codemirror'), {
  lineNumbers: true,
  indentUnit: 4,
  smartIndent: true,
  indentWithTaps: false,
  electricChars: true,
  lineWrapping: true,
  autofocus: true,
  theme: 'solarized light'
});

function change() {
  browserWindow.setDocumentEdited(isEdited = originalFile !== codemirror.getValue());
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

$('.button-new').on('click', newFile);
$('.button-open').on('click', openFile);
$('.button-save').on('click', saveFile);
$('.button-run').on('click', runScript);

newFile();

function newFile() {
  if (isEdited && confirm('If you create a new file, you\'ll lose your changes! Would you like to save first?')) {
    saveFile();
  }

  codemirror.setValue('');
  fileName = null;
  browserWindow.setRepresentedFilename('');
}

function openFile() {
  if (isEdited && confirm('If you open a file, you\'ll lose your changes! Would you like to save first?')) {
    saveFile();
  }

  var file = dialog.showOpenDialog(browserWindow, {
    title: 'Open Script',
    properties: ['openFile'],
    filters: [
      { name: 'Oulipo Scripts', extensions: ['oulipo', 'oul'] },
      { name: 'Text Files', extensions: ['txt', 'md'] }
    ]
  });

  if (!file || !file[0]) return;
  file = file[0];

  originalFile = fs.readFileSync(file, {encoding: 'utf-8'});
  codemirror.setValue(originalFile);
  fileName = file;
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
  change();
}

function runScript() {
}

