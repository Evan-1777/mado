//go:build !windows

package main

// setNativeClipboard is a no-op fallback on non-Windows platforms.
func setNativeClipboard(text string) error {
	_ = text
	return nil
}
