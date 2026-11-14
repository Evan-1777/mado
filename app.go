// Package main is the MyGo application entrypoint for Mado.
package main

import (
	"errors"
	"os"
	"path/filepath"
	"sync"

	"github.com/egoist/mygo"

	"mado/internal/filesys"
	"mado/internal/mdrender"
	"mado/internal/settings"
	"mado/internal/theme"
)

// App is the root application service bound to the frontend. All exported
// methods are callable from the page.
type App struct {
	mu       sync.RWMutex
	win      *mygo.Window
	settings settings.Settings
	// saveSettings persists preferences. Tests override it to inject a
	// failing store instead of making the real settings.json unwritable.
	saveSettings func(settings.Settings) error
	// setLastFile records the last path. Tests override it to inject a failure.
	setLastFile func(string) error
	// saveFileDialog opens the native save dialog. Tests override it so the
	// dialog contract can be asserted without a running host.
	saveFileDialog func(defaultFilename string) (string, error)
	dirty          bool
	quitting       bool
	// startupFile is the path the app was launched with, or a path opened
	// before the frontend read the startup value. startupConsumed records that
	// the frontend has taken that value, after which opens are delivered on the
	// open-file event instead. Both are guarded by mu.
	startupFile     string
	startupConsumed bool
}

// NewApp creates the application instance.
func NewApp() *App {
	return &App{}
}

// migrateLegacyStore copies settings from src to dst if dst does not exist yet.
func migrateLegacyStore(src, dst string) error {
	if _, err := os.Stat(dst); err == nil {
		return nil // dst already exists: do not overwrite
	}
	data, err := os.ReadFile(src)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // src doesn't exist: nothing to migrate
		}
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

// initState migrates the legacy user-directory store and loads the persisted
// settings. It runs before the window is created and never creates a user
// configuration directory.
func (a *App) initState() settings.Settings {
	if dst, err := settings.Path(); err == nil {
		if configDir, err := os.UserConfigDir(); err == nil {
			src := filepath.Join(configDir, settings.AppDir, "settings.json")
			_ = migrateLegacyStore(src, dst)
		}
	}
	s := settings.Default()
	if loaded, err := settings.Load(); err == nil {
		s = loaded
	}
	a.mu.Lock()
	a.settings = s
	a.mu.Unlock()
	return s
}

// setWindow registers the main window once the host created it.
func (a *App) setWindow(win *mygo.Window) {
	a.mu.Lock()
	a.win = win
	a.mu.Unlock()
}

// window returns the main window, or nil before the host created it. Native
// host APIs panic when they are called before the event loop runs, so every
// caller guards on a non-nil window.
func (a *App) window() *mygo.Window {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.win
}

// ShowWindow reveals the window. The frontend calls it once the real UI and
// the persisted theme are in place, so the first visible frame is complete.
func (a *App) ShowWindow() {
	if win := a.window(); win != nil {
		win.Show()
	}
}

// LoadFile reads a file from disk and records it as the last-opened file.
func (a *App) LoadFile(path string) (string, error) {
	content, err := filesys.ReadFile(path)
	if err != nil {
		return "", err
	}
	a.recordLastFile(path)
	return content, nil
}

func (a *App) recordLastFile(path string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	setLastFile := a.setLastFile
	if setLastFile == nil {
		setLastFile = filesys.SetLastFile
	}
	_ = setLastFile(path)
}

// SaveFile writes content to path and records the path as last-opened.
func (a *App) SaveFile(path, content string) error {
	if err := filesys.WriteFile(path, content); err != nil {
		return err
	}
	a.recordLastFile(path)
	return nil
}

// Render converts Markdown source to safe HTML for the preview pane.
func (a *App) Render(md string) (string, error) {
	a.mu.RLock()
	math := a.settings.Math
	a.mu.RUnlock()
	return mdrender.Render(md, math)
}

// GetCSS returns the composed preview stylesheet for the active theme and
// preview font.
func (a *App) GetCSS() (string, error) {
	a.mu.RLock()
	themeName := a.settings.Theme
	a.mu.RUnlock()
	return a.GetThemeCSS(themeName)
}

// GetThemeCSS returns the composed preview stylesheet for the requested theme
// and active preview font.
func (a *App) GetThemeCSS(themeName string) (string, error) {
	a.mu.RLock()
	font := a.settings.PreviewFont
	a.mu.RUnlock()
	return theme.ThemeCSS(themeName, font)
}

// GetSettings returns the active persisted settings.
func (a *App) GetSettings() (settings.Settings, error) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.settings, nil
}

// persist applies mutate to a copy of the settings and saves the copy. The
// copy is adopted only when the save succeeded, so a failed write leaves the
// in-memory settings untouched and GetCSS/GetSettings stay consistent with
// what is actually on disk.
func (a *App) persist(mutate func(*settings.Settings)) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	save := a.saveSettings
	if save == nil {
		save = settings.Save
	}
	next := a.settings
	mutate(&next)
	if err := save(next); err != nil {
		return err
	}
	a.settings = next
	return nil
}

// SetTheme persists a new theme and syncs the native appearance source, which
// drives the native dialogs, the window frame and the page's
// prefers-color-scheme. The theme source is only touched once the window
// exists, so offline unit tests never wait on the main thread.
func (a *App) SetTheme(themeName string) error {
	if themeName != "light" && themeName != "dark" {
		return errors.New("SetTheme: unknown theme " + themeName)
	}
	if err := a.persist(func(s *settings.Settings) { s.Theme = themeName }); err != nil {
		return err
	}
	if a.window() == nil {
		return nil
	}
	if themeName == "light" {
		mygo.Theme.SetSource(mygo.ThemeLight)
	} else {
		mygo.Theme.SetSource(mygo.ThemeDark)
	}
	return nil
}

