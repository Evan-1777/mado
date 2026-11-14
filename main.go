package main

import (
	"os"

	"github.com/egoist/mygo"

	"mado/internal/settings"
)

// The frontend is embedded by `mygo build`, which generates a file in this
// package that calls mygo.SetFrontend, so no embed directive lives here.

// requestCloseEvent asks the frontend to resolve a close request: content and
// dirty state live in the editor, so only the page can save or discard.
var requestCloseEvent = mygo.NewEvent[struct{}]("request-close")

// openFileEvent hands a file opened while the app runs (file association,
// command line or window drop) to the frontend, which runs the unsaved guard.
var openFileEvent = mygo.NewEvent[string]("open-file")

func main() {
	app := NewApp()
	s := app.initState()

	// A file association launch passes the document as the first argument.
	if len(os.Args) > 1 && os.Args[1] != "" {
		app.SetStartupFile(os.Args[1])
	}

	mygo.App.OnOpenFile(func(path string) {
		if app.window() == nil {
			app.SetStartupFile(path)
			return
		}
		_ = openFileEvent.Emit(app.window(), path)
	})

	// Native dialogs, the window frame and the page's prefers-color-scheme
	// follow the persisted theme.
	if s.Theme == "light" {
		mygo.Theme.SetSource(mygo.ThemeLight)
	} else {
		mygo.Theme.SetSource(mygo.ThemeDark)
	}

	mygo.App.SetName("Mado")
	mygo.Bind(app)
	mygo.App.OnWindowAllClosed(func() { mygo.App.Quit() })

	mygo.App.WhenReady(func() {
		win := mygo.NewWindow(mygo.WindowOptions{
			Title:     "Mado",
			URL:       "/",
			Width:     s.WindowWidth,
			Height:    s.WindowHeight,
			MinWidth:  settings.MinWindowWidth,
			MinHeight: settings.MinWindowHeight,
			Maximized: s.WindowMaximized,
			// The window stays hidden until the frontend has built the real UI
			// and applied the persisted theme; showing it earlier exposes an
			// empty window as a startup flash.
			Hidden:    true,
			// A hidden title bar keeps the native shadow, rounded corners and
			// all eight resize edges while the page draws its own MD3 bar.
			TitleBarStyle:     mygo.TitleBarHidden,
			HideWindowButtons: true,
			// Linked: --md-sys-color-surface-container in frontend/src/tokens.css
			BackgroundColor: "light-dark(#eeedf4, #1e1f25)",
		})
		app.setWindow(win)

		win.OnClose(func(e *mygo.CloseEvent) {
			// Clean state or an already-confirmed quit closes directly; a dirty
			// editor forwards the decision to the frontend, which saves
			// (content lives in CodeMirror) and then ForceQuits.
			if !app.shouldPreventClose() {
				return
			}
			e.PreventDefault()
			_ = requestCloseEvent.Emit(win, struct{}{})
		})
	})

	if err := mygo.App.Run(); err != nil {
		println("Error:", err.Error())
	}
}
