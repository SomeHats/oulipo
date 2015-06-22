require! {
  'app'
  'browser-window': BrowserWindow
  'menu': Menu
}

main-window = null
ready = false
to-open = null

app.on \window-all-closed -> app.quit!

app.on \open-file (e, file) ->
  if ready
    exec "openFile(#{JSON.stringify file})"
  else to-open := file

app.on \ready ->
  main-window := new BrowserWindow width: 1024, height: 768, 'min-width': 780, 'min-height': 600
  # main-window.open-dev-tools!
  main-window.on \closed -> main-window := null
  main-window.web-contents.on \did-finish-load ->
    ready := true
    if to-open
      exec "openFile(#{JSON.stringify to-open})"
      to-open := null

  main-window.load-url "file://#{__dirname}/app/index.html"
  set-menu!

exec = (js) ->
  console.log 'exec' js
  main-window.web-contents.execute-java-script js

set-menu = ->
  menu = Menu.build-from-template [
    * label: 'Oulipo'
      submenu:
        * label: 'About Oulipo'
          selector: \orderFrontStandardAboutPanel:

        * type: \separator

        * label: 'Services'
          submenu: []

        * type: \separator

        * label: 'Hide Oulipo'
          accelerator: \Command+H
          selector: \hide:
        * label: 'Hide Others'
          accelerator: \Command+Shift+H
          selector: \hideOtherApplications:
        * label: 'Show All'
          selector: \unhide-all-applications:

        * type: \separator

        * label: 'Quit'
          accelerator: \Command+Q
          selector: \terminate:

    * label: 'File'
      submenu:
        * label: 'New'
          accelerator: \Command+N
          click: -> exec 'newFile()'
        * label: 'Open'
          accelerator: \Command+O
          click: -> exec 'openFile()'
        * label: 'Save'
          accelerator: \Command+S
          click: -> exec 'saveFile()'
        * label: 'Save As'
          accelerator: \Command+Shift+S
          click: -> exec 'saveFile(true)'
        * type: \separator
        * label: 'Export'
          accelerator: \Command+E
          click: -> exec 'exportFile()'
        * label: 'Run'
          accelerator: \Command+R
          click: -> exec 'runScript()'

    * label: 'Edit'
      submenu:
        * label: 'Undo'
          accelerator: \Command+Z
          selector: \undo:
        * label: 'Redo'
          accelerator: \Command+Shift+Z
          selector: \redo:
        * type: \separator
        * label: 'Cut'
          accelerator: \Command+X
          selector: \cut:
        * label: 'Copy'
          accelerator: \Command+C
          selector: \copy:
        * label: 'Paste'
          accelerator: \Command+V
          selector: \paste:
        * label: 'Select All'
          accelerator: \Command+A
          selector: \selectAll:

    * label: 'Window'
      submenu:
        * label: 'Reload'
          accelerator: \Command+Shift+R
          click: -> BrowserWindow.get-focused-window!.reload!
        * label: 'Toggle DevTools'
          accelerator: \Alt+Command+I
          click: -> BrowserWindow.get-focused-window!.toggle-dev-tools!

        * type: \separator

        * label: 'Minimize'
          accelerator: \Command+M
          selector: \performMiniaturize:
        * label: 'Close'
          accelerator: \Command+W
          selector: \performClose:

    * label: 'Help'
      submenu: []
  ]
  Menu.set-application-menu menu

