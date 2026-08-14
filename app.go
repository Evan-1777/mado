// Package main is the Wails application entrypoint for Mado.
package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"mado/internal/filesys"
	"mado/internal/mdrender"
	"mado/internal/settings"
	"mado/internal/theme"
)

// App is the root Wails-bound application object. All exported methods are
// exposed to the frontend.
type App struct {
	ctx      context.Context
	settings settings.Settings
}

// NewApp creates the application instance.
func NewApp() *App {
	return &App{}
}

// startup saves the context and loads persisted settings. It runs before the
// window is shown.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	s, err := settings.Load()
	if err != nil {
		// Best effort: fall back to defaults.
		s = settings.Settings{Theme: settings.DefaultTheme}
	}
	a.settings = s
}

// LoadFile reads a file from disk and records it as the last-opened file.
func (a *App) LoadFile(path string) (string, error) {
	content, err := filesys.ReadFile(path)
	if err != nil {
		return "", err
	}
	if err := filesys.SetLastFile(path); err != nil {
		return "", err
	}
	a.SetTitle(filepath.Base(path))
	return content, nil
}

// SaveFile writes content to path and records the path as last-opened.
func (a *App) SaveFile(path, content string) error {
	if err := filesys.WriteFile(path, content); err != nil {
		return err
	}
	if err := filesys.SetLastFile(path); err != nil {
		return err
	}
	a.SetTitle(filepath.Base(path))
	return nil
}

// Render converts Markdown source to safe HTML for the preview pane.
func (a *App) Render(md string) (string, error) {
	return mdrender.Render(md)
}

// GetWelcome returns the last-opened file path, creating the welcome document
// on first launch.
func (a *App) GetWelcome() (string, error) {
	return filesys.GetLastFile()
}

// GetCSS returns the composed preview stylesheet for the active theme.
func (a *App) GetCSS() (string, error) {
	return theme.ThemeCSS(a.settings.Theme)
}

// GetSettings returns the active persisted settings.
func (a *App) GetSettings() (settings.Settings, error) {
	return a.settings, nil
}

// SetTheme persists a new theme and refreshes the window chrome.
func (a *App) SetTheme(themeName string) error {
	if themeName != "light" && themeName != "dark" {
		return errors.New("SetTheme: unknown theme " + themeName)
	}
	a.settings.Theme = themeName
	if err := settings.Save(a.settings); err != nil {
		return err
	}
	runtime.WindowSetDarkTheme(a.ctx)
	if themeName == "light" {
		runtime.WindowSetLightTheme(a.ctx)
	}
	return nil
}

// SetTitle updates the window title and the custom title bar text.
func (a *App) SetTitle(title string) {
	if a.ctx == nil {
		return
	}
	runtime.WindowSetTitle(a.ctx, "Mado — "+title)
	runtime.EventsEmit(a.ctx, "title", title)
}

// ConfirmDiscard asks the user to confirm discarding unsaved changes.
// Returns true when it is safe to proceed.
func (a *App) ConfirmDiscard() bool {
	if a.ctx == nil {
		return true
	}
	answer, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "Mado",
		Message:       "Discard unsaved changes?",
		Buttons:       []string{"Discard", "Cancel"},
		DefaultButton: "Cancel",
		CancelButton:  "Cancel",
	})
	if err != nil {
		return true
	}
	return answer == "Discard"
}

// quitConfirm asks the user whether to quit; used by the title bar close
// button and OnBeforeClose.
func (a *App) quitConfirm() bool {
	if a.ctx == nil {
		return true
	}
	answer, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "Mado",
		Message:       "Close Mado?",
		Buttons:       []string{"Close", "Cancel"},
		DefaultButton: "Cancel",
		CancelButton:  "Cancel",
	})
	if err != nil {
		return true
	}
	return answer == "Close"
}

// QuitApp is invoked by the title bar close button. It asks for confirmation
// and quits when accepted.
func (a *App) QuitApp() {
	if a.quitConfirm() {
		runtime.Quit(a.ctx)
	}
}

// pickFile opens the native open-file dialog.
func (a *App) pickFile() (string, error) {
	f, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Markdown file",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown", Pattern: "*.md;*.markdown;*.mdown;*.txt"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", err
	}
	if f == "" {
		return "", os.ErrNotExist // user cancelled
	}
	return f, nil
}

// OpenFileDialog opens the native open-file dialog and returns the selected
// path (empty string when cancelled).
func (a *App) OpenFileDialog() string {
	f, err := a.pickFile()
	if err != nil {
		return ""
	}
	return f
}

// OnFileDrop handles a file dragged onto the window. Only the first .md-like
// file is loaded.
func (a *App) OnFileDrop(x, y int, paths []string) {
	for _, p := range paths {
		ext := strings.ToLower(filepath.Ext(p))
		if ext == ".md" || ext == ".markdown" || ext == ".mdown" || ext == ".txt" {
			_, err := a.LoadFile(p)
			if err == nil {
				runtime.EventsEmit(a.ctx, "file-loaded", p)
			}
			return
		}
	}
}
