package main

import (
	"context"
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mado/internal/settings"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	// Windows file association launches the exe as: mado.exe "C:\path\file.md".
	if len(os.Args) > 1 && os.Args[1] != "" {
		app.SetStartupFile(os.Args[1])
	}

	s := settings.Default()
	if loaded, err := settings.Load(); err == nil {
		s = loaded
	}
	app.settings = s

	startState := options.Normal
	if s.WindowMaximized {
		startState = options.Maximised
	}

	// Match the window surface to the saved theme so a frame WebView2 has not
	// covered yet uses the app frame colour instead of near-black.
	// Linked: --dark-frame / --light-frame in frontend/src/style.css
	background := &options.RGBA{R: 32, G: 32, B: 32, A: 1}
	if s.Theme == "light" {
		background = &options.RGBA{R: 243, G: 243, B: 243, A: 1}
	}

	err := wails.Run(&options.App{
		Title:            "Mado",
		Width:            s.WindowWidth,
		Height:           s.WindowHeight,
		MinWidth:         settings.MinWindowWidth,
		MinHeight:        settings.MinWindowHeight,
		WindowStartState: startState,
		// The window stays hidden until the frontend has built the real UI and
		// applied the persisted theme; showing it earlier exposes the empty
		// dark WebView2 surface as a startup flash.
		StartHidden: true,
		Frameless:   true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: background,
		OnStartup:        app.startup,
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			// Clean state or an already-confirmed quit closes directly; a dirty
			// editor forwards the decision to the frontend via request-close,
			// which saves (content lives in CodeMirror) and then ForceQuits.
			if !app.shouldPreventClose() {
				return false
			}
			runtime.EventsEmit(ctx, "request-close")
			return true
		},
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			Theme: windows.Dark,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
