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
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()
	// Windows file association launches the exe as: mado.exe "C:\path\file.md".
	if len(os.Args) > 1 && os.Args[1] != "" {
		app.SetStartupFile(os.Args[1])
	}

	err := wails.Run(&options.App{
		Title:     "Mado",
		Width:     1280,
		Height:    800,
		MinWidth:  720,
		MinHeight: 520,
		Frameless: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 15, G: 17, B: 23, A: 1},
		OnStartup:        app.startup,
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			// Clean state or an already-confirmed quit closes directly; a dirty
			// editor forwards the decision to the frontend via request-close,
			// which saves (content lives in CodeMirror) and then ForceQuits.
			if app.quitting || !app.dirty {
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