// SetWrap persists the editor word-wrap preference.
func (a *App) SetWrap(wrap bool) error {
	return a.persist(func(s *settings.Settings) { s.Wrap = wrap })
}

// SetMath persists the LaTeX math rendering preference.
func (a *App) SetMath(math bool) error {
	return a.persist(func(s *settings.Settings) { s.Math = math })
}

// SetPreviewFont validates and persists the preview font preference. The
// value is normalized (trimmed) by the settings module; invalid names are
// rejected without touching the stored state.
func (a *App) SetPreviewFont(font string) error {
	name, err := settings.NormalizePreviewFont(font)
	if err != nil {
		return err
	}
	return a.persist(func(s *settings.Settings) { s.PreviewFont = name })
}

// SetWindowSize persists the window normal width and height.
func (a *App) SetWindowSize(width, height int) error {
	if width < settings.MinWindowWidth {
		width = settings.MinWindowWidth
	}
	if height < settings.MinWindowHeight {
		height = settings.MinWindowHeight
	}
	return a.persist(func(s *settings.Settings) {
		s.WindowWidth = width
		s.WindowHeight = height
	})
}

// SetWindowMaximized persists whether the window is currently maximised.
func (a *App) SetWindowMaximized(maximized bool) error {
	return a.persist(func(s *settings.Settings) {
		s.WindowMaximized = maximized
	})
}

// SetClipboard copies text to the system clipboard using host-bound native channels.
func (a *App) SetClipboard(text string) error {
	return setNativeClipboard(text)
}

// setStartupFile records the file path passed on the command line (used by
// Windows "Open with" file association launches).
func (a *App) setStartupFile(path string) {
	a.mu.Lock()
	a.startupFile = path
	a.mu.Unlock()
}

// GetStartupFile returns the file path the app was launched with, or an empty
// string when none was given. Reading it marks the startup value as consumed,
// so a later open is delivered on the open-file event instead of being
// buffered.
func (a *App) GetStartupFile() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	path := a.startupFile
	a.startupConsumed = true
	return path
}

// handleOpenFile routes a file the host opened. Before the frontend has read
// the startup value the path replaces that buffer and nothing is emitted;
// afterwards the path is emitted on the window, when there is one.
func (a *App) handleOpenFile(path string) (*mygo.Window, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.startupConsumed {
		a.startupFile = path
		return nil, false
	}
	if a.win != nil {
		return a.win, true
	}
	return nil, false
}

// SetDirty records whether the editor has unsaved changes. It is used by
// the close guard so that closing only asks for confirmation when changes
// would be lost.
func (a *App) SetDirty(dirty bool) {
	a.mu.Lock()
	a.dirty = dirty
	a.mu.Unlock()
}

// shouldPreventClose returns one consistent snapshot for the synchronous
// close hook.
func (a *App) shouldPreventClose() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return !a.quitting && a.dirty
}

// ForceQuit exits without any prompt. The quitting flag makes the close hook
// allow the close instead of re-emitting request-close.
func (a *App) ForceQuit() {
	a.mu.Lock()
	a.quitting = true
	a.mu.Unlock()
	if a.window() != nil {
		mygo.App.Quit()
	}
}

// OpenFileDialog opens the native open-file dialog and returns the selected
// path (empty string when cancelled or before the window exists).
func (a *App) OpenFileDialog() string {
	if a.window() == nil {
		return ""
	}
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{
		Parent: a.window(),
		Title:  "Open Markdown file",
		Filters: []mygo.FileFilter{
			{Name: "Markdown", Extensions: []string{"md", "markdown", "mdown", "txt"}},
			{Name: "All files", Extensions: []string{"*"}},
		},
	})
	if err != nil || len(paths) == 0 {
		return ""
	}
	return paths[0]
}

// SaveFileDialog opens the native save-file dialog and returns the chosen
// path (empty string when cancelled or before the window exists). Used when
// saving an untitled document.
func (a *App) SaveFileDialog() string {
	if a.window() == nil {
		return ""
	}
	path, err := mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:      a.window(),
		Title:       "Save Markdown file",
		DefaultPath: "untitled.md",
		Filters: []mygo.FileFilter{
			{Name: "Markdown", Extensions: []string{"md", "markdown", "mdown", "txt"}},
		},
	})
	if err != nil {
		return ""
	}
	return path
}

// SaveHtmlFileDialog opens the native save-file dialog for exporting to HTML and
// returns the chosen path (empty string when cancelled, error when the dialog
// fails to open).
func (a *App) SaveHtmlFileDialog(defaultFilename string) (string, error) {
	if defaultFilename == "" {
		defaultFilename = "untitled.html"
	}
	if a.saveFileDialog != nil {
		return a.saveFileDialog(defaultFilename)
	}
	if a.window() == nil {
		return "", nil
	}
	return mygo.Dialog.Save(mygo.SaveDialogOptions{
		Parent:      a.window(),
		Title:       "导出为 HTML",
		DefaultPath: defaultFilename,
		Filters: []mygo.FileFilter{
			{Name: "HTML 文档", Extensions: []string{"html", "htm"}},
		},
	})
}

// SaveHtmlFile writes UTF-8 HTML text atomically to path.
func (a *App) SaveHtmlFile(path, content string) error {
	if path == "" {
		return errors.New("SaveHtmlFile: empty path")
	}
	return filesys.WriteFile(path, content)
}
